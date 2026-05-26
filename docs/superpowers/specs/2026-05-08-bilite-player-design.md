# BiLite 播放器设计规格

## 概述

BiLite 是一个类B站风格的本地视频播放器，追求轻量化、高性能、开箱即用。外观和交互参考B站Web播放器，剔除在线功能（弹幕、社区互动等），保留核心播放体验。

## 技术选型

| 层面 | 选择 | 理由 |
|------|------|------|
| 应用框架 | Tauri v2 | 轻量（~10MB），跨平台，Rust后端性能好 |
| 播放内核 | mpv (sidecar) | 格式支持最全，硬件加速，跨平台成熟 |
| 前端UI | HTML/CSS/JS | 最容易还原B站播放器样式 |
| 数据存储 | SQLite + JSON | 播放记忆用SQLite，设置用JSON |
| 目标平台 | Windows / macOS / Linux | 跨平台 |

## 架构

```
┌─────────────────────────────────────────────────┐
│              BiLite 窗口 (Tauri)                  │
│  ┌───────────────────────────────────────────┐  │
│  │         mpv 视频渲染层                      │  │
│  │    (通过 --wid 嵌入原生窗口句柄)            │  │
│  ├───────────────────────────────────────────┤  │
│  │    WebView 透明覆盖层 (UI Controls)        │  │
│  │    - 顶部：文件名信息栏                     │  │
│  │    - 中部：字幕显示层                       │  │
│  │    - 底部：进度条 + 控制栏                  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 进程模型

- **Tauri主进程（Rust）**：窗口管理、mpv进程生命周期、IPC通信、文件关联、SQLite读写
- **mpv子进程（sidecar）**：视频解码与渲染，通过JSON IPC接受控制
- **WebView进程**：B站风格UI渲染，通过Tauri commands与Rust后端通信

### 通信链路

```
用户操作 → WebView (JS) → Tauri Command (Rust) → mpv IPC (JSON over pipe/socket)
mpv状态变化 → Rust监听 → Tauri Event → WebView更新UI
```

## 功能清单

### 核心播放功能

| 功能 | 说明 |
|------|------|
| 播放/暂停 | 点击按钮或空格键 |
| 进度跳转 | 拖拽进度条或点击跳转 |
| 倍速播放 | 0.5x / 0.75x / 1.0x / 1.25x / 1.5x / 2.0x / 3.0x |
| 音量控制 | 滑条调节 + 静音切换 |
| 全屏 | 全屏/退出全屏 |
| 外挂字幕 | 自动加载同名字幕，支持手动选择字幕轨道 |
| 播放记忆 | 记住每个文件的播放位置，下次打开提示继续 |
| 播放列表 | 自动扫描同目录视频文件，按文件名自然排序 |

### 快捷键

| 按键 | 功能 |
|------|------|
| 空格 | 暂停/播放 |
| → 点按 | 快进5秒 |
| → 长按 | 3倍速播放（松开恢复） |
| ← 点按 | 快退5秒 |
| ← 长按 | 快速回退（松开恢复） |
| ↑ | 音量+10% |
| ↓ | 音量-10% |
| Shift+1 | 1倍速 |
| Shift+2 | 2倍速 |
| F | 全屏切换 |
| M | 静音切换 |

## UI设计

### 视觉风格

- 默认深色主题，可选亮色主题
- 强调色：B站蓝 #00a1d6
- 字体：系统默认无衬线字体（PingFang SC / Microsoft YaHei / sans-serif）

### 界面层次（从下到上）

1. mpv视频渲染层
2. 字幕显示层（底部居中，半透明黑底白字）
3. 顶部信息栏（文件名，渐显/渐隐）
4. 底部控制栏（进度条 + 按钮行）

### 控制栏布局

```
┌──────────────────────────────────────────────────┐
│ [进度条 ━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━] │
│ ▶ 02:31/07:45              1.0x  字幕  🔊━━  ⛶  │
└──────────────────────────────────────────────────┘
```

- 左侧：播放/暂停 + 时间显示
- 右侧：倍速 | 字幕 | 音量（图标+滑条） | 全屏

### 交互行为

- 控制栏默认隐藏，鼠标移入视频区渐显，静止3秒后渐隐
- 进度条hover变粗（3px→6px），显示时间预览tooltip
- 倍速按钮点击弹出选择面板
- 字幕按钮弹出字幕轨道列表（含"关闭字幕"）
- 音量图标点击切换静音，hover展开滑条
- 播放结束显示"重新播放"按钮 + 下一个视频提示
- 播放列表面板从右侧滑出

## 数据持久化

### 播放记忆（SQLite）

存储路径：
- Windows: `%APPDATA%/BiLite/data.db`
- macOS: `~/Library/Application Support/BiLite/data.db`
- Linux: `~/.local/share/BiLite/data.db`

表结构：
```sql
CREATE TABLE playback_history (
    file_path TEXT PRIMARY KEY,
    position REAL NOT NULL,
    duration REAL NOT NULL,
    last_played INTEGER NOT NULL
);
```

打开视频时查询记录，有则提示"上次播放到 xx:xx，是否继续？"

### 用户设置（JSON）

存储路径：与SQLite同目录（即应用数据目录下 `config.json`）

```json
{
  "theme": "dark",
  "volume": 80,
  "playback_speed": 1.0,
  "subtitle_font_size": 24,
  "file_associations": [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v", ".ts"],
  "window": { "width": 1280, "height": 720, "x": null, "y": null }
}
```

## mpv集成

### 打包方式

各平台预编译mpv二进制随应用打包：
- Windows: `resources/mpv.exe`（~30MB）
- macOS: `resources/mpv`（~25MB）
- Linux: `resources/mpv`（~20MB），优先检测PATH中已安装的mpv，未找到则使用打包版本

### 启动参数

```
mpv --wid=<窗口句柄>
    --input-ipc-server=<pipe/socket路径>
    --no-terminal
    --no-osc
    --no-osd-bar
    --keep-open=yes
    --idle=yes
    --sub-auto=fuzzy
    <视频文件路径>
```

### IPC通信

- 协议：JSON over named pipe (Windows) / Unix domain socket (macOS/Linux)
- 发送命令示例：`{"command":["loadfile","path/to/video.mp4"]}`
- 监听属性：time-pos, duration, pause, volume, speed, sub-text, eof-reached
- Rust端维护持久IPC连接，属性变化通过Tauri事件推送到WebView

### 长按快进/快退实现

- 右方向键长按：keydown时设置speed=3.0，keyup时恢复原速
- 左方向键长按：keydown时每100ms执行seek(-1,"relative")，keyup时停止

## 首次启动引导

1. 检测无配置文件 → 进入引导页
2. 第一步：选择主题（深色/亮色），实时预览
3. 第二步：选择关联的视频格式（勾选列表，默认全选常见格式）
4. 点击"开始使用" → 写入配置、注册文件关联、进入主界面

### 文件关联注册

- Windows：写HKCU注册表（无需管理员权限）
- macOS：Info.plist声明UTI
- Linux：创建.desktop文件 + MIME type关联

## 启动行为

| 场景 | 行为 |
|------|------|
| 双击视频文件 | 系统传入文件路径，直接播放 |
| 直接打开BiLite（无参数） | 空状态界面，提示拖拽或点击打开 |
| 拖拽文件到窗口 | 开始播放 |

## 打包体积预估

| 组件 | 大小 |
|------|------|
| Tauri运行时 | ~5MB |
| 前端资源 | ~2MB |
| mpv二进制 | ~25-30MB |
| **总计** | **~35-40MB** |
