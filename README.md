# BiLite

类 B站 风格的本地视频播放器。轻量、跨平台、开箱即用。基于 Tauri v2 + mpv 构建。

![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?logo=tauri) ![Rust](https://img.shields.io/badge/Rust-Backend-orange?logo=rust) ![TypeScript](https://img.shields.io/badge/TypeScript-Frontend-3178C6?logo=typescript)

## 特性

### 核心播放
- **格式覆盖广**：通过 mpv 解码，支持 MP4 / MKV / AVI / MOV / FLV / WebM / TS 等几乎所有常见格式
- **硬件解码**：自动调用 D3D11VA / DXVA2 / VAAPI，4K 视频 CPU 占用极低
- **外挂字幕**：自动加载同名字幕文件（.srt / .ass / .vtt），支持手动切换轨道
- **播放记忆**：记录每个视频的上次观看位置，下次打开默认从该位置继续

### 仿 B站 UI
- 深色为主，可选亮色主题
- 控制栏自动隐藏，鼠标移入渐显
- 进度条 hover 加粗 + 时间预览 tooltip
- 倍速 / 字幕 / 音量面板悬停展开（不用点击）
- 长按方向键 3x 倍速播放，画面中上方提示
- 点击时间显示输入跳转（支持 `mm:ss` / `hh:mm:ss`）

### 调节面板（右键菜单）
- **画面调整**：亮度 / 对比度 / 饱和度 / 色调 / 伽马
- **音效调整**：音量增强（最大 400%）+ 10 频段均衡器（31Hz~16kHz 标准音乐 EQ）
- **循环播放 / 镜像画面**：一键切换
- **播放详情**（Tab 快捷键）：实时显示编码、分辨率、帧率、丢帧数、硬件解码、比特率、缓存等

### 其他
- 拖拽视频文件到窗口直接播放
- 自动识别同目录视频构建播放列表
- 首次启动引导（主题选择 + 文件关联）
- 系统文件关联（双击 .mp4 等格式直接打开）

## 截图

详见 [docs/references/screenshots/](docs/references/screenshots/)

## 快捷键

| 按键 | 功能 |
|------|------|
| 单击画面 | 暂停 / 播放 |
| 双击画面 | 全屏切换 |
| 滚轮 | 音量 ±2% |
| 空格 | 暂停 / 播放 |
| → 点按 | 快进 5 秒 |
| → 长按 | 3x 倍速播放 |
| ← 点按 | 快退 5 秒 |
| ← 长按 | 快速回退 |
| ↑ / ↓ | 音量 ±10% |
| F | 全屏切换 |
| M | 静音切换 |
| Shift + 1 | 1.0x 倍速 |
| Shift + 2 | 2.0x 倍速 |
| Tab | 显示 / 隐藏播放详情 |

## 安装与运行

### 前置要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.75
- [Tauri 系统依赖](https://v2.tauri.app/start/prerequisites/)（Windows 自带，Linux 需额外装）
- **mpv 可执行文件**（需手动下载，见下文）

### 下载 mpv

仓库未包含 mpv 二进制（55MB+，体积太大）。请按以下步骤获取：

**Windows：**
```bash
# 推荐方式：winget
winget install mpv-player.mpv-CI.MSVC

# 然后把 mpv.exe 复制到 src-tauri/resources/
# 注意改名为 mpv-x86_64-pc-windows-msvc.exe（Tauri sidecar 命名规则）
```

或者从 [mpv 官方发布页](https://mpv.io/installation/) 下载最新版。

**macOS：**
```bash
brew install mpv
# 把 mpv 二进制复制到 src-tauri/resources/mpv-x86_64-apple-darwin
# (Apple Silicon 用 mpv-aarch64-apple-darwin)
```

**Linux：**
```bash
# Debian/Ubuntu
sudo apt install mpv

# Arch
sudo pacman -S mpv

# 复制到 src-tauri/resources/mpv-x86_64-unknown-linux-gnu
```

### 开发模式

```bash
git clone https://github.com/zongheng19/BiLite.git
cd BiLite
npm install
npm run tauri dev
```

### 构建发布版

```bash
npm run tauri build
```

构建产物：
- `src-tauri/target/release/bilite.exe` — 单文件可执行
- `src-tauri/target/release/bundle/` — 安装包（Windows 是 .msi / .nsis，macOS 是 .dmg / .app，Linux 是 .deb / .AppImage）

## 项目结构

```
bilite/
├── src/                        # 前端 (Vite + 原生 TypeScript)
│   ├── main.ts                 # 入口、事件监听、初始化
│   ├── bridge.ts               # Tauri invoke / listen 封装
│   ├── state.ts                # 响应式播放器状态
│   ├── player-ui.ts            # 控制栏、播放/暂停、时间显示
│   ├── progress-bar.ts         # 进度条交互
│   ├── volume.ts / volume-toast.ts
│   ├── speed-panel.ts / subtitle-panel.ts
│   ├── shortcuts.ts            # 键盘快捷键
│   ├── playlist-panel.ts       # 播放列表
│   ├── empty-state.ts          # 欢迎页 + 最近视频
│   ├── context-menu.ts         # 右键菜单
│   ├── color-panel.ts          # 画面调整面板
│   ├── audio-panel.ts          # 音效调整 (音量增强 + EQ)
│   ├── stats-overlay.ts        # 播放详情浮窗
│   ├── wizard.ts               # 首次启动引导
│   └── styles/                 # CSS (变量、主题、组件)
├── src-tauri/                  # 后端 (Rust)
│   ├── src/
│   │   ├── main.rs             # Tauri 应用入口
│   │   ├── commands.rs         # 所有 #[tauri::command]
│   │   ├── mpv/
│   │   │   ├── ipc.rs          # mpv JSON IPC 异步通信
│   │   │   └── process.rs      # mpv 子进程管理
│   │   ├── platform/           # 跨平台窗口句柄、文件关联
│   │   ├── storage/            # SQLite 播放历史 + JSON 配置
│   │   └── playlist.rs         # 目录扫描 + 自然排序
│   └── resources/              # mpv 二进制 (gitignored)
├── docs/
│   ├── 项目需求.md
│   ├── superpowers/            # 设计规格 + 实现计划
│   └── references/             # B站逆向分析、UI 截图
└── index.html
```

## 架构

```
┌─────────────────────────────────────────────────┐
│              BiLite Window (Tauri)              │
│  ┌───────────────────────────────────────────┐  │
│  │       mpv 视频渲染层 (--wid 嵌入)           │  │
│  ├───────────────────────────────────────────┤  │
│  │    WebView 透明覆盖层 (UI Controls)        │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘

数据流:
JS (UI 操作) ──invoke──→ Rust Command ──IPC─→ mpv subprocess
                                                    ↓
JS (UI 更新) ←──event── Rust event loop ←──IPC── mpv property change
```

## 开发笔记

- **mpv IPC**：通过命名管道（Windows）/ Unix domain socket（macOS/Linux）通信，写入用 channel 异步处理避免阻塞 UI 线程
- **窗口嵌入**：使用 `raw-window-handle` 跨平台获取窗口句柄，传给 mpv `--wid` 参数
- **状态持久化**：SQLite 存播放历史，JSON 存设置（`%APPDATA%/BiLite/`）
- **UI 透明叠加**：Tauri 窗口 `transparent: true` + WebView 透明背景，让 mpv 渲染从下方透出

## 致谢

- [mpv](https://mpv.io/) — 强大的开源视频播放内核
- [Tauri](https://tauri.app/) — 轻量跨平台应用框架
- [Bilibili](https://www.bilibili.com/) — UI 设计参考

## License

MIT
