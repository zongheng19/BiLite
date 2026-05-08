use tauri::WebviewWindow;

pub fn get_xid(window: &WebviewWindow) -> Result<String, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window
        .window_handle()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;
    match handle.as_raw() {
        RawWindowHandle::Xlib(h) => Ok(format!("{}", h.window)),
        RawWindowHandle::Xcb(h) => Ok(format!("{}", h.window.get())),
        _ => Err("Unsupported Linux window system".to_string()),
    }
}
