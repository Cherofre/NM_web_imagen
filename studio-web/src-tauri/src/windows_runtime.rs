use std::{
    ffi::c_void,
    mem::{size_of, zeroed},
    os::windows::io::AsRawHandle,
    os::windows::process::CommandExt,
    process::{Child, Command},
    ptr::{null, null_mut},
    thread,
    time::Duration,
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, HWND, LPARAM},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::CreateMutexW,
    },
    UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, MessageBoxW,
        SetForegroundWindow, ShowWindow, MB_ICONERROR, MB_OK, SW_RESTORE,
    },
};

const INSTANCE_MUTEX_NAME: &str = "Local\\NMImageStudioDesktop-v1";
const APP_WINDOW_TITLE: &str = "NM Image Studio";
const WEBVIEW2_CLIENT_ID: &str = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

pub fn ensure_webview2_runtime() -> Result<(), String> {
    let registry_paths = [
        format!(
            r"HKCU\Software\Microsoft\EdgeUpdate\Clients\{}",
            WEBVIEW2_CLIENT_ID
        ),
        format!(
            r"HKLM\Software\Microsoft\EdgeUpdate\Clients\{}",
            WEBVIEW2_CLIENT_ID
        ),
        format!(
            r"HKLM\Software\WOW6432Node\Microsoft\EdgeUpdate\Clients\{}",
            WEBVIEW2_CLIENT_ID
        ),
    ];

    let found = registry_paths.iter().any(|path| {
        Command::new("reg.exe")
            .args(["query", path, "/v", "pv"])
            .creation_flags(0x08000000)
            .output()
            .map(|output| output.status.success() && !output.stdout.is_empty())
            .unwrap_or(false)
    });
    if found {
        return Ok(());
    }

    let title = wide_null("NM Image Studio");
    let message = wide_null(
        "此电脑未检测到 Microsoft Edge WebView2 Runtime，桌面版无法启动。\n\n请先安装 WebView2 Evergreen Runtime，再重新打开 NM Image Studio。\n\n安装入口：\nhttps://developer.microsoft.com/microsoft-edge/webview2/",
    );
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
    Err("Microsoft Edge WebView2 Runtime is required".to_string())
}

pub struct SingleInstanceGuard(HANDLE);

impl SingleInstanceGuard {
    pub fn acquire() -> Result<Option<Self>, String> {
        let name = wide_null(INSTANCE_MUTEX_NAME);
        let handle = unsafe { CreateMutexW(null(), 0, name.as_ptr()) };
        if handle.is_null() {
            return Err(last_error("failed to create the single-instance mutex"));
        }
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            unsafe {
                CloseHandle(handle);
            }
            activate_existing_window();
            return Ok(None);
        }
        Ok(Some(Self(handle)))
    }
}

impl Drop for SingleInstanceGuard {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

pub struct BackendJob(usize);

impl BackendJob {
    pub fn new() -> Result<Self, String> {
        let handle = unsafe { CreateJobObjectW(null(), null()) };
        if handle.is_null() {
            return Err(last_error("failed to create the backend job object"));
        }
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const c_void,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            let error = last_error("failed to configure the backend job object");
            unsafe {
                CloseHandle(handle);
            }
            return Err(error);
        }
        Ok(Self(handle as usize))
    }

    pub fn assign(&self, child: &Child) -> Result<(), String> {
        let assigned =
            unsafe { AssignProcessToJobObject(self.0 as HANDLE, child.as_raw_handle() as HANDLE) };
        if assigned == 0 {
            return Err(last_error("failed to assign the backend to the job object"));
        }
        Ok(())
    }
}

impl Drop for BackendJob {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0 as HANDLE);
        }
    }
}

struct WindowSearch {
    handle: HWND,
}

unsafe extern "system" fn find_app_window(window: HWND, context: LPARAM) -> i32 {
    if IsWindowVisible(window) == 0 {
        return 1;
    }
    let length = GetWindowTextLengthW(window);
    if length <= 0 {
        return 1;
    }
    let mut title = vec![0_u16; length as usize + 1];
    let copied = GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32);
    if copied <= 0 || String::from_utf16_lossy(&title[..copied as usize]) != APP_WINDOW_TITLE {
        return 1;
    }
    let search = &mut *(context as *mut WindowSearch);
    search.handle = window;
    0
}

fn activate_existing_window() {
    for _ in 0..20 {
        let mut search = WindowSearch { handle: null_mut() };
        unsafe {
            EnumWindows(Some(find_app_window), &mut search as *mut _ as LPARAM);
        }
        if !search.handle.is_null() {
            unsafe {
                ShowWindow(search.handle, SW_RESTORE);
                SetForegroundWindow(search.handle);
            }
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain([0]).collect()
}

fn last_error(context: &str) -> String {
    format!("{context}: Windows error {}", unsafe { GetLastError() })
}
