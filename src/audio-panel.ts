import { setVolumeMax, setEqualizer, clearEqualizer, setVolume } from "./bridge";
import { state } from "./state";
import { makeDraggable } from "./draggable";

const EQ_FREQS = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
const EQ_BANDS_DEFAULT = new Array(10).fill(0);
const eqBands: number[] = [...EQ_BANDS_DEFAULT];

let volumeBoost = 100; // 100 = no boost; up to 400 = 4x
let panelEl: HTMLElement | null = null;

export function showAudioPanel(): void {
  if (panelEl) { panelEl.remove(); panelEl = null; return; }

  panelEl = document.createElement("div");
  panelEl.className = "adjust-panel audio-adjust-panel";
  panelEl.innerHTML = `
    <div class="adjust-header">
      <span class="adjust-title">音效调整</span>
      <button class="adjust-close" aria-label="关闭">×</button>
    </div>
    <div class="adjust-body">
      <div class="adjust-section">
        <div class="adjust-section-title">音量增强</div>
        <div class="adjust-row">
          <label class="adjust-label">最大音量</label>
          <input type="range" class="adjust-slider" id="vmax" min="100" max="400" step="10" value="${volumeBoost}" />
          <span class="adjust-value" id="vmax-val">${volumeBoost}%</span>
        </div>
        <p class="adjust-hint">100% 为正常音量，最高可放大至 400%（音量条上限同步调整）</p>
      </div>
      <div class="adjust-section">
        <div class="adjust-section-title">均衡器</div>
        <div class="eq-bands" id="eq-bands"></div>
        <button class="adjust-reset" id="eq-reset">重置均衡器</button>
      </div>
    </div>
  `;
  document.getElementById("player-container")!.appendChild(panelEl);
  makeDraggable(panelEl, panelEl.querySelector(".adjust-header") as HTMLElement);

  // Volume boost
  const vmax = panelEl.querySelector("#vmax") as HTMLInputElement;
  const vmaxVal = panelEl.querySelector("#vmax-val") as HTMLElement;
  vmax.addEventListener("input", () => {
    volumeBoost = parseInt(vmax.value, 10);
    vmaxVal.textContent = `${volumeBoost}%`;
    setVolumeMax(volumeBoost);
    // Apply the boost immediately so the user can hear it.
    // If reducing the cap, clamp current volume; if raising, push volume up to the new cap.
    if (state.volume > volumeBoost) {
      setVolume(volumeBoost);
    } else if (volumeBoost > 100 && state.volume === 100) {
      setVolume(volumeBoost);
    }
  });

  // Equalizer bands
  const bandsContainer = panelEl.querySelector("#eq-bands")!;
  EQ_FREQS.forEach((freq, idx) => {
    const col = document.createElement("div");
    col.className = "eq-col";
    col.innerHTML = `
      <div class="eq-gain" data-idx="${idx}">${eqBands[idx] >= 0 ? "+" : ""}${eqBands[idx]}</div>
      <input type="range" class="eq-slider" min="-12" max="12" step="0.5" value="${eqBands[idx]}" data-idx="${idx}" orient="vertical" />
      <div class="eq-freq">${freq}</div>
    `;
    bandsContainer.appendChild(col);
    const slider = col.querySelector(".eq-slider") as HTMLInputElement;
    const gainEl = col.querySelector(".eq-gain") as HTMLElement;
    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      eqBands[idx] = v;
      gainEl.textContent = `${v >= 0 ? "+" : ""}${v}`;
      setEqualizer(eqBands);
    });
  });

  // Close
  panelEl.querySelector(".adjust-close")!.addEventListener("click", () => {
    panelEl?.remove();
    panelEl = null;
  });

  // EQ reset
  panelEl.querySelector("#eq-reset")!.addEventListener("click", () => {
    for (let i = 0; i < 10; i++) eqBands[i] = 0;
    panelEl!.querySelectorAll(".eq-slider").forEach((el) => {
      (el as HTMLInputElement).value = "0";
    });
    panelEl!.querySelectorAll(".eq-gain").forEach((el) => {
      (el as HTMLElement).textContent = "0";
    });
    clearEqualizer();
  });
}
