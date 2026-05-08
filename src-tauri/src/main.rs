#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod mpv;
mod platform;

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running BiLite");
}
