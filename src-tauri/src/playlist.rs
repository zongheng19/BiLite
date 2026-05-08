use std::path::{Path, PathBuf};

const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "mpg", "mpeg", "3gp",
];

pub fn scan_directory(file_path: &str) -> Vec<String> {
    let path = Path::new(file_path);
    let dir = match path.parent() {
        Some(d) => d,
        None => return vec![file_path.to_string()],
    };

    let mut videos: Vec<PathBuf> = std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|p| {
            p.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        })
        .collect();

    videos.sort_by(|a, b| {
        natord::compare(
            a.file_name().unwrap_or_default().to_str().unwrap_or(""),
            b.file_name().unwrap_or_default().to_str().unwrap_or(""),
        )
    });

    videos
        .into_iter()
        .filter_map(|p| p.to_str().map(String::from))
        .collect()
}

pub fn find_index(playlist: &[String], current: &str) -> Option<usize> {
    playlist.iter().position(|p| p == current)
}

pub fn next_file<'a>(playlist: &'a [String], current: &str) -> Option<&'a String> {
    find_index(playlist, current).and_then(|idx| playlist.get(idx + 1))
}

pub fn prev_file<'a>(playlist: &'a [String], current: &str) -> Option<&'a String> {
    find_index(playlist, current)
        .and_then(|idx| idx.checked_sub(1))
        .and_then(|idx| playlist.get(idx))
}
