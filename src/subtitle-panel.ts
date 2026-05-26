import { setSubtitleTrack } from "./bridge";

let panelEl: HTMLElement | null = null;
let activeTrack = 1;
let hideTimer: number | null = null;

export function initSubtitlePanel(): void {
  const wrap = document.getElementById("subtitle-wrap")!;
  const btn = document.getElementById("btn-subtitle")!;

  const buildItem = (label: string, trackId: number) => {
    const item = document.createElement("button");
    item.className = "bp-panel-item";
    if (activeTrack === trackId) item.classList.add("active");
    item.innerHTML = `
      <span>${label}</span>
      <svg class="check"><use href="#icon-check"/></svg>
    `;
    item.addEventListener("click", (ev) => {
      ev.stopPropagation();
      activeTrack = trackId;
      setSubtitleTrack(trackId);
      renderItems();
    });
    return item;
  };

  const renderItems = () => {
    if (!panelEl) return;
    panelEl.innerHTML = "";
    panelEl.appendChild(buildItem("字幕轨道 1", 1));
    const divider = document.createElement("div");
    divider.className = "bp-panel-divider";
    panelEl.appendChild(divider);
    panelEl.appendChild(buildItem("关闭字幕", 0));
  };

  const showPanel = () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (panelEl) return;
    panelEl = document.createElement("div");
    panelEl.className = "bp-panel subtitle-panel";
    panelEl.style.bottom = "44px";
    panelEl.style.right = "0";
    panelEl.style.minWidth = "140px";
    wrap.appendChild(panelEl);
    renderItems();
  };

  const scheduleHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (panelEl) { panelEl.remove(); panelEl = null; }
      hideTimer = null;
    }, 150);
  };

  wrap.addEventListener("mouseenter", showPanel);
  wrap.addEventListener("mouseleave", scheduleHide);

  // Click toggles subtitle on/off
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (activeTrack === 0) { activeTrack = 1; setSubtitleTrack(1); }
    else { activeTrack = 0; setSubtitleTrack(0); }
    renderItems();
  });
}
