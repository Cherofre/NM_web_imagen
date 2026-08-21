use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;

const PORTABLE_ENDPOINT: &str =
    "https://github.com/Cherofre/NM_web_imagen/releases/latest/download/portable-latest.json";
const RELEASE_PAGE: &str = "https://github.com/Cherofre/NM_web_imagen/releases/latest";

pub struct PendingDesktopUpdate {
    pub update: Update,
    pub downloaded: Option<Vec<u8>>,
}

#[derive(Default)]
pub struct DesktopUpdaterState {
    pub pending: Mutex<Option<PendingDesktopUpdate>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopUpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub published_at: Option<String>,
    pub mode: String,
    pub release_page: String,
    pub package_url: Option<String>,
    pub package_name: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum DesktopDownloadEvent {
    Started {
        content_length: Option<u64>,
    },
    Progress {
        downloaded: u64,
        content_length: Option<u64>,
    },
    Finished,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopDownloadResult {
    pub mode: String,
    pub version: String,
    pub ready_to_install: bool,
    pub downloaded_path: Option<String>,
}

fn raw_string(update: &Update, key: &str) -> Option<String> {
    update
        .raw_json
        .get(key)
        .and_then(|value| value.as_str())
        .map(ToOwned::to_owned)
}

fn update_info(update: Option<&Update>, current_version: String, mode: &str) -> DesktopUpdateInfo {
    let Some(update) = update else {
        return DesktopUpdateInfo {
            available: false,
            current_version,
            version: None,
            notes: None,
            published_at: None,
            mode: mode.to_string(),
            release_page: RELEASE_PAGE.to_string(),
            package_url: None,
            package_name: None,
        };
    };
    DesktopUpdateInfo {
        available: true,
        current_version,
        version: Some(update.version.clone()),
        notes: update.body.clone(),
        published_at: update.date.map(|value| value.to_string()),
        mode: mode.to_string(),
        release_page: raw_string(update, "releasePage").unwrap_or_else(|| RELEASE_PAGE.to_string()),
        package_url: Some(update.download_url.to_string()),
        package_name: raw_string(update, "package"),
    }
}

fn updater_error(error: impl std::fmt::Display) -> String {
    format!("desktop updater error: {error}")
}

fn portable_download_name(update: &Update) -> String {
    let from_feed = raw_string(update, "package");
    let from_url = update
        .download_url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned);
    let candidate = from_feed
        .or(from_url)
        .unwrap_or_else(|| format!("NM-Image-Studio-v{}-Portable-x64.zip", update.version));
    let file_name = Path::new(&candidate)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("NM-Image-Studio-Portable-x64.zip");
    let safe = file_name
        .chars()
        .map(|value| match value {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '-' | '_' => value,
            _ => '_',
        })
        .collect::<String>();
    if safe.is_empty() {
        format!("NM-Image-Studio-v{}-Portable-x64.zip", update.version)
    } else {
        safe
    }
}

fn unique_download_path(download_dir: &Path, file_name: &str) -> PathBuf {
    let candidate = download_dir.join(file_name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("NM-Image-Studio-Portable");
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("zip");
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default();
    download_dir.join(format!("{stem}-{stamp}.{extension}"))
}

fn portable_download_path(app: &AppHandle, update: &Update) -> Result<PathBuf, String> {
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|error| updater_error(format!("download directory unavailable: {error}")))?;
    fs::create_dir_all(&download_dir)
        .map_err(|error| updater_error(format!("cannot create download directory: {error}")))?;
    Ok(unique_download_path(
        &download_dir,
        &portable_download_name(update),
    ))
}

#[tauri::command]
pub async fn desktop_check_update(
    app: AppHandle,
    runtime: State<'_, super::DesktopRuntimeState>,
    updater: State<'_, DesktopUpdaterState>,
) -> Result<DesktopUpdateInfo, String> {
    let mode = runtime.info.mode.to_string();
    let current_version = runtime.info.version.clone();
    let update = if mode == "desktop-portable" {
        let endpoint = Url::parse(PORTABLE_ENDPOINT).map_err(updater_error)?;
        app.updater_builder()
            .endpoints(vec![endpoint])
            .map_err(updater_error)?
            .build()
            .map_err(updater_error)?
            .check()
            .await
            .map_err(updater_error)?
    } else {
        app.updater()
            .map_err(updater_error)?
            .check()
            .await
            .map_err(updater_error)?
    };
    let info = update_info(update.as_ref(), current_version, &mode);
    let mut pending = updater
        .pending
        .lock()
        .map_err(|_| updater_error("updater state lock is poisoned"))?;
    *pending = update.map(|value| PendingDesktopUpdate {
        update: value,
        downloaded: None,
    });
    Ok(info)
}

#[tauri::command]
pub async fn desktop_download_update(
    app: AppHandle,
    runtime: State<'_, super::DesktopRuntimeState>,
    updater: State<'_, DesktopUpdaterState>,
    on_event: Channel<DesktopDownloadEvent>,
) -> Result<DesktopDownloadResult, String> {
    let mode = runtime.info.mode.to_string();
    let pending_update = updater
        .pending
        .lock()
        .map_err(|_| updater_error("updater state lock is poisoned"))?
        .as_ref()
        .map(|value| value.update.clone())
        .ok_or_else(|| updater_error("no update is waiting to be downloaded"))?;
    let mut downloaded = 0_u64;
    let mut started = false;
    let bytes = pending_update
        .download(
            |chunk_length, content_length| {
                if !started {
                    started = true;
                    let _ = on_event.send(DesktopDownloadEvent::Started { content_length });
                }
                downloaded = downloaded.saturating_add(chunk_length as u64);
                let _ = on_event.send(DesktopDownloadEvent::Progress {
                    downloaded,
                    content_length,
                });
            },
            || {
                let _ = on_event.send(DesktopDownloadEvent::Finished);
            },
        )
        .await
        .map_err(updater_error)?;

    if mode == "desktop-portable" {
        let target = portable_download_path(&app, &pending_update)?;
        let temporary = target.with_extension("zip.download");
        fs::write(&temporary, &bytes)
            .map_err(|error| updater_error(format!("cannot save portable update: {error}")))?;
        if let Err(error) = fs::rename(&temporary, &target) {
            let _ = fs::remove_file(&temporary);
            return Err(updater_error(format!(
                "cannot finalize portable update: {error}"
            )));
        }
        updater
            .pending
            .lock()
            .map_err(|_| updater_error("updater state lock is poisoned"))?
            .take();
        return Ok(DesktopDownloadResult {
            mode,
            version: pending_update.version,
            ready_to_install: false,
            downloaded_path: Some(target.to_string_lossy().into_owned()),
        });
    }

    updater
        .pending
        .lock()
        .map_err(|_| updater_error("updater state lock is poisoned"))?
        .as_mut()
        .ok_or_else(|| updater_error("update state disappeared during download"))?
        .downloaded = Some(bytes);
    Ok(DesktopDownloadResult {
        mode,
        version: pending_update.version,
        ready_to_install: true,
        downloaded_path: None,
    })
}

#[tauri::command]
pub fn desktop_install_update(
    runtime: State<'_, super::DesktopRuntimeState>,
    updater: State<'_, DesktopUpdaterState>,
    active_queue_count: usize,
) -> Result<(), String> {
    if runtime.info.mode == "desktop-portable" {
        return Err(updater_error(
            "portable builds must replace the application folder from the downloaded ZIP",
        ));
    }
    if active_queue_count > 0 {
        return Err(updater_error(format!(
            "cannot install while {active_queue_count} queue task(s) are active"
        )));
    }
    let pending = updater
        .pending
        .lock()
        .map_err(|_| updater_error("updater state lock is poisoned"))?
        .take()
        .ok_or_else(|| updater_error("no update is ready to install"))?;
    let bytes = pending
        .downloaded
        .ok_or_else(|| updater_error("download the update before installing it"))?;
    pending.update.install(bytes).map_err(updater_error)
}

#[tauri::command]
pub fn desktop_open_release_page() -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer.exe")
            .arg(RELEASE_PAGE)
            .spawn()
            .map(|_| ())
            .map_err(|error| updater_error(format!("cannot open release page: {error}")))
    }
    #[cfg(not(windows))]
    {
        Err(updater_error(
            "opening release pages is only supported on Windows",
        ))
    }
}
