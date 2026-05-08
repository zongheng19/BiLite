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
  panelEl.style.cssText = `
    position: absolute; top: 0; right: 0; bottom: 0; width: 300px;
    background: var(--bg-panel); z-index: 50; overflow-y: auto;
    padding: 16px; border-left: 1px solid var(--border-color);
    animation: slideIn 0.2s ease;
  `;

  const title = document.createElement("h3");
  title.textContent = "播放列表";
  title.style.cssText =
    "color: var(--text-primary); margin-bottom: 12px; font-size: 14px;";
  panelEl.appendChild(title);

  playlist.forEach((filePath) => {
    const item = document.createElement("div");
    const fileName = filePath.split(/[/\\]/).pop() || filePath;
    item.textContent = fileName;
    item.style.cssText = `
      padding: 8px 12px; border-radius: var(--radius-sm); cursor: pointer;
      font-size: 13px; color: var(--text-secondary); margin-bottom: 4px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    `;
    if (filePath === currentFile) {
      item.style.color = "var(--accent)";
      item.style.background = "rgba(0, 161, 214, 0.1)";
    }
    item.addEventListener("click", () => {
      playFile(filePath);
      setCurrentFile(filePath);
      togglePlaylistPanel();
    });
    panelEl!.appendChild(item);
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
