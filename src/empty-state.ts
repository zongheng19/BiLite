import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface PlaybackRecord {
  file_path: string;
  position: number;
  duration: number;
  last_played: number;
}

let onOpenCallback: ((path: string) => void) | null = null;

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export async function initEmptyState(onOpen: (path: string) => void): Promise<void> {
  onOpenCallback = onOpen;
  const btn = document.getElementById("btn-open-file");
  if (btn) {
    btn.addEventListener("click", async () => {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "视频文件",
            extensions: ["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "mpg", "mpeg", "3gp"],
          },
          { name: "所有文件", extensions: ["*"] },
        ],
      });
      if (typeof selected === "string" && onOpenCallback) {
        onOpenCallback(selected);
      }
    });
  }

  await loadRecentVideo();
}

async function loadRecentVideo(): Promise<void> {
  try {
    const record = await invoke<PlaybackRecord | null>("get_recent_playback");
    if (!record) return;

    const wrap = document.getElementById("empty-recent");
    const card = document.getElementById("recent-card");
    const nameEl = document.getElementById("recent-name");
    const posEl = document.getElementById("recent-position");
    const durEl = document.getElementById("recent-duration");
    const fillEl = document.getElementById("recent-progress");
    if (!wrap || !card || !nameEl || !posEl || !durEl || !fillEl) return;

    const fileName = record.file_path.split(/[/\\]/).pop() || record.file_path;
    nameEl.textContent = fileName;
    nameEl.title = record.file_path;
    posEl.textContent = formatTime(record.position);
    durEl.textContent = formatTime(record.duration);

    const pct = record.duration > 0 ? (record.position / record.duration) * 100 : 0;
    fillEl.style.width = `${Math.min(100, pct)}%`;

    wrap.style.display = "flex";

    card.addEventListener("click", () => {
      if (onOpenCallback) onOpenCallback(record.file_path);
    });
  } catch (err) {
    console.warn("[BiLite] failed to load recent playback:", err);
  }
}

export function hideEmptyState(): void {
  const el = document.getElementById("empty-state");
  if (el) el.classList.add("hidden");
}

export function showEmptyState(): void {
  const el = document.getElementById("empty-state");
  if (el) el.classList.remove("hidden");
}
