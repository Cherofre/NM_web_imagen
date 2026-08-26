use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow,
};
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
mod windows_runtime;
#[cfg(windows)]
use windows_runtime::{ensure_webview2_runtime, BackendJob, SingleInstanceGuard};
mod updater;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeInfo {
    mode: &'static str,
    api_base: String,
    token: String,
    data_root: String,
    outputs_root: String,
    log_path: String,
    version: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationScan {
    source_root: String,
    file_count: usize,
    image_count: usize,
    session_count: usize,
    history_count: usize,
    total_bytes: u64,
}

#[derive(Deserialize)]
struct StorageSettings {
    outputs_root: Option<String>,
}

#[derive(Serialize)]
struct OutputDirectoryChange {
    path: String,
    restart_required: bool,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedWindowState {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

impl Default for SavedWindowState {
    fn default() -> Self {
        Self {
            x: 120,
            y: 80,
            width: 1440,
            height: 900,
            maximized: false,
        }
    }
}

struct DesktopRuntimeState {
    info: DesktopRuntimeInfo,
    outputs_root: Mutex<String>,
    child: Mutex<Option<Child>>,
    window: Mutex<SavedWindowState>,
    close_allowed: AtomicBool,
    #[cfg(windows)]
    _backend_job: BackendJob,
}

#[tauri::command]
fn desktop_runtime_info(state: State<'_, DesktopRuntimeState>) -> DesktopRuntimeInfo {
    let mut info = state.info.clone();
    if let Ok(outputs_root) = state.outputs_root.lock() {
        info.outputs_root = outputs_root.clone();
    }
    info
}

fn window_state_path(data_root: &Path) -> PathBuf {
    data_root.join("desktop-window.json")
}

fn storage_settings_path(data_root: &Path) -> PathBuf {
    data_root.join("desktop-storage.json")
}

fn normalized_absolute_path(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| format!("failed to resolve current directory: {error}"))?
            .join(path)
    };
    Ok(absolute)
}

fn is_same_or_nested(path: &Path, root: &Path) -> bool {
    let path = path
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    let root = root
        .to_string_lossy()
        .replace('/', "\\")
        .to_ascii_lowercase();
    path == root || path.starts_with(&(root + "\\"))
}

fn paths_equal_case_insensitive(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .replace('/', "\\")
        .eq_ignore_ascii_case(&right.to_string_lossy().replace('/', "\\"))
}

fn configured_outputs_root(data_root: &Path) -> PathBuf {
    let default_root = data_root.join("outputs");
    let Ok(raw) = fs::read_to_string(storage_settings_path(data_root)) else {
        return default_root;
    };
    let Ok(settings) = serde_json::from_str::<StorageSettings>(&raw) else {
        return default_root;
    };
    let Some(value) = settings
        .outputs_root
        .filter(|value| !value.trim().is_empty())
    else {
        return default_root;
    };
    let candidate = PathBuf::from(value);
    if candidate.is_absolute() {
        candidate
    } else {
        data_root.join(candidate)
    }
}

fn write_storage_settings(data_root: &Path, outputs_root: &Path) -> Result<(), String> {
    let path = storage_settings_path(data_root);
    let temp = path.with_extension("json.tmp");
    let payload = serde_json::json!({
        "outputs_root": outputs_root.to_string_lossy(),
    });
    fs::write(
        &temp,
        serde_json::to_vec_pretty(&payload)
            .map_err(|error| format!("failed to serialize storage settings: {error}"))?,
    )
    .map_err(|error| format!("failed to write storage settings: {error}"))?;
    fs::rename(&temp, &path).map_err(|error| format!("failed to commit storage settings: {error}"))
}

fn is_image_file(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp"
    )
}

fn collect_files(root: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        fs::read_dir(root).map_err(|error| format!("无法读取目录 {}: {error}", root.display()))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取目录项: {error}"))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取文件类型 {}: {error}", path.display()))?;
        if file_type.is_symlink() {
            return Err(format!("迁移源包含不支持的符号链接: {}", path.display()));
        }
        if file_type.is_dir() {
            collect_files(&path, files)?;
        } else if file_type.is_file() {
            files.push(path);
        }
    }
    Ok(())
}

fn migration_outputs_root(source: &Path) -> Result<PathBuf, String> {
    let source = normalized_absolute_path(source)?;
    let source = fs::canonicalize(&source)
        .map_err(|error| format!("无法访问所选目录 {}: {error}", source.display()))?;
    let candidates = [
        source.join("outputs"),
        source.join("output"),
        source.join("data").join("outputs"),
        source.join("data").join("output"),
        source.clone(),
    ];
    for candidate in &candidates {
        if !candidate.is_dir() {
            continue;
        }
        if candidate.join("history.json").is_file()
            || candidate.join("studio_sessions.json").is_file()
            || candidate.join("session_refs").is_dir()
            || candidate
                .read_dir()
                .ok()
                .into_iter()
                .flatten()
                .filter_map(Result::ok)
                .any(|entry| is_image_file(&entry.path()))
        {
            return Ok(candidate.clone());
        }
    }

    let mut pending = vec![(source.clone(), 0usize)];
    let mut inspected = 0usize;
    while let Some((directory, depth)) = pending.pop() {
        if depth >= 3 || inspected >= 256 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok) {
            if inspected >= 256 {
                break;
            }
            inspected += 1;
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() || !file_type.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if matches!(
                name.as_str(),
                ".git" | ".runtime" | "node_modules" | "vendor"
            ) {
                continue;
            }
            if matches!(name.as_str(), "outputs" | "output") {
                if path.join("history.json").is_file()
                    || path.join("studio_sessions.json").is_file()
                    || path.join("session_refs").is_dir()
                    || path
                        .read_dir()
                        .ok()
                        .into_iter()
                        .flatten()
                        .filter_map(Result::ok)
                        .any(|child| is_image_file(&child.path()))
                {
                    return Ok(path);
                }
            }
            pending.push((path, depth + 1));
        }
    }

    Err(format!(
        "所选目录 {} 中没有找到 outputs、output、会话或成图文件。",
        source.display()
    ))
}

fn json_array_count(path: &Path, key: &str) -> usize {
    let Ok(raw) = fs::read_to_string(path) else {
        return 0;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return 0;
    };
    value
        .get(key)
        .and_then(|value| value.as_array())
        .map(|items| items.len())
        .unwrap_or(0)
}

fn scan_migration_source(source: &Path) -> Result<MigrationScan, String> {
    let source_root = migration_outputs_root(source)?;
    let mut files = Vec::new();
    collect_files(&source_root, &mut files)?;
    let total_bytes = files
        .iter()
        .filter_map(|path| fs::metadata(path).ok().map(|meta| meta.len()))
        .sum();
    let image_count = files.iter().filter(|path| is_image_file(path)).count();
    Ok(MigrationScan {
        source_root: source_root.to_string_lossy().into_owned(),
        file_count: files.len(),
        image_count,
        session_count: json_array_count(&source_root.join("studio_sessions.json"), "sessions"),
        history_count: json_array_count(&source_root.join("history.json"), "entries"),
        total_bytes,
    })
}

fn copy_directory_contents(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|error| format!("无法创建目标目录 {}: {error}", target.display()))?;
    let mut files = Vec::new();
    collect_files(source, &mut files)?;
    for source_file in files {
        let relative = source_file
            .strip_prefix(source)
            .map_err(|error| format!("无法计算迁移相对路径: {error}"))?;
        let target_file = target.join(relative);
        if let Some(parent) = target_file.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("无法创建目标子目录 {}: {error}", parent.display()))?;
        }
        fs::copy(&source_file, &target_file).map_err(|error| {
            format!(
                "复制文件失败 {} -> {}: {error}",
                source_file.display(),
                target_file.display()
            )
        })?;
    }
    Ok(())
}

fn backup_directory(path: &Path) -> Result<Option<PathBuf>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("outputs");
    let backup = path.with_file_name(format!("{name}.backup-{stamp}"));
    fs::rename(path, &backup)
        .map_err(|error| format!("无法备份现有目录 {}: {error}", path.display()))?;
    Ok(Some(backup))
}

fn replace_directory_contents(source: &Path, target: &Path) -> Result<Option<PathBuf>, String> {
    let backup = backup_directory(target)?;
    if let Err(error) = copy_directory_contents(source, target) {
        let _ = fs::remove_dir_all(target);
        if let Some(backup_path) = &backup {
            let _ = fs::rename(backup_path, target);
        }
        return Err(error);
    }
    Ok(backup)
}

fn normalized_window_state(state: SavedWindowState) -> SavedWindowState {
    SavedWindowState {
        width: state.width.clamp(760, 7680),
        height: state.height.clamp(640, 4320),
        ..state
    }
}

fn load_window_state(data_root: &Path) -> SavedWindowState {
    fs::read_to_string(window_state_path(data_root))
        .ok()
        .and_then(|raw| serde_json::from_str::<SavedWindowState>(&raw).ok())
        .map(normalized_window_state)
        .unwrap_or_default()
}

fn window_state_intersects_monitor(window: &WebviewWindow, state: SavedWindowState) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return false;
    };
    let left = i64::from(state.x);
    let top = i64::from(state.y);
    let right = left + i64::from(state.width);
    let bottom = top + i64::from(state.height);
    monitors.iter().any(|monitor| {
        let position = monitor.position();
        let size = monitor.size();
        let monitor_left = i64::from(position.x);
        let monitor_top = i64::from(position.y);
        let monitor_right = monitor_left + i64::from(size.width);
        let monitor_bottom = monitor_top + i64::from(size.height);
        right > monitor_left + 80
            && left < monitor_right - 80
            && bottom > monitor_top + 48
            && top < monitor_bottom - 48
    })
}

fn restore_window_state(window: &WebviewWindow, state: SavedWindowState) -> Result<(), String> {
    let state = normalized_window_state(state);
    window
        .set_size(PhysicalSize::new(state.width, state.height))
        .map_err(|error| format!("failed to restore window size: {error}"))?;
    if window_state_intersects_monitor(window, state) {
        window
            .set_position(PhysicalPosition::new(state.x, state.y))
            .map_err(|error| format!("failed to restore window position: {error}"))?;
    } else {
        window
            .center()
            .map_err(|error| format!("failed to center the window: {error}"))?;
    }
    if state.maximized {
        window
            .maximize()
            .map_err(|error| format!("failed to restore maximized state: {error}"))?;
    }
    Ok(())
}

fn capture_window_state(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Some(state) = app.try_state::<DesktopRuntimeState>() else {
        return;
    };
    let maximized = window.is_maximized().unwrap_or(false);
    let Ok(mut saved) = state.window.lock() else {
        return;
    };
    saved.maximized = maximized;
    if maximized {
        return;
    }
    if let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) {
        saved.x = position.x;
        saved.y = position.y;
        saved.width = size.width;
        saved.height = size.height;
        *saved = normalized_window_state(*saved);
    }
}

fn save_window_state(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<DesktopRuntimeState>() else {
        return;
    };
    let Ok(saved) = state.window.lock() else {
        return;
    };
    let Ok(serialized) = serde_json::to_string_pretty(&*saved) else {
        return;
    };
    let _ = fs::write(
        window_state_path(Path::new(&state.info.data_root)),
        serialized,
    );
}

#[cfg(windows)]
fn open_in_explorer(path: &Path, select_file: bool) -> Result<(), String> {
    let mut command = Command::new("explorer.exe");
    if select_file {
        command.arg("/select,");
    }
    command.arg(path);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("failed to open {}: {error}", path.display()))
}

#[cfg(not(windows))]
fn open_in_explorer(path: &Path, _select_file: bool) -> Result<(), String> {
    Err(format!(
        "opening local folders is only supported on Windows: {}",
        path.display()
    ))
}

#[tauri::command]
fn desktop_open_outputs_directory(state: State<'_, DesktopRuntimeState>) -> Result<(), String> {
    let outputs_root = state
        .outputs_root
        .lock()
        .map_err(|_| "无法读取当前存图目录".to_string())?
        .clone();
    let path = Path::new(&outputs_root);
    fs::create_dir_all(path)
        .map_err(|error| format!("failed to create outputs directory: {error}"))?;
    open_in_explorer(path, false)
}

#[tauri::command]
fn desktop_open_data_directory(state: State<'_, DesktopRuntimeState>) -> Result<(), String> {
    open_in_explorer(Path::new(&state.info.data_root), false)
}

#[cfg(windows)]
fn choose_folder_dialog(title: &str) -> Result<Option<PathBuf>, String> {
    const SCRIPT: &str = r#"
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = $env:NM_IMAGE_STUDIO_FOLDER_DIALOG_TITLE
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::Write($dialog.SelectedPath)
}
"#;
    let output = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            SCRIPT,
        ])
        .env("NM_IMAGE_STUDIO_FOLDER_DIALOG_TITLE", title)
        .stdin(Stdio::null())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("无法打开文件夹选择器: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if selected.is_empty() {
        Ok(None)
    } else {
        Ok(Some(PathBuf::from(selected)))
    }
}

#[cfg(not(windows))]
fn choose_folder_dialog(_title: &str) -> Result<Option<PathBuf>, String> {
    Err("文件夹选择器仅支持 Windows 桌面版".to_string())
}

#[tauri::command]
fn desktop_choose_folder(title: String) -> Result<Option<String>, String> {
    Ok(choose_folder_dialog(&title)?.map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn desktop_documents_outputs_directory(app: tauri::AppHandle) -> Result<String, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|error| format!("无法定位 Windows 文档目录: {error}"))?;
    Ok(documents
        .join("NM Image Studio")
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn desktop_default_outputs_directory(state: State<'_, DesktopRuntimeState>) -> String {
    Path::new(&state.info.data_root)
        .join("outputs")
        .to_string_lossy()
        .into_owned()
}

#[tauri::command]
fn desktop_scan_migration(source: String) -> Result<MigrationScan, String> {
    scan_migration_source(Path::new(&source))
}

#[tauri::command]
fn desktop_import_data(
    source: String,
    state: State<'_, DesktopRuntimeState>,
) -> Result<serde_json::Value, String> {
    let source_root = migration_outputs_root(Path::new(&source))?;
    let current_outputs_root = state
        .outputs_root
        .lock()
        .map_err(|_| "无法读取当前存图目录".to_string())?
        .clone();
    let target_root = PathBuf::from(current_outputs_root);
    if is_same_or_nested(&source_root, &target_root)
        || is_same_or_nested(&target_root, &source_root)
    {
        return Err("迁移源目录不能与当前存图目录相同或互相嵌套。".to_string());
    }
    let scan = scan_migration_source(&source_root)?;
    let backup = replace_directory_contents(&source_root, &target_root)?;
    Ok(serde_json::json!({
        "scan": scan,
        "targetRoot": target_root.to_string_lossy(),
        "backupRoot": backup.map(|path| path.to_string_lossy().into_owned()),
    }))
}

#[tauri::command]
fn desktop_set_outputs_directory(
    path: String,
    state: State<'_, DesktopRuntimeState>,
) -> Result<OutputDirectoryChange, String> {
    let target_root = normalized_absolute_path(Path::new(&path))?;
    let current_root = PathBuf::from(
        state
            .outputs_root
            .lock()
            .map_err(|_| "无法读取当前存图目录".to_string())?
            .clone(),
    );
    if is_same_or_nested(&target_root, &current_root)
        || is_same_or_nested(&current_root, &target_root)
    {
        if paths_equal_case_insensitive(&target_root, &current_root) {
            return Ok(OutputDirectoryChange {
                path: target_root.to_string_lossy().into_owned(),
                restart_required: false,
            });
        }
        return Err("新的存图目录不能与当前目录相同或互相嵌套。".to_string());
    }
    fs::create_dir_all(&target_root)
        .map_err(|error| format!("无法创建新的存图目录 {}: {error}", target_root.display()))?;
    replace_directory_contents(&current_root, &target_root)?;
    write_storage_settings(Path::new(&state.info.data_root), &target_root)?;
    state
        .outputs_root
        .lock()
        .map_err(|_| "无法更新当前存图目录".to_string())?
        .clone_from(&target_root.to_string_lossy().into_owned());
    Ok(OutputDirectoryChange {
        path: target_root.to_string_lossy().into_owned(),
        restart_required: false,
    })
}

#[tauri::command]
fn desktop_open_backend_log(state: State<'_, DesktopRuntimeState>) -> Result<(), String> {
    open_in_explorer(Path::new(&state.info.log_path), true)
}

#[tauri::command]
fn desktop_open_downloads_directory(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        let path = app
            .path()
            .download_dir()
            .map_err(|error| format!("downloads directory is unavailable: {error}"))?;
        fs::create_dir_all(&path)
            .map_err(|error| format!("failed to create downloads directory: {error}"))?;
        open_in_explorer(&path, false)
    }
    #[cfg(not(windows))]
    {
        Err("opening the downloads directory is only supported on Windows".to_string())
    }
}

#[cfg(windows)]
fn open_backend_debug_console(log_path: &Path) -> Result<Child, String> {
    const SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$logPath = $env:NM_IMAGE_STUDIO_BACKEND_LOG
if ([string]::IsNullOrWhiteSpace($logPath)) {
    throw 'Backend log path is unavailable.'
}
if (-not (Test-Path -LiteralPath $logPath)) {
    New-Item -ItemType File -Path $logPath -Force | Out-Null
}
$Host.UI.RawUI.WindowTitle = 'NM Image Studio - Backend Debug'
Write-Host 'NM Image Studio 后台调试日志' -ForegroundColor Cyan
Write-Host ('日志文件: ' + $logPath)
Write-Host '关闭此窗口不会关闭应用或后端。' -ForegroundColor DarkGray
Write-Host ''
Get-Content -LiteralPath $logPath -Tail 200 -Wait
"#;

    Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-NoExit",
            "-Command",
            SCRIPT,
        ])
        .env("NM_IMAGE_STUDIO_BACKEND_LOG", log_path)
        .stdin(Stdio::null())
        .creation_flags(0x00000010)
        .spawn()
        .map_err(|error| format!("failed to open backend debug console: {error}"))
}

#[cfg(not(windows))]
fn open_backend_debug_console(log_path: &Path) -> Result<Child, String> {
    Err(format!(
        "opening the backend debug console is only supported on Windows: {}",
        log_path.display()
    ))
}

#[tauri::command]
fn desktop_open_backend_console(state: State<'_, DesktopRuntimeState>) -> Result<(), String> {
    let mut child = open_backend_debug_console(Path::new(&state.info.log_path))?;
    #[cfg(windows)]
    if let Err(error) = state._backend_job.assign(&child) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok(())
}

#[tauri::command]
fn desktop_exit(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn desktop_minimize_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())?
        .hide()
        .map_err(|error| format!("failed to hide main window: {error}"))
}

#[tauri::command]
fn desktop_show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    show_main_window(&app)
}

#[tauri::command]
fn desktop_confirm_close(
    app: tauri::AppHandle,
    behavior: String,
    state: State<'_, DesktopRuntimeState>,
) -> Result<(), String> {
    match behavior.as_str() {
        "tray" => desktop_minimize_to_tray(app),
        "exit" => {
            state.close_allowed.store(true, Ordering::SeqCst);
            app.exit(0);
            Ok(())
        }
        _ => Err("unsupported close behavior".to_string()),
    }
}

fn show_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())?;
    window
        .show()
        .map_err(|error| format!("failed to show main window: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("failed to focus main window: {error}"))
}

#[tauri::command]
fn desktop_reset_window_state(
    app: tauri::AppHandle,
    state: State<'_, DesktopRuntimeState>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window is unavailable".to_string())?;
    window
        .unmaximize()
        .map_err(|error| format!("failed to leave maximized mode: {error}"))?;
    let defaults = SavedWindowState::default();
    window
        .set_size(PhysicalSize::new(defaults.width, defaults.height))
        .map_err(|error| format!("failed to reset window size: {error}"))?;
    window
        .center()
        .map_err(|error| format!("failed to center the window: {error}"))?;
    if let (Ok(position), Ok(mut saved)) = (window.outer_position(), state.window.lock()) {
        *saved = SavedWindowState {
            x: position.x,
            y: position.y,
            ..defaults
        };
    }
    save_window_state(&app);
    Ok(())
}

fn reserve_loopback_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("failed to reserve a loopback port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("failed to inspect the loopback port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn backend_is_ready(port: u16, token: &str) -> bool {
    let deadline = Instant::now() + Duration::from_secs(35);
    while Instant::now() < deadline {
        if let Ok(mut stream) = TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}")
                .parse()
                .expect("valid loopback address"),
            Duration::from_millis(300),
        ) {
            let request = format!(
                "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-NM-Desktop-Token: {token}\r\nConnection: close\r\n\r\n"
            );
            let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = [0_u8; 256];
                if let Ok(size) = stream.read(&mut response) {
                    let status = String::from_utf8_lossy(&response[..size]);
                    if status.starts_with("HTTP/1.1 200") || status.starts_with("HTTP/1.0 200") {
                        return true;
                    }
                }
            }
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn stop_backend(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<DesktopRuntimeState>() {
        if let Ok(mut child) = state.child.lock() {
            if let Some(mut child) = child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn is_portable_install(executable_dir: &Path) -> bool {
    executable_dir.join("portable.mode").is_file()
}

pub fn run() {
    #[cfg(windows)]
    if let Err(error) = ensure_webview2_runtime() {
        eprintln!("{error}");
        return;
    }

    #[cfg(windows)]
    let _single_instance = match SingleInstanceGuard::acquire() {
        Ok(Some(guard)) => guard,
        Ok(None) => return,
        Err(error) => panic!("{error}"),
    };

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(updater::DesktopUpdaterState::default())
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            desktop_open_outputs_directory,
            desktop_open_data_directory,
            desktop_choose_folder,
            desktop_documents_outputs_directory,
            desktop_default_outputs_directory,
            desktop_scan_migration,
            desktop_import_data,
            desktop_set_outputs_directory,
            desktop_open_backend_log,
            desktop_open_downloads_directory,
            desktop_open_backend_console,
            desktop_exit,
            desktop_minimize_to_tray,
            desktop_show_main_window,
            desktop_confirm_close,
            desktop_reset_window_state,
            updater::desktop_check_update,
            updater::desktop_download_update,
            updater::desktop_install_update,
            updater::desktop_open_release_page
        ])
        .setup(|app| {
            let port = reserve_loopback_port().map_err(std::io::Error::other)?;
            let token = Uuid::new_v4().simple().to_string();
            let executable_dir = std::env::current_exe()?
                .parent()
                .map(Path::to_path_buf)
                .ok_or_else(|| {
                    std::io::Error::other("desktop executable directory is unavailable")
                })?;
            let portable = is_portable_install(&executable_dir);
            let data_root = if portable {
                executable_dir.join("data")
            } else {
                app.path().app_local_data_dir()?
            };
            std::fs::create_dir_all(&data_root)?;
            let outputs_root = configured_outputs_root(&data_root);
            std::fs::create_dir_all(&outputs_root)?;
            let log_path = data_root.join("desktop-backend.log");
            let saved_window = load_window_state(&data_root);
            if let Some(window) = app.get_webview_window("main") {
                restore_window_state(&window, saved_window).map_err(std::io::Error::other)?;
            }

            let backend_path = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("backend")
                    .join("nm-image-studio-backend.exe")
            } else if portable {
                executable_dir
                    .join("backend")
                    .join("nm-image-studio-backend.exe")
            } else {
                app.path()
                    .resource_dir()?
                    .join("backend")
                    .join("nm-image-studio-backend.exe")
            };
            #[cfg(windows)]
            let backend_job = BackendJob::new().map_err(std::io::Error::other)?;
            let port_text = port.to_string();
            let mut command = Command::new(&backend_path);
            command
                .args(["--host", "127.0.0.1", "--port", &port_text])
                .current_dir(&data_root)
                .env("IMAGE_TOOL_DATA_ROOT", &data_root)
                .env("IMAGE_TOOL_OUTPUTS_ROOT", &outputs_root)
                .env("IMAGE_TOOL_DESKTOP_MODE", "1")
                .env("IMAGE_TOOL_DESKTOP_TOKEN", &token)
                .env("PYTHONUNBUFFERED", "1")
                .env(
                    "IMAGE_TOOL_DEV_CORS_ORIGINS",
                    "http://localhost:1420,http://tauri.localhost",
                );
            let show_backend_console = std::env::var("NM_IMAGE_STUDIO_BACKEND_CONSOLE")
                .map(|value| {
                    matches!(
                        value.trim().to_ascii_lowercase().as_str(),
                        "1" | "true" | "yes"
                    )
                })
                .unwrap_or(false);
            if show_backend_console {
                command
                    .stdin(Stdio::null())
                    .stdout(Stdio::inherit())
                    .stderr(Stdio::inherit());
                #[cfg(windows)]
                command.creation_flags(0x00000010);
            } else {
                let stdout = OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)?;
                let stderr = stdout.try_clone()?;
                command
                    .stdin(Stdio::null())
                    .stdout(Stdio::from(stdout))
                    .stderr(Stdio::from(stderr));
                #[cfg(windows)]
                command.creation_flags(0x08000000);
            }
            let mut child = command.spawn().map_err(|error| {
                std::io::Error::other(format!(
                    "failed to start desktop backend {}: {error}",
                    backend_path.display()
                ))
            })?;

            #[cfg(windows)]
            if let Err(error) = backend_job.assign(&child) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(std::io::Error::other(error).into());
            }

            if !backend_is_ready(port, &token) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(std::io::Error::other("desktop backend did not become healthy").into());
            }

            app.manage(DesktopRuntimeState {
                info: DesktopRuntimeInfo {
                    mode: if portable {
                        "desktop-portable"
                    } else {
                        "desktop-installed"
                    },
                    api_base: format!("http://127.0.0.1:{port}"),
                    token,
                    data_root: data_root.to_string_lossy().into_owned(),
                    outputs_root: outputs_root.to_string_lossy().into_owned(),
                    log_path: log_path.to_string_lossy().into_owned(),
                    version: env!("CARGO_PKG_VERSION").to_string(),
                },
                outputs_root: Mutex::new(outputs_root.to_string_lossy().into_owned()),
                child: Mutex::new(Some(child)),
                window: Mutex::new(saved_window),
                close_allowed: AtomicBool::new(false),
                #[cfg(windows)]
                _backend_job: backend_job,
            });

            let open = MenuItem::with_id(
                app,
                "open",
                "打开 NM Image Studio / Open",
                true,
                None::<&str>,
            )?;
            let queue =
                MenuItem::with_id(app, "queue", "查看任务队列 / Tasks", true, None::<&str>)?;
            let outputs =
                MenuItem::with_id(app, "outputs", "打开存图夹 / Outputs", true, None::<&str>)?;
            let check_update = MenuItem::with_id(
                app,
                "check-update",
                "检查更新 / Check updates",
                true,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "退出 / Quit", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[&open, &queue, &outputs, &separator, &check_update, &quit],
            )?;
            let mut tray = TrayIconBuilder::with_id("nm-image-studio-tray")
                .menu(&menu)
                .tooltip("NM Image Studio")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        let _ = show_main_window(app);
                    }
                    "queue" => {
                        let _ = app.emit("desktop-tray-queue", ());
                        let _ = show_main_window(app);
                    }
                    "outputs" => {
                        if let Some(state) = app.try_state::<DesktopRuntimeState>() {
                            if let Ok(outputs_root) = state.outputs_root.lock() {
                                let _ = open_in_explorer(Path::new(outputs_root.as_str()), false);
                            }
                        }
                    }
                    "check-update" => {
                        let _ = app.emit("desktop-tray-check-update", ());
                        let _ = show_main_window(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon().cloned() {
                tray = tray.icon(icon);
            }
            tray.build(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build NM Image Studio desktop shell");

    app.run(|handle, event| match event {
        tauri::RunEvent::WindowEvent { label, event, .. } if label == "main" => match event {
            tauri::WindowEvent::Moved(_)
            | tauri::WindowEvent::Resized(_)
            | tauri::WindowEvent::ScaleFactorChanged { .. } => capture_window_state(handle),
            tauri::WindowEvent::CloseRequested { api, .. } => {
                capture_window_state(handle);
                save_window_state(handle);
                if let Some(state) = handle.try_state::<DesktopRuntimeState>() {
                    if !state.close_allowed.swap(false, Ordering::SeqCst) {
                        api.prevent_close();
                        let _ = handle.emit("desktop-close-requested", ());
                    }
                }
            }
            _ => {}
        },
        tauri::RunEvent::Exit => {
            save_window_state(handle);
            stop_backend(handle);
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "nm-image-studio-{label}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn migration_detects_web_and_portable_layouts() {
        let root = test_root("migration-layout");
        let web_root = root.join("web");
        let web_outputs = web_root.join("outputs");
        fs::create_dir_all(web_outputs.join("session_refs")).unwrap();
        fs::write(web_outputs.join("history.json"), br#"{"entries":[{}]}"#).unwrap();
        fs::write(
            web_outputs.join("studio_sessions.json"),
            br#"{"sessions":[{}]}"#,
        )
        .unwrap();
        fs::write(web_outputs.join("result.png"), b"png").unwrap();
        let web_scan = scan_migration_source(&web_root).unwrap();
        assert!(Path::new(&web_scan.source_root).ends_with(Path::new("web").join("outputs")));
        assert_eq!(web_scan.session_count, 1);
        assert_eq!(web_scan.history_count, 1);
        assert_eq!(web_scan.image_count, 1);

        let portable_root = root.join("portable");
        let portable_outputs = portable_root.join("data").join("outputs");
        fs::create_dir_all(&portable_outputs).unwrap();
        fs::write(portable_outputs.join("history.json"), br#"{"entries":[]}"#).unwrap();
        let portable_scan = scan_migration_source(&portable_root).unwrap();
        assert!(Path::new(&portable_scan.source_root)
            .ends_with(Path::new("portable").join("data").join("outputs")));

        let direct_outputs = root.join("direct-outputs");
        fs::create_dir_all(direct_outputs.join("session_refs")).unwrap();
        fs::write(direct_outputs.join("history.json"), br#"{"entries":[]}"#).unwrap();
        fs::write(direct_outputs.join("result.png"), b"png").unwrap();
        let direct_scan = scan_migration_source(&direct_outputs).unwrap();
        assert!(Path::new(&direct_scan.source_root).ends_with(Path::new("direct-outputs")));
        assert_eq!(direct_scan.image_count, 1);

        let nested_parent = root.join("share-root");
        let nested_outputs = nested_parent.join("renamed-project").join("outputs");
        fs::create_dir_all(&nested_outputs).unwrap();
        fs::write(
            nested_outputs.join("studio_sessions.json"),
            br#"{"sessions":[]}"#,
        )
        .unwrap();
        let nested_scan = scan_migration_source(&nested_parent).unwrap();
        assert!(Path::new(&nested_scan.source_root)
            .ends_with(Path::new("renamed-project").join("outputs")));
        let _ = fs::remove_dir_all(root);
    }
}
