import { state, subscribe } from "./state";
import { setSpeed } from "./bridge";

const SPEEDS = [3.0, 2.0, 1.5, 1.25, 1.0, 0.75, 0.5];

export function initSpeedPanel(): void {
  const wrap = document.getElementById("speed-wrap")!;
  const btn = document.getElementById("btn-speed")!;
  let panel: HTMLElement | null = null;
  let hideTimer: number | null = null;

  const renderItems = () => {
    if (!panel) return;
    panel.innerHTML = "";
    SPEEDS.forEach((speed) => {
      const item = document.createElement("button");
      item.className = "bp-panel-item";
      if (Math.abs(speed - state.speed) < 0.01) item.classList.add("active");
      const label = speed === 1.0 ? "正常" : `${speed}x`;
      item.innerHTML = `
        <span>${label}</span>
        <svg class="check"><use href="#icon-check"/></svg>
      `;
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        setSpeed(speed);
        renderItems();
      });
      panel!.appendChild(item);
    });
  };

  const showPanel = () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (panel) return;
    panel = document.createElement("div");
    panel.className = "bp-panel speed-panel";
    panel.style.bottom = "44px";
    panel.style.right = "0";
    panel.style.minWidth = "108px";
    wrap.appendChild(panel);
    renderItems();
  };

  const scheduleHide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      if (panel) { panel.remove(); panel = null; }
      hideTimer = null;
    }, 150);
  };

  wrap.addEventListener("mouseenter", showPanel);
  wrap.addEventListener("mouseleave", scheduleHide);

  // Click on speed button toggles between current and 1.0x
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (Math.abs(state.speed - 1.0) < 0.01) {
      setSpeed(2.0);
    } else {
      setSpeed(1.0);
    }
  });

  subscribe((s) => {
    btn.textContent = Math.abs(s.speed - 1.0) < 0.01 ? "倍速" : `${s.speed}x`;
    if (Math.abs(s.speed - 1.0) >= 0.01) btn.classList.add("active");
    else btn.classList.remove("active");
    renderItems();
  });
}
