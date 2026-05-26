import { setVideoProperty } from "./bridge";
import { makeDraggable } from "./draggable";

interface ColorState {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  gamma: number;
}

const colorState: ColorState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  gamma: 0,
};

let panelEl: HTMLElement | null = null;

const FIELDS: { key: keyof ColorState; label: string }[] = [
  { key: "brightness", label: "亮度" },
  { key: "contrast", label: "对比度" },
  { key: "saturation", label: "饱和度" },
  { key: "hue", label: "色调" },
  { key: "gamma", label: "伽马" },
];

export function showColorPanel(): void {
  if (panelEl) { panelEl.remove(); panelEl = null; return; }

  panelEl = document.createElement("div");
  panelEl.className = "adjust-panel";
  panelEl.innerHTML = `
    <div class="adjust-header">
      <span class="adjust-title">画面调整</span>
      <button class="adjust-close" aria-label="关闭">×</button>
    </div>
    <div class="adjust-body" id="color-body"></div>
    <div class="adjust-footer">
      <button class="adjust-reset" id="color-reset">重置</button>
    </div>
  `;
  document.getElementById("player-container")!.appendChild(panelEl);
  makeDraggable(panelEl, panelEl.querySelector(".adjust-header") as HTMLElement);

  const body = panelEl.querySelector("#color-body")!;
  FIELDS.forEach(({ key, label }) => {
    const row = document.createElement("div");
    row.className = "adjust-row";
    row.innerHTML = `
      <label class="adjust-label">${label}</label>
      <input type="range" class="adjust-slider" min="-100" max="100" step="1" data-key="${key}" />
      <span class="adjust-value" data-key="${key}">0</span>
    `;
    body.appendChild(row);
    const slider = row.querySelector("input") as HTMLInputElement;
    const valueEl = row.querySelector(".adjust-value") as HTMLElement;
    slider.value = String(colorState[key]);
    valueEl.textContent = String(colorState[key]);
    slider.addEventListener("input", () => {
      const v = parseInt(slider.value, 10);
      colorState[key] = v;
      valueEl.textContent = String(v);
      setVideoProperty(key, v);
    });
  });

  panelEl.querySelector(".adjust-close")!.addEventListener("click", () => {
    panelEl?.remove();
    panelEl = null;
  });
  panelEl.querySelector("#color-reset")!.addEventListener("click", () => {
    FIELDS.forEach(({ key }) => {
      colorState[key] = 0;
      setVideoProperty(key, 0);
      const slider = panelEl!.querySelector(`input[data-key="${key}"]`) as HTMLInputElement;
      const valueEl = panelEl!.querySelector(`.adjust-value[data-key="${key}"]`) as HTMLElement;
      slider.value = "0";
      valueEl.textContent = "0";
    });
  });
}
