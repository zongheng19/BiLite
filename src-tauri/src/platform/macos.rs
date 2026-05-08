use tauri::WebviewWindow;

pub fn get_ns_view(window: &WebviewWindow) -> Result<String, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window
        .window_handle()
        .map_err(|e| format!("Failed to get window handle: {}", e))?;
    match handle.as_raw() {
        RawWindowHandle::AppKit(h) => Ok(format!("{}", h.ns_view.as_ptr() as isize)),
        _ => Err("Not an AppKit window".to_string()),
    }
}
