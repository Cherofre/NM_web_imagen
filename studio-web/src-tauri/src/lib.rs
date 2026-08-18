use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
mod windows_runtime;
#[cfg(windows)]
use windows_runtime::{ensure_webview2_runtime, BackendJob, SingleInstanceGuard};

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
    child: Mutex<Option<Child>>,
    window: Mutex<SavedWindowState>,
    #[cfg(windows)]
    _backend_job: BackendJob,
}

#[tauri::command]
fn desktop_runtime_info(state: State<'_, DesktopRuntimeState>) -> DesktopRuntimeInfo {
    state.info.clone()
}

fn window_state_path(data_root: &Path) -> PathBuf {
    data_root.join("desktop-window.json")
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
    let path = Path::new(&state.info.outputs_root);
    fs::create_dir_all(path)
        .map_err(|error| format!("failed to create outputs directory: {error}"))?;
    open_in_explorer(path, false)
}

#[tauri::command]
fn desktop_open_data_directory(state: State<'_, DesktopRuntimeState>) -> Result<(), String> {
    open_in_explorer(Path::new(&state.info.data_root), false)
}

#[tauri::command]
fn desktop_open_backend_log(state: State<'_, DesktopRuntimeState>) -> Result<(), String> {
    open_in_explorer(Path::new(&state.info.log_path), true)
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
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_info,
            desktop_open_outputs_directory,
            desktop_open_data_directory,
            desktop_open_backend_log,
            desktop_open_backend_console,
            desktop_reset_window_state
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
            let outputs_root = data_root.join("outputs");
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
                child: Mutex::new(Some(child)),
                window: Mutex::new(saved_window),
                #[cfg(windows)]
                _backend_job: backend_job,
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build NM Image Studio desktop shell");

    app.run(|handle, event| match event {
        tauri::RunEvent::WindowEvent { label, event, .. } if label == "main" => match event {
            tauri::WindowEvent::Moved(_)
            | tauri::WindowEvent::Resized(_)
            | tauri::WindowEvent::ScaleFactorChanged { .. } => capture_window_state(handle),
            tauri::WindowEvent::CloseRequested { .. } => {
                capture_window_state(handle);
                save_window_state(handle);
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
