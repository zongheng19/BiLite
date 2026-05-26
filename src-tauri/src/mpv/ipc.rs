use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, Mutex};

pub struct MpvIpc {
    tx_cmd: mpsc::UnboundedSender<String>,
    request_id: AtomicU64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct MpvEvent {
    pub event: Option<String>,
    pub name: Option<String>,
    pub data: Option<Value>,
    pub request_id: Option<u64>,
    pub error: Option<String>,
}

impl MpvIpc {
    #[cfg(windows)]
    pub fn connect(pipe_name: &str) -> Result<(Self, mpsc::UnboundedReceiver<MpvEvent>), String> {
        let pipe_path = format!(r"\\.\pipe\{}", pipe_name);

        // Retry connection
        let mut connected = false;
        for i in 0..10 {
            if std::path::Path::new(&pipe_path).exists() || std::fs::metadata(&pipe_path).is_ok() {
                connected = true;
                break;
            }
            // Try opening to check
            match std::fs::OpenOptions::new().read(true).write(true).open(&pipe_path) {
                Ok(_) => { connected = true; break; }
                Err(_) if i < 9 => {
                    std::thread::sleep(std::time::Duration::from_millis(300));
                }
                Err(_) => {}
            }
        }
        if !connected {
            return Err("Failed to connect to mpv pipe after retries".to_string());
        }

        let (tx_cmd, mut rx_cmd) = mpsc::unbounded_channel::<String>();
        let (tx_event, rx_event) = mpsc::unbounded_channel::<MpvEvent>();

        let pipe_path_clone = pipe_path.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                let client = tokio::net::windows::named_pipe::ClientOptions::new()
                    .open(&pipe_path_clone);

                match client {
                    Ok(pipe) => {
                        let (reader, mut writer) = tokio::io::split(pipe);
                        let mut buf_reader = BufReader::new(reader);

                        // Spawn writer task
                        let write_handle = tokio::spawn(async move {
                            while let Some(cmd) = rx_cmd.recv().await {
                                if writer.write_all(cmd.as_bytes()).await.is_err() {
                                    break;
                                }
                                if writer.flush().await.is_err() {
                                    break;
                                }
                            }
                        });

                        // Reader loop
                        let mut line = String::new();
                        loop {
                            line.clear();
                            match buf_reader.read_line(&mut line).await {
                                Ok(0) => break,
                                Ok(_) => {
                                    if let Ok(event) = serde_json::from_str::<MpvEvent>(line.trim()) {
                                        if tx_event.send(event).is_err() {
                                            break;
                                        }
                                    }
                                }
                                Err(_) => break,
                            }
                        }

                        write_handle.abort();
                    }
                    Err(e) => {
                        eprintln!("[BiLite] Failed to open async pipe: {}", e);
                    }
                }
            });
        });

        Ok((
            Self {
                tx_cmd,
                request_id: AtomicU64::new(1),
            },
            rx_event,
        ))
    }

    #[cfg(unix)]
    pub fn connect(socket_path: &str) -> Result<(Self, mpsc::UnboundedReceiver<MpvEvent>), String> {
        use std::io::{BufRead, Write};
        use std::os::unix::net::UnixStream;

        let stream = UnixStream::connect(socket_path)
            .map_err(|e| format!("Failed to connect to mpv socket: {}", e))?;

        let reader = stream.try_clone().map_err(|e| e.to_string())?;
        let writer = Arc::new(std::sync::Mutex::new(stream));

        let (tx_cmd, mut rx_cmd) = mpsc::unbounded_channel::<String>();
        let (tx_event, rx_event) = mpsc::unbounded_channel::<MpvEvent>();

        // Reader thread
        std::thread::spawn(move || {
            let buf_reader = std::io::BufReader::new(reader);
            for line in buf_reader.lines() {
                if let Ok(line) = line {
                    if let Ok(event) = serde_json::from_str::<MpvEvent>(&line) {
                        if tx_event.send(event).is_err() {
                            break;
                        }
                    }
                }
            }
        });

        // Writer thread
        let writer_clone = writer.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                while let Some(cmd) = rx_cmd.recv().await {
                    let mut w = writer_clone.lock().unwrap();
                    if write!(w, "{}", cmd).is_err() || w.flush().is_err() {
                        break;
                    }
                }
            });
        });

        Ok((
            Self {
                tx_cmd,
                request_id: AtomicU64::new(1),
            },
            rx_event,
        ))
    }

    pub fn send_command(&self, command: &[Value]) -> Result<u64, String> {
        let id = self.request_id.fetch_add(1, Ordering::SeqCst);
        let msg = json!({ "command": command, "request_id": id });
        let cmd_str = format!("{}\n", msg);
        self.tx_cmd.send(cmd_str).map_err(|e| format!("Failed to send command: {}", e))?;
        Ok(id)
    }

    pub fn set_property(&self, name: &str, value: Value) -> Result<u64, String> {
        self.send_command(&[json!("set_property"), json!(name), value])
    }

    pub fn get_property(&self, name: &str) -> Result<u64, String> {
        self.send_command(&[json!("get_property"), json!(name)])
    }

    pub fn observe_property(&self, id: u64, name: &str) -> Result<u64, String> {
        self.send_command(&[json!("observe_property"), json!(id), json!(name)])
    }

    pub fn loadfile(&self, path: &str) -> Result<u64, String> {
        self.send_command(&[json!("loadfile"), json!(path)])
    }

    pub fn seek(&self, seconds: f64, mode: &str) -> Result<u64, String> {
        self.send_command(&[json!("seek"), json!(seconds), json!(mode)])
    }
}
