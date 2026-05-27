import { setSubtitleTrack, generateAiSubtitle, whisperConfigured, whisperDefaultDir, openWhisperDir } from "./bridge";
import { getCurrentFile } from "./playlist-panel";

let panelEl: HTMLElement | null = null;
let activeTrack = 1;
let hideTimer: number | null = null;
let generating = false;
let helpTipEl: HTMLElement | null = null;

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

  const buildAiItem = async () => {
    const enabled = await whisperConfigured();
    const item = document.createElement("div");
    item.className = "bp-panel-item ai-sub-item";
    item.innerHTML = `
      <span>${generating ? "AI 生成中..." : "AI 生成字幕"}</span>
      <span class="ai-tag-wrap">
        <span class="ai-tag">${enabled ? "Whisper" : "未配置"}</span>
        <span class="ai-help" data-help title="如何配置？">?</span>
      </span>
    `;
    if (!enabled || generating) {
      item.classList.add("disabled");
    } else {
      item.addEventListener("click", async (ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest(".ai-help")) return; // help icon shouldn't trigger generation
        ev.stopPropagation();
        const file = getCurrentFile();
        if (!file) {
          showSubToast("请先打开视频");
          return;
        }
        generating = true;
        renderItems();
        showSubToast("AI 字幕生成中，请稍候…", false);
        try {
          await generateAiSubtitle(file);
          showSubToast("AI 字幕已生成并加载", false);
        } catch (err) {
          showSubToast(`生成失败: ${err}`, true);
          console.error("[BiLite] AI subtitle generation failed:", err);
        } finally {
          generating = false;
          renderItems();
        }
      });
    }
    // Help icon — show tooltip on hover
    const help = item.querySelector(".ai-help") as HTMLElement;
    help.addEventListener("mouseenter", () => showHelpTip(help));
    help.addEventListener("mouseleave", hideHelpTip);
    help.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      try { await openWhisperDir(); } catch (_) { /* ignore */ }
    });
    return item;
  };

  const renderItems = async () => {
    if (!panelEl) return;
    panelEl.innerHTML = "";
    panelEl.appendChild(buildItem("字幕轨道 1", 1));
    const divider1 = document.createElement("div");
    divider1.className = "bp-panel-divider";
    panelEl.appendChild(divider1);
    panelEl.appendChild(buildItem("关闭字幕", 0));
    const divider2 = document.createElement("div");
    divider2.className = "bp-panel-divider";
    panelEl.appendChild(divider2);
    panelEl.appendChild(await buildAiItem());
  };

  const showPanel = () => {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (panelEl) return;
    panelEl = document.createElement("div");
    panelEl.className = "bp-panel subtitle-panel";
    panelEl.style.bottom = "44px";
    panelEl.style.right = "0";
    panelEl.style.minWidth = "180px";
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

function showSubToast(text: string, isError: boolean = false): void {
  const existing = document.querySelector(".sub-toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = isError ? "sub-toast sub-toast-error" : "sub-toast";
  if (isError) {
    // Long, wrapped, dismissable
    t.innerHTML = `
      <div class="sub-toast-msg">${escapeHtml(text)}</div>
      <button class="sub-toast-close" title="关闭">×</button>
    `;
    t.querySelector(".sub-toast-close")!.addEventListener("click", () => t.remove());
    // Click anywhere on toast copies the message
    t.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".sub-toast-close")) return;
      navigator.clipboard?.writeText(text).catch(() => {});
    });
  } else {
    t.textContent = text;
  }
  document.getElementById("player-container")!.appendChild(t);
  if (!isError) setTimeout(() => t.remove(), 4000);
}

async function showHelpTip(anchor: HTMLElement): Promise<void> {
  hideHelpTip();
  const dirs = await whisperDefaultDir().catch(() => ({ model_dir: "", module_dir: "" }) as any);
  const modelDir = dirs?.model_dir || "";
  const moduleDir = dirs?.module_dir || "";
  helpTipEl = document.createElement("div");
  helpTipEl.className = "ai-help-tip";
  helpTipEl.innerHTML = `
    <div class="help-tip-title">如何配置 AI 字幕</div>
    <ol class="help-tip-list">
      <li>下载 <b>whisper.cpp</b> 预编译版（<a href="https://github.com/ggerganov/whisper.cpp/releases" target="_blank">官方Release</a>），把可执行文件（<code>whisper-cli.exe</code> 或 <code>main.exe</code>）放到：
        <div class="help-tip-path">${escapeHtml(moduleDir)}</div>
      </li>
      <li>下载 <b>GGML 格式</b>模型（推荐 <code>ggml-medium.bin</code>，<a href="https://hf-mirror.com/ggerganov/whisper.cpp/tree/main" target="_blank">国内镜像</a> / <a href="https://huggingface.co/ggerganov/whisper.cpp/tree/main" target="_blank">官方</a>），放到：
        <div class="help-tip-path">${escapeHtml(modelDir)}</div>
      </li>
      <li>放好后字幕菜单中此项会自动启用 — <b>无需在设置中手动配置路径</b></li>
    </ol>
    <div class="help-tip-warn">
      ⚠ 注意：BiLite 使用 <b>whisper.cpp</b>（单文件 <code>ggml-*.bin</code>），<u>不兼容</u> PotPlayer 的 faster-whisper 模型（<code>model.bin + tokenizer.json</code> 那种目录式结构）
    </div>
    <div class="help-tip-foot">点击 ? 图标可打开预设目录</div>
  `;
  document.getElementById("player-container")!.appendChild(helpTipEl);

  // Position tooltip near the anchor
  const anchorRect = anchor.getBoundingClientRect();
  const tipRect = helpTipEl.getBoundingClientRect();
  let left = anchorRect.left - tipRect.width - 12;
  let top = anchorRect.top + anchorRect.height / 2 - tipRect.height / 2;
  if (left < 8) left = anchorRect.right + 12;
  if (top < 8) top = 8;
  if (top + tipRect.height > window.innerHeight - 8) {
    top = window.innerHeight - tipRect.height - 8;
  }
  helpTipEl.style.left = `${left}px`;
  helpTipEl.style.top = `${top}px`;
}

function hideHelpTip(): void {
  if (helpTipEl) {
    helpTipEl.remove();
    helpTipEl = null;
  }
}

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c] || c
  );
}
