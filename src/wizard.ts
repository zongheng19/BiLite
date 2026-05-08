import { invoke } from "@tauri-apps/api/core";

const VIDEO_FORMATS = [
  { ext: ".mp4", label: "MP4" },
  { ext: ".mkv", label: "MKV" },
  { ext: ".avi", label: "AVI" },
  { ext: ".mov", label: "MOV" },
  { ext: ".wmv", label: "WMV" },
  { ext: ".flv", label: "FLV" },
  { ext: ".webm", label: "WebM" },
  { ext: ".m4v", label: "M4V" },
  { ext: ".ts", label: "TS" },
];

export async function showWizard(): Promise<void> {
  const app = document.getElementById("app")!;
  app.innerHTML = "";

  const wizard = document.createElement("div");
  wizard.className = "wizard";
  wizard.innerHTML = `
    <div class="wizard-container">
      <h1 class="wizard-title">欢迎使用 BiLite</h1>
      <p class="wizard-subtitle">轻量级本地视频播放器</p>
      <div class="wizard-step" id="step-theme">
        <h2>选择主题</h2>
        <div class="wizard-options">
          <button class="wizard-option selected" data-theme="dark">
            <div class="theme-preview dark-preview"></div>
            <span>深色</span>
          </button>
          <button class="wizard-option" data-theme="light">
            <div class="theme-preview light-preview"></div>
            <span>亮色</span>
          </button>
        </div>
      </div>
      <div class="wizard-step" id="step-formats">
        <h2>关联视频格式</h2>
        <p class="wizard-hint">双击这些格式的文件将直接用 BiLite 打开</p>
        <div class="format-grid" id="format-grid"></div>
      </div>
      <button class="wizard-btn" id="wizard-start">开始使用</button>
    </div>
  `;

  app.appendChild(wizard);

  const grid = document.getElementById("format-grid")!;
  VIDEO_FORMATS.forEach(({ ext, label }) => {
    const item = document.createElement("label");
    item.className = "format-item";
    item.innerHTML = `<input type="checkbox" value="${ext}" checked /><span>${label} (${ext})</span>`;
    grid.appendChild(item);
  });

  let selectedTheme = "dark";
  wizard.querySelectorAll(".wizard-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      wizard.querySelectorAll(".wizard-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedTheme = (btn as HTMLElement).dataset.theme || "dark";
      document.body.dataset.theme = selectedTheme;
    });
  });

  document.getElementById("wizard-start")!.addEventListener("click", async () => {
    const formats = Array.from(grid.querySelectorAll("input:checked"))
      .map((input) => (input as HTMLInputElement).value);

    await invoke("save_config", {
      config: {
        theme: selectedTheme,
        volume: 80,
        playback_speed: 1.0,
        subtitle_font_size: 24,
        file_associations: formats,
        window: { width: 1280, height: 720, x: null, y: null },
      },
    });

    await invoke("register_file_associations", { extensions: formats });
    window.location.reload();
  });
}
