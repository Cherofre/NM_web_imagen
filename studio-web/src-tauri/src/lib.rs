use serde::Serialize;
use std::{
    fs::OpenOptions,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, State};
use uuid::Uuid;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntimeInfo {
    mode: &'static str,
    api_base: String,
    token: String,
    data_root: String,
}

struct DesktopRuntimeState {
    info: DesktopRuntimeInfo,
    child: Mutex<Option<Child>>,
}

#[tauri::command]
fn desktop_runtime_info(state: State<'_, DesktopRuntimeState>) -> DesktopRuntimeInfo {
    state.info.clone()
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

pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![desktop_runtime_info])
        .setup(|app| {
            let port = reserve_loopback_port().map_err(std::io::Error::other)?;
            let token = Uuid::new_v4().simple().to_string();
            let data_root = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_root)?;

            let backend_path = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("backend")
                    .join("nm-image-studio-backend.exe")
            } else {
                app.path()
                    .resource_dir()?
                    .join("backend")
                    .join("nm-image-studio-backend.exe")
            };
            let stdout = OpenOptions::new()
                .create(true)
                .append(true)
                .open(data_root.join("desktop-backend.log"))?;
            let stderr = stdout.try_clone()?;
            let port_text = port.to_string();
            let mut command = Command::new(&backend_path);
            command
                .args(["--host", "127.0.0.1", "--port", &port_text])
                .current_dir(&data_root)
                .env("IMAGE_TOOL_DATA_ROOT", &data_root)
                .env("IMAGE_TOOL_DESKTOP_TOKEN", &token)
                .env(
                    "IMAGE_TOOL_DEV_CORS_ORIGINS",
                    "http://localhost:1420,http://tauri.localhost",
                )
                .stdin(Stdio::null())
                .stdout(Stdio::from(stdout))
                .stderr(Stdio::from(stderr));
            #[cfg(windows)]
            command.creation_flags(0x08000000);
            let mut child = command.spawn().map_err(|error| {
                std::io::Error::other(format!(
                    "failed to start desktop backend {}: {error}",
                    backend_path.display()
                ))
            })?;

            if !backend_is_ready(port, &token) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(std::io::Error::other("desktop backend did not become healthy").into());
            }

            app.manage(DesktopRuntimeState {
                info: DesktopRuntimeInfo {
                    mode: "desktop-spike",
                    api_base: format!("http://127.0.0.1:{port}"),
                    token,
                    data_root: data_root.to_string_lossy().into_owned(),
                },
                child: Mutex::new(Some(child)),
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build NM Image Studio desktop shell");

    app.run(|handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            stop_backend(handle);
        }
    });
}
