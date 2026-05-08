use rusqlite::{params, Connection};
use std::path::PathBuf;

pub struct Database {
    conn: Connection,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PlaybackRecord {
    pub file_path: String,
    pub position: f64,
    pub duration: f64,
    pub last_played: i64,
}

impl Database {
    pub fn open(data_dir: &PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
        let db_path = data_dir.join("data.db");
        let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS playback_history (
                file_path TEXT PRIMARY KEY,
                position REAL NOT NULL,
                duration REAL NOT NULL,
                last_played INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| e.to_string())?;
        Ok(Self { conn })
    }

    pub fn save_position(&self, file_path: &str, position: f64, duration: f64) -> Result<(), String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        self.conn
            .execute(
                "INSERT OR REPLACE INTO playback_history (file_path, position, duration, last_played) VALUES (?1, ?2, ?3, ?4)",
                params![file_path, position, duration, now],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_position(&self, file_path: &str) -> Result<Option<PlaybackRecord>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT file_path, position, duration, last_played FROM playback_history WHERE file_path = ?1")
            .map_err(|e| e.to_string())?;
        let result = stmt.query_row(params![file_path], |row| {
            Ok(PlaybackRecord {
                file_path: row.get(0)?,
                position: row.get(1)?,
                duration: row.get(2)?,
                last_played: row.get(3)?,
            })
        });
        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
}
