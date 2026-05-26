/**
 * Stats overlay (top-left debug panel)
 * Toggleable via right-click menu. Updates from mpv property events.
 */

interface StatsData {
  videoCodec?: string;
  videoW?: number;
  videoH?: number;
  containerFps?: number;
  vfFps?: number;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
  fileSize?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  droppedFrames?: number;
  decoderDroppedFrames?: number;
  hwdec?: string;
  cacheDuration?: number;
}

const stats: StatsData = {};
let visible = false;
let overlayEl: HTMLElement | null = null;

const PROP_TO_FIELD: Record<string, keyof StatsData> = {
  "video-codec": "videoCodec",
  "video-params/w": "videoW",
  "video-params/h": "videoH",
  "container-fps": "containerFps",
  "estimated-vf-fps": "vfFps",
  "audio-codec": "audioCodec",
  "audio-params/samplerate": "sampleRate",
  "audio-params/channel-count": "channels",
  "file-size": "fileSize",
  "video-bitrate": "videoBitrate",
  "audio-bitrate": "audioBitrate",
  "frame-drop-count": "droppedFrames",
  "decoder-frame-drop-count": "decoderDroppedFrames",
  "hwdec-current": "hwdec",
  "demuxer-cache-duration": "cacheDuration",
};

export function feedStatsEvent(name: string | undefined, data: unknown): void {
  if (!name) return;
  const field = PROP_TO_FIELD[name];
  if (!field) return;
  (stats as any)[field] = data;
  if (visible) render();
}

function fmtBitrate(bps?: number): string {
  if (!bps || !isFinite(bps)) return "—";
  if (bps > 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`;
  if (bps > 1_000) return `${(bps / 1_000).toFixed(0)} kbps`;
  return `${bps} bps`;
}

function fmtSize(bytes?: number): string {
  if (!bytes || !isFinite(bytes)) return "—";
  if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function fmt(v: unknown, suffix = ""): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (!isFinite(v)) return "—";
    return `${Number.isInteger(v) ? v : v.toFixed(2)}${suffix}`;
  }
  return `${v}${suffix}`;
}

function render(): void {
  if (!overlayEl) return;
  const resolution = stats.videoW && stats.videoH ? `${stats.videoW}×${stats.videoH}` : "—";
  const fps = stats.vfFps ? `${stats.vfFps.toFixed(2)} / ${(stats.containerFps || 0).toFixed(2)}` : "—";
  overlayEl.innerHTML = `
    <div class="stats-row stats-section">视频</div>
    <div class="stats-row"><span class="k">编码</span><span class="v">${fmt(stats.videoCodec)}</span></div>
    <div class="stats-row"><span class="k">分辨率</span><span class="v">${resolution}</span></div>
    <div class="stats-row"><span class="k">帧率 (实/源)</span><span class="v">${fps}</span></div>
    <div class="stats-row"><span class="k">比特率</span><span class="v">${fmtBitrate(stats.videoBitrate)}</span></div>
    <div class="stats-row"><span class="k">硬件解码</span><span class="v">${fmt(stats.hwdec || "no")}</span></div>
    <div class="stats-row"><span class="k">丢帧 (输出/解码)</span><span class="v">${fmt(stats.droppedFrames)} / ${fmt(stats.decoderDroppedFrames)}</span></div>

    <div class="stats-row stats-section">音频</div>
    <div class="stats-row"><span class="k">编码</span><span class="v">${fmt(stats.audioCodec)}</span></div>
    <div class="stats-row"><span class="k">采样率</span><span class="v">${fmt(stats.sampleRate, " Hz")}</span></div>
    <div class="stats-row"><span class="k">声道</span><span class="v">${fmt(stats.channels)}</span></div>
    <div class="stats-row"><span class="k">比特率</span><span class="v">${fmtBitrate(stats.audioBitrate)}</span></div>

    <div class="stats-row stats-section">其他</div>
    <div class="stats-row"><span class="k">文件大小</span><span class="v">${fmtSize(stats.fileSize)}</span></div>
    <div class="stats-row"><span class="k">缓存</span><span class="v">${stats.cacheDuration ? stats.cacheDuration.toFixed(1) + " s" : "—"}</span></div>
  `;
}

export function toggleStats(): boolean {
  visible = !visible;
  if (visible) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = "stats-overlay";
      overlayEl.className = "stats-overlay";
      document.getElementById("player-container")!.appendChild(overlayEl);
    }
    overlayEl.style.display = "block";
    render();
  } else if (overlayEl) {
    overlayEl.style.display = "none";
  }
  return visible;
}

export function isStatsVisible(): boolean {
  return visible;
}
