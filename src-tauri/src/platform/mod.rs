#[cfg(target_os = "windows")]
pub mod windows;
#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "linux")]
pub mod linux;

use tauri::WebviewWindow;

pub fn get_window_handle(window: &WebviewWindow) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    return windows::get_hwnd(window);
    #[cfg(target_os = "macos")]
    return macos::get_ns_view(window);
    #[cfg(target_os = "linux")]
    return linux::get_xid(window);
}

pub fn get_ipc_path() -> String {
    #[cfg(target_os = "windows")]
    return format!("bilite-mpv-{}", std::process::id());
    #[cfg(unix)]
    return format!("/tmp/bilite-mpv-{}.sock", std::process::id());
}
