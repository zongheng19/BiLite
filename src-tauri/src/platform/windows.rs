use tauri::WebviewWindow;

pub fn get_hwnd(window: &WebviewWindow) -> Result<String, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window
        .window_handle()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;
    match handle.as_raw() {
        RawWindowHandle::Win32(h) => Ok(format!("{}", h.hwnd.get() as isize)),
        _ => Err("Not a Win32 window".to_string()),
    }
}
