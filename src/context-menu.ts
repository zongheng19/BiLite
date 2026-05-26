import { state } from "./state";
import { toggleLoop, toggleMirror } from "./bridge";
import { showColorPanel } from "./color-panel";
import { showAudioPanel } from "./audio-panel";
import { getCurrentFile } from "./playlist-panel";
import { toggleStats, isStatsVisible } from "./stats-overlay";

interface MenuState {
  loop: boolean;
  mirror: boolean;
}

const menuState: MenuState = {
  loop: false,
  mirror: false,
};

let menuEl: HTMLElement | null = null;

function closeMenu(): void {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
    document.removeEventListener("click", onOutsideClick, true);
    document.removeEventListener("contextmenu", onOutsideContext, true);
  }
}

function onOutsideClick(e: MouseEvent): void {
  if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
}

function onOutsideContext(e: MouseEvent): void {
  if (menuEl && !menuEl.contains(e.target as Node)) closeMenu();
}

interface MenuItem {
  type?: "item" | "divider";
  label?: string;
  hint?: string;
  icon?: string;
  checked?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  submenu?: MenuItem[];
}

function buildMenu(items: MenuItem[]): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  items.forEach((item) => {
    if (item.type === "divider") {
      const d = document.createElement("div");
      d.className = "ctx-divider";
      menu.appendChild(d);
      return;
    }
    const el = document.createElement("button");
    el.className = "ctx-item";
    if (item.disabled) el.classList.add("disabled");
    el.innerHTML = `
      <span class="ctx-check">${item.checked ? "✓" : ""}</span>
      <span class="ctx-label">${item.label || ""}</span>
      <span class="ctx-hint">${item.hint || ""}</span>
    `;
    if (!item.disabled && item.onClick) {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        item.onClick!();
        closeMenu();
      });
    }
    menu.appendChild(el);
  });
  return menu;
}

export function initContextMenu(): void {
  const container = document.getElementById("player-container")!;
  container.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement;
    // Allow native context menu in inputs (e.g., time-input, wizard)
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    e.preventDefault();
    showMenuAt(e.clientX, e.clientY);
  });
}

function showMenuAt(x: number, y: number): void {
  closeMenu();
  const fileLoaded = !!getCurrentFile();

  const items: MenuItem[] = [
    {
      label: "视频信息",
      onClick: () => showVideoInfo(),
      disabled: !fileLoaded,
    },
    { type: "divider" },
    {
      label: "循环播放",
      checked: menuState.loop,
      onClick: () => {
        menuState.loop = !menuState.loop;
        toggleLoop(menuState.loop);
      },
    },
    {
      label: "镜像画面",
      checked: menuState.mirror,
      onClick: () => {
        menuState.mirror = !menuState.mirror;
        toggleMirror(menuState.mirror);
      },
    },
    { type: "divider" },
    {
      label: "画面调整",
      hint: "色彩",
      onClick: () => showColorPanel(),
    },
    {
      label: "音效调整",
      hint: "音量+EQ",
      onClick: () => showAudioPanel(),
    },
    { type: "divider" },
    {
      label: isStatsVisible() ? "关闭播放详情" : "显示播放详情",
      hint: "Tab",
      checked: isStatsVisible(),
      onClick: () => toggleStats(),
    },
    { type: "divider" },
    {
      label: "关于 BiLite",
      onClick: () => showAbout(),
    },
  ];

  menuEl = buildMenu(items);
  menuEl.style.left = `${x}px`;
  menuEl.style.top = `${y}px`;
  menuEl.style.visibility = "hidden";
  document.getElementById("player-container")!.appendChild(menuEl);

  // Adjust position if it overflows window
  requestAnimationFrame(() => {
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) menuEl.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) menuEl.style.top = `${y - rect.height}px`;
    menuEl.style.visibility = "visible";
  });

  setTimeout(() => {
    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("contextmenu", onOutsideContext, true);
  }, 0);
}

function showVideoInfo(): void {
  const path = getCurrentFile();
  const lines = [
    `文件名: ${path.split(/[/\\]/).pop() || "(未播放)"}`,
    `路径: ${path || "—"}`,
    `时长: ${formatTime(state.duration)}`,
    `当前位置: ${formatTime(state.timePos)}`,
    `播放速度: ${state.speed}x`,
    `音量: ${Math.round(state.volume)}%`,
  ];
  showInfoToast(lines.join("\n"));
}

function showAbout(): void {
  showInfoToast("BiLite v0.1.0\n\n类 B站 风格的本地视频播放器\n基于 Tauri + mpv 构建");
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function showInfoToast(text: string): void {
  const el = document.createElement("div");
  el.className = "info-toast";
  el.textContent = text;
  document.getElementById("player-container")!.appendChild(el);
  setTimeout(() => el.classList.add("visible"), 10);
  const dismiss = () => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 200);
    document.removeEventListener("click", dismiss);
  };
  setTimeout(() => document.addEventListener("click", dismiss), 100);
  setTimeout(dismiss, 6000);
}
