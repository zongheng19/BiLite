use crate::mpv::ipc::MpvIpc;
use crate::mpv::process::MpvProcess;
use crate::storage::config::AppConfig;
use crate::storage::database::{Database, PlaybackRecord};
use serde_json::json;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub mpv_process: Mutex<MpvProcess>,
    pub mpv_ipc: Mutex<Option<MpvIpc>>,
    pub database: Mutex<Database>,
    pub config: Mutex<AppConfig>,
    pub data_dir: PathBuf,
}

#[tauri::command]
pub fn play_file(path: String, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.loadfile(&path)?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_pause(state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.send_command(&[json!("cycle"), json!("pause")])?;
    }
    Ok(())
}

#[tauri::command]
pub fn seek(seconds: f64, mode: String, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.seek(seconds, &mode)?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_volume(volume: f64, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("volume", json!(volume))?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_speed(speed: f64, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("speed", json!(speed))?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window
        .set_fullscreen(!is_fullscreen)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_subtitle_track(track_id: i64, state: State<AppState>) -> Result<(), String> {
    let ipc = state.mpv_ipc.lock().map_err(|e| e.to_string())?;
    if let Some(ref ipc) = *ipc {
        ipc.set_property("sid", json!(track_id))?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_playback_position(
    path: String,
    position: f64,
    duration: f64,
    state: State<AppState>,
) -> Result<(), String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.save_position(&path, position, duration)
}

#[tauri::command]
pub fn get_playback_position(
    path: String,
    state: State<AppState>,
) -> Result<Option<PlaybackRecord>, String> {
    let db = state.database.lock().map_err(|e| e.to_string())?;
    db.get_position(&path)
}

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<AppConfig, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(config: AppConfig, state: State<AppState>) -> Result<(), String> {
    let mut current = state.config.lock().map_err(|e| e.to_string())?;
    *current = config.clone();
    current.save(&state.data_dir)
}

#[tauri::command]
pub fn is_first_run(state: State<AppState>) -> bool {
    AppConfig::is_first_run(&state.data_dir)
}
