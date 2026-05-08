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

pub fn register_associations(exe_path: &str, extensions: &[String]) -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let classes = hkcu
        .open_subkey_with_flags("Software\\Classes", KEY_WRITE)
        .map_err(|e| e.to_string())?;

    let (app_key, _) = classes
        .create_subkey("BiLite.Player\\shell\\open\\command")
        .map_err(|e| e.to_string())?;
    app_key
        .set_value("", &format!("\"{}\" \"%1\"", exe_path))
        .map_err(|e| e.to_string())?;

    for ext in extensions {
        let (ext_key, _) = classes.create_subkey(ext).map_err(|e| e.to_string())?;
        ext_key
            .set_value("", &"BiLite.Player")
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}
