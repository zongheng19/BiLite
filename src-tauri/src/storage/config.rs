use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub volume: f64,
    #[serde(default)]
    pub muted: bool,
    pub playback_speed: f64,
    pub subtitle_font_size: u32,
    pub file_associations: Vec<String>,
    pub window: WindowConfig,
    #[serde(default)]
    pub whisper: WhisperConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WhisperConfig {
    /// Path to whisper.cpp main.exe / whisper-cli executable.
    /// Empty = AI subtitles disabled.
    #[serde(default)]
    pub executable: String,
    /// Path to a GGML model file (e.g. ggml-medium.bin).
    #[serde(default)]
    pub model: String,
    /// ISO language code (e.g. "zh", "en", "auto").
    #[serde(default = "default_language")]
    pub language: String,
}

fn default_language() -> String {
    "auto".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            volume: 80.0,
            muted: false,
            playback_speed: 1.0,
            subtitle_font_size: 24,
            file_associations: vec![
                ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
            window: WindowConfig {
                width: 1280,
                height: 720,
                x: None,
                y: None,
            },
            whisper: WhisperConfig::default(),
        }
    }
}

impl AppConfig {
    pub fn load(data_dir: &PathBuf) -> Self {
        let config_path = data_dir.join("config.json");
        if config_path.exists() {
            let content = std::fs::read_to_string(&config_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Self::default()
        }
    }

    pub fn save(&self, data_dir: &PathBuf) -> Result<(), String> {
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let config_path = data_dir.join("config.json");
        let content = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(&config_path, content).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn is_first_run(data_dir: &PathBuf) -> bool {
        !data_dir.join("config.json").exists()
    }
}
