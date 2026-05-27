import { open } from "@tauri-apps/plugin-dialog";
import { getConfig, saveConfig } from "./bridge";
import { makeDraggable } from "./draggable";

let panelEl: HTMLElement | null = null;

export async function showSettingsPanel(): Promise<void> {
  if (panelEl) { panelEl.remove(); panelEl = null; return; }

  const cfg = await getConfig();
  const whisper = cfg.whisper || { executable: "", model: "", language: "auto" };

  panelEl = document.createElement("div");
  panelEl.className = "adjust-panel settings-panel";
  panelEl.innerHTML = `
    <div class="adjust-header">
      <span class="adjust-title">设置</span>
      <button class="adjust-close" aria-label="关闭">×</button>
    </div>
    <div class="adjust-body">
      <div class="adjust-section">
        <div class="adjust-section-title">AI 字幕（Whisper）</div>
        <p class="adjust-hint">配置后可在"字幕"菜单中使用 AI 生成字幕。推荐使用 <a href="https://github.com/ggerganov/whisper.cpp/releases" target="_blank" style="color:var(--accent)">whisper.cpp</a> 的预编译版本。</p>

        <div class="settings-row">
          <label class="settings-label">可执行文件</label>
          <input type="text" class="settings-input" id="w-exe" value="${escapeHtml(whisper.executable)}" placeholder="whisper-cli.exe 路径" />
          <button class="settings-browse" data-target="w-exe" data-kind="exe">浏览</button>
        </div>

        <div class="settings-row">
          <label class="settings-label">模型文件</label>
          <input type="text" class="settings-input" id="w-model" value="${escapeHtml(whisper.model)}" placeholder="ggml-medium.bin 路径" />
          <button class="settings-browse" data-target="w-model" data-kind="model">浏览</button>
        </div>

        <div class="settings-row">
          <label class="settings-label">识别语言</label>
          <select class="settings-input" id="w-lang">
            <option value="auto">自动检测</option>
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="ko">한국어</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="es">Español</option>
            <option value="ru">Русский</option>
          </select>
        </div>
      </div>
    </div>
    <div class="adjust-footer">
      <button class="adjust-reset" id="settings-cancel" style="margin-right:8px">取消</button>
      <button class="empty-btn" id="settings-save" style="padding:6px 18px;font-size:12px">保存</button>
    </div>
  `;
  document.getElementById("player-container")!.appendChild(panelEl);
  makeDraggable(panelEl, panelEl.querySelector(".adjust-header") as HTMLElement);

  // Set the lang dropdown value
  (panelEl.querySelector("#w-lang") as HTMLSelectElement).value = whisper.language || "auto";

  // Browse buttons
  panelEl.querySelectorAll(".settings-browse").forEach((b) => {
    b.addEventListener("click", async () => {
      const target = (b as HTMLElement).dataset.target!;
      const kind = (b as HTMLElement).dataset.kind!;
      const filters = kind === "exe"
        ? [{ name: "可执行文件", extensions: ["exe"] }, { name: "所有文件", extensions: ["*"] }]
        : [{ name: "GGML 模型", extensions: ["bin", "gguf"] }, { name: "所有文件", extensions: ["*"] }];
      const selected = await open({ multiple: false, filters });
      if (typeof selected === "string") {
        (document.getElementById(target) as HTMLInputElement).value = selected;
      }
    });
  });

  panelEl.querySelector(".adjust-close")!.addEventListener("click", () => {
    panelEl?.remove();
    panelEl = null;
  });
  panelEl.querySelector("#settings-cancel")!.addEventListener("click", () => {
    panelEl?.remove();
    panelEl = null;
  });
  panelEl.querySelector("#settings-save")!.addEventListener("click", async () => {
    const exe = (document.getElementById("w-exe") as HTMLInputElement).value.trim();
    const model = (document.getElementById("w-model") as HTMLInputElement).value.trim();
    const lang = (document.getElementById("w-lang") as HTMLSelectElement).value;

    const newCfg = {
      ...cfg,
      whisper: { executable: exe, model: model, language: lang },
    };
    try {
      await saveConfig(newCfg);
      panelEl?.remove();
      panelEl = null;
    } catch (err) {
      alert(`保存失败: ${err}`);
    }
  });
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c] || c
  );
}
