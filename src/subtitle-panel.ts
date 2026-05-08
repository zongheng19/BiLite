import { setSubtitleTrack } from "./bridge";

let panelEl: HTMLElement | null = null;

export function initSubtitlePanel(): void {
  const btn = document.getElementById("btn-subtitle")!;
  btn.addEventListener("click", () => toggleSubtitlePanel());
}

function toggleSubtitlePanel(): void {
  if (panelEl) { panelEl.remove(); panelEl = null; return; }

  panelEl = document.createElement("div");
  panelEl.className = "subtitle-panel";
  panelEl.style.cssText = `
    position: absolute; bottom: 50px; right: 120px;
    background: var(--bg-panel); border-radius: var(--radius-md);
    padding: 8px 0; min-width: 140px; z-index: 100;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;

  const offItem = document.createElement("button");
  offItem.textContent = "关闭字幕";
  offItem.style.cssText = `
    display: block; width: 100%; padding: 8px 20px;
    text-align: center; color: var(--text-secondary);
    font-size: 13px; cursor: pointer; border: none; background: none;
  `;
  offItem.addEventListener("click", () => {
    setSubtitleTrack(0);
    panelEl?.remove();
    panelEl = null;
  });
  panelEl.appendChild(offItem);

  const track1 = document.createElement("button");
  track1.textContent = "字幕轨道 1";
  track1.style.cssText = offItem.style.cssText;
  track1.addEventListener("click", () => {
    setSubtitleTrack(1);
    panelEl?.remove();
    panelEl = null;
  });
  panelEl.appendChild(track1);

  document.getElementById("control-bar")!.appendChild(panelEl);
}
