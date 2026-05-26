import { invoke } from "@tauri-apps/api/core";
import { playFile } from "./bridge";

let panelEl: HTMLElement | null = null;
let currentFile = "";

export function initPlaylistPanel(): void {}

export function setCurrentFile(path: string): void {
  currentFile = path;
}

export function getCurrentFile(): string {
  return currentFile;
}

export async function togglePlaylistPanel(): Promise<void> {
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
    return;
  }

  const playlist: string[] = await invoke("get_playlist", { currentFile });

  panelEl = document.createElement("div");
  panelEl.className = "playlist-panel";

  const header = document.createElement("div");
  header.className = "playlist-header";
  header.textContent = `播放列表 (${playlist.length})`;
  panelEl.appendChild(header);

  const body = document.createElement("div");
  body.className = "playlist-body";
  panelEl.appendChild(body);

  playlist.forEach((filePath) => {
    const item = document.createElement("div");
    item.className = "playlist-item";
    if (filePath === currentFile) item.classList.add("active");
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    item.textContent = fileName;
    item.title = fileName;
    item.addEventListener("click", () => {
      playFile(filePath);
      setCurrentFile(filePath);
      togglePlaylistPanel();
    });
    body.appendChild(item);
  });

  document.getElementById("player-container")!.appendChild(panelEl);
}

export async function playNext(): Promise<void> {
  const next: string | null = await invoke("get_next_file", { currentFile });
  if (next) {
    await playFile(next);
    setCurrentFile(next);
  }
}

export async function playPrev(): Promise<void> {
  const prev: string | null = await invoke("get_prev_file", { currentFile });
  if (prev) {
    await playFile(prev);
    setCurrentFile(prev);
  }
}
