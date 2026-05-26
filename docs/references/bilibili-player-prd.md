# B站 Web 播放器逆向 PRD 文档

> 版本: 基于播放器核心 v4.9.78 (2026-05-08)
> 分析视频: BV1GJ411x7h7 (Rick Astley - Never Gonna Give You Up)

---

## 1. 产品概述

B站 (Bilibili) Web 播放器是一个基于 `nano` 框架构建的模块化 HTML5 视频播放器。采用组件化架构，通过 helper 插件系统支持多种内容形态（UGC、番剧、课程、直播等）。核心 JS 体积约 496KB（压缩后），通过 CDN 分发。

### 核心定位

- 面向数亿月活用户的弹幕视频播放体验
- 支持从 360P 到 4K/8K 的多清晰度自适应切换
- 集成社区互动层（弹幕、字幕、三连）于播放器 UI
- 同时服务 PC Web、移动 Web、嵌入式播放器

---

## 2. 播放器架构

### 2.1 整体架构

```
┌──────────────────────────────────────────────────────┐
│                   #bilibili-player                    │
│  ┌──────────────────────────────────────────────────┐ │
│  │            bpx-player-container                   │ │
│  │  ┌────────────────┐  ┌─────────────────────────┐ │ │
│  │  │ bpx-player-     │  │ bpx-player-              │ │ │
│  │  │ video-wrap      │  │ interaction/story        │ │ │
│  │  │ ┌────────────┐  │  │ ┌─────────────────────┐ │ │ │
│  │  │ │bwp-video   │  │  │ │ bpx-player-         │ │ │ │
│  │  │ │(render)    │  │  │ │ bas-dm-wrap/cmd-dm  │ │ │ │
│  │  │ └────────────┘  │  │ │ wrap/render-dm-wrap │ │ │ │
│  │  └────────────────┘  │  └─────────────────────┘ │ │ │
│  │  ┌────────────────┐  │  ┌─────────────────────┐ │ │ │
│  │  │ bpx-player-     │  │  │ bpx-player-          │ │ │ │
│  │  │ control-wrap    │  │  │ subtitle-wrap        │ │ │ │
│  │  │ (进度条/按钮)   │  │  │ (字幕层)             │ │ │ │
│  │  └────────────────┘  │  └─────────────────────┘ │ │ │
│  │  ┌────────────────┐  │  ┌─────────────────────┐ │ │ │
│  │  │ bpx-player-     │  │  │ bpx-player-          │ │ │ │
│  │  │ docker-major    │  │  │ ending-panel         │ │ │ │
│  │  │ (主要工具栏)    │  │  │ (结尾推荐面板)      │ │ │ │
│  │  └────────────────┘  │  └─────────────────────┘ │ │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 2.2 分层架构

```
┌──────────────────────────────────┐
│   Helper 层 (content-specific)   │
│   ugc-helper | bangumi-helper    │
│   classroom-helper | creator-    │
│   helper | embedded-helper       │
├──────────────────────────────────┤
│   组件层 (bpx- / UI Components)   │
│   docker | control-wrap |        │
│   subtitle-wrap | ending-panel   │
│   danmaku-wrap(弹幕) | toast     │
├──────────────────────────────────┤
│   核心层 (bwp- / Core Engine)     │
│   bwp-video (渲染引擎)           │
│   bwp-processor (处理管道)        │
│   bwp-meta (元数据管理)           │
├──────────────────────────────────┤
│   框架层 (nano Framework)         │
│   createPlayer | connect         │
│   EventEmitter | StateManager    │
└──────────────────────────────────┘
```

### 2.3 核心命名约定

| 前缀 | 含义 | 示例 |
|------|------|------|
| `bpx-` | Bilibili Player X (UI 组件) | `bpx-player-container`, `bpx-docker-major` |
| `bwp-` | Bilibili Web Player (核心引擎) | `bwp-video`, `bwp-processor`, `bwp-meta` |

---

## 3. 播放器初始化流程

### 3.1 启动序列

```
1. HTML 加载 → window.__INITIAL_STATE__ (SSR 注入的服务端数据)
2. <script src="core.5652d3dc.js"> 加载 core player (nano 框架)
3. inline script 读取 videoData, 调用 getPlayerViewInfo()
4. nano.createPlayer(primarySetting, theme) → 实例化播放器
5. player.connect() → 连接视频源 → 触发各 helper 初始化
6. 各 helper 按需加载 → 播放器就绪
```

### 3.2 关键代码（还原自 inline script #8）

```javascript
// 播放器初始化
var primarySetting = {
  element: document.getElementById('bilibili-player'),   // DOM 容器
  auxiliary: document.querySelector('.danmaku-wrap'),     // 弹幕辅助容器
  aid: playerInfo.aid,     // 视频 AV 号
  cid: playerInfo.cid,     // 分P ID
  bvid: playerInfo.bvid,   // BV 号
  p: playerInfo.p,         // 当前分P序号 (1-based)
  t: playerInfo.t,         // 起始播放时间
  fromDid: playerInfo.fromDid,   // 动态来源追踪
  kind: nano.GroupKind.Ugc,      // 内容类型: Ugc/Bangumi/Classroom
  featureList: new Set(['blackGap']),  // 启用的特性
  stats: { spmId: '333.788.0.0', ... },
  enableHEVC: true,         // 启用 H.265 解码
  enableAV1: true,          // 启用 AV1 解码
  revision: 1,
  viewInfo: getPlayerViewInfo(window.__INITIAL_STATE__)  // 关联视频元信息
};

if (window.__playinfo__) {
  primarySetting.prefetch = { playUrl: window.__playinfo__ };  // 预取播放地址
}

window.player = nano.createPlayer(primarySetting, theme);
window.player.connect();
```

### 3.3 数据注入方式

| 数据 | 来源 | 说明 |
|------|------|------|
| `window.__INITIAL_STATE__` | SSR HTML 内联 | 包含 videoData, user, upData 等全部页面状态 |
| `window.__playinfo__` | SSR HTML 内联 | 视频流 URL（预取，避免二次请求） |
| `window.webAbTest` | SSR HTML 内联 | A/B 实验分组配置 |
| `window.__MIRROR_CONFIG__` | SSR HTML 内联 | 错误监控（Mirror SDK）配置 |

---

## 4. 核心功能模块

### 4.1 视频播放引擎 (bwp-video)

**支持的视频格式：**

| 格式 | 说明 |
|------|------|
| DASH | 主流格式，音视频分离，自适应码率 |
| FLV | 旧版格式，兼容性好 |
| MP4 | 存量视频兼容 |

**支持的编码：**

| 编码 | JS 中出现频率 | 说明 |
|------|---------------|------|
| H.264 (AVC) | 基础编码 | 全分辨率覆盖 |
| HEVC (H.265) | `enableHEVC: true` | 4K/8K 场景 |
| AV1 | `enableAV1: true` | 新一代编码，节省带宽 |

**处理管道 (bwp-processor)：**
- 视频解码 → 渲染 (Canvas/Video element)
- 像素可视化 (`bpx-player-visual-pixel`)
- 全景视频支持 (`bpx-player-panorama`)

### 4.2 弹幕系统 (Danmaku)

**弹幕层级结构：**

| CSS 类 | 功能 |
|--------|------|
| `bpx-player-bas-dm-wrap` | 基础弹幕层（普通用户弹幕） |
| `bpx-player-cmd-dm-wrap` | 高级弹幕层（特殊效果弹幕） |
| `bpx-player-render-dm-wrap` | 弹幕渲染层 |
| `bpx-player-adv-dm-wrap` | 高级弹幕（代码弹幕） |
| `bpx-player-row-dm-wrap` | 按行组织的弹幕 |
| `bpx-player-dm-mask-wrap` | 弹幕遮罩（防挡字幕） |

**弹幕功能：**
- 实时发送（发送栏 `bpx-player-sending-area` / `bpx-player-sending-bar`）
- 弹幕开关、透明度、速度、字号调节
- 智能防挡字幕
- 弹幕举报/点赞

### 4.3 字幕系统 (Subtitle)

- 多语言字幕支持（JSON 中提取到 12 种语言：zh-CN, zh-Hans, zh-Hant, zh-HK, en-US, ja, ko, de-DE, ru, iw, ca, ase）
- 字幕锁定/解锁机制 (`is_lock`)
- AI 字幕状态追踪 (`ai_type`, `ai_status`)
- 字幕作者归属

### 4.4 控制栏 (Control Bar)

**docker 系统（三层工具栏）：**

| 层级 | CSS 类 | 内容 |
|------|--------|------|
| 主要工具栏 | `bpx-docker-major` | 播放/暂停、进度条、音量、清晰度、倍速、全屏 |
| 次要工具栏 | `bpx-docker-minor` | 各种辅助按钮 |
| 补丁工具栏 | `bpx-docker-patch` | 动态扩展区域 |

**控件功能列表 (从 JS 分析提取)：**

| 功能 | 相关关键词 | 出现频率 |
|------|----------|---------|
| 播放/暂停 | play(3309), pause(234) | 极高频 |
| 进度条 | seek(479), progress(179) | 高频 |
| 音量 | volume(119), mute(74) | 中频 |
| 全屏 | fullscreen(158) | 中频 |
| 画中画 | pip(126) | 中频 |
| 清晰度切换 | switchQuality(27), quality(974) | 高频 |
| 播放速度 | playbackRate(103), speed(65) | 中频 |
| 音频轨道 | switchAudio(9), audio(862) | 高频 |
| 设置面板 | setting(136), panel(147) | 中频 |
| 快捷键 | Shortcut(3) | 低频 |

### 4.5 社区互动功能

| 功能 | JS 关键词 |
|------|----------|
| 点赞 | Like(82), Triple(5) |
| 投币 | Coin(12) |
| 收藏 | Collect(19) |
| 分享 | Share(60) |
| 关注 | WatchLater |
| 三连 | Triple(5) |

### 4.6 结尾面板 (Ending Panel)

- `bpx-player-ending-wrap` → `bpx-player-ending-panel` → `bpx-player-ending-backdrop`
- 视频结束后显示推荐视频卡片
- 支持"稍后再看"快捷操作

### 4.7 其他特性

| 特性 | 说明 |
|------|------|
| 宽屏模式 | `mode-webscreen` CSS 类，窗口宽屏适配 |
| 灯灯模式 (关灯) | `bpx-state-light-off` |
| 黑边控制 | `bpx-state-black-gap`, `hasBlackSide` |
| 镜像模式 | `bpx-state-mirror` |
| 鼠标隐藏 | `bpx-state-no-cursor` (一段时间不移动自动隐藏) |
| 游戏中心入口 | `bpx-player-game-center` |
| 全景视频 | `bpx-player-panorama` |
| 无缝替换 | `bpx-player-seamless-replacement` (切换分P时平滑过渡) |
| 连续播放 | `continuousPlay: true` (在 `__INITIAL_STATE__` 中配置) |
| 迷你播放器 | `bpx-player-mini-site` |

---

## 5. 数据模型

### 5.1 核心数据实体

```
videoData              ← 视频基础信息
├── aid/bvid/cid       ← 视频唯一标识
├── title/desc         ← 标题和描述
├── duration           ← 时长(秒)
├── dimension          ← 原始分辨率 {width, height, rotate}
├── stat               ← 互动统计
│   ├── view/danmaku/reply/favorite/coin/share/like
│   └── ...
├── pages[]            ← 分P列表
│   ├── cid/page/part/duration
│   └── dimension
├── rights             ← 权限控制
│   ├── download/hd5/movie/pay
│   └── no_background/no_share
├── subtitle            ← 字幕列表
│   └── list[] → {id, lan, lan_doc, is_lock, author}
├── owner               ← UP主信息
├── premiere            ← 首映信息
└── embedPlayer         ← 嵌入式播放器配置
```

### 5.2 播放器配置 (primarySetting)

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `element` | HTMLElement | 是 | 播放器挂载容器 |
| `auxiliary` | HTMLElement | 否 | 弹幕辅助容器 |
| `aid` | number | 否 | AV号 |
| `bvid` | string | 是 | BV号 |
| `cid` | number | 是 | 分P ID |
| `p` | number | 否 | 分P序号 (1-based) |
| `t` | number/string | 否 | 起始播放秒数 |
| `kind` | GroupKind | 是 | 内容类型 (Ugc/Bangumi/Live/Classroom) |
| `featureList` | Set<string> | 否 | 特性开关 |
| `stats` | object | 否 | 埋点信息 |
| `enableHEVC` | boolean | 否 | 启用H.265 |
| `enableAV1` | boolean | 否 | 启用AV1 |
| `revision` | number | 否 | 版本号 |
| `autoplay` | boolean | 否 | 自动播放 |
| `prefetch` | object | 否 | 预取的 playUrl |
| `viewInfo` | object | 否 | UP主/视频元信息 |

### 5.3 内容类型 (GroupKind)

| 枚举值 | 对应 helper | 说明 |
|--------|------------|------|
| `Ugc` | `ugc-helper` | 用户生成内容（默认） |
| `Bangumi` | `bangumi-helper` | 番剧/影视 |
| `Classroom` | `classroom-helper` | 课堂/课程 |
| `Live` | (live player) | 直播（独立播放器） |

---

## 6. 资源加载体系

### 6.1 核心资源

| 文件 | URL 模式 | 大小 | 说明 |
|------|---------|------|------|
| 核心播放器 JS | `//s1.hdslb.com/bfs/static/player/main/core.{hash}.js` | ~496KB | nano 框架 + 完整播放器 |
| 视频页 CSS | `//s1.hdslb.com/bfs/static/jinkela/video/css/video.{hash}.css` | ~107KB | 全部页面样式 |
| 字体 (Regular) | `//s1.hdslb.com/bfs/static/jinkela/long/font/regular.css` | - | 常规字体 |
| 字体 (Medium) | `//s1.hdslb.com/bfs/static/jinkela/long/font/medium.css` | - | 中等字重 |

### 6.2 辅助资源

| 文件 | 功能 |
|------|------|
| `log-reporter.js` (`/bfs/seed/log/report/`) | 数据埋点上报 |
| `biliMirror.umd.mini.js` (`/bfs/seed/jinkela/short/b-mirror/`) | 前端错误监控 (Mirror SDK) |
| `cmpt.js` + `fallback.js` (`/bfs/seed/jinkela/short/bmg/register/`) | 组件注册/降级 |
| `bili-collect.js` (`/bfs/cm/cm-sdk/static/js/`) | 用户行为采集 |
| `CaptchaLoader.js` | 风控验证码 SDK |
| `polyfill.js` (`//www.bilibili.com/gentleman/`) | 浏览器兼容 (仅 polyfill `globalThis`) |
| `svga.min.js` | SVGA 动画播放器（礼物特效等） |
| `bili-user-fingerprint.min.js` | 用户指纹采集 |

### 6.3 主题 CSS

| 文件 (bili-theme/) | 说明 |
|-------------------|------|
| `map.css` | 主题变量映射 |
| `light_u.css` | 亮色主题（用户可选） |
| `light.css` | 默认亮色主题 |

---

## 7. 状态管理与事件系统

### 7.1 播放器状态 (bpx-state)

| CSS 类 | 状态 |
|--------|------|
| `bpx-state-paused` | 暂停中 |
| `bpx-state-playing` | 播放中 |
| `bpx-state-buff` | 缓冲中 |
| `bpx-state-loading` | 加载中 |
| `bpx-state-light-off` | 关灯模式 |
| `bpx-state-black-gap` | 黑边可见 |
| `bpx-state-mirror` | 镜像翻转 |
| `bpx-state-no-cursor` | 鼠标隐藏 |
| `bpx-state-regulated-intervals` | 受监管时段 |

### 7.2 事件系统

播放器基于 EventEmitter 模式（在 core JS 中发现 1555+ 次 prototype 方法定义），核心事件包括：

- `video.ended` → 触发结尾面板
- `video.buffering` → 显示加载动画
- `player.resize` → 响应式布局重算
- 心跳机制 (`heartbeat`): 定期上报播放进度

---

## 8. 播放器版本与 A/B 实验

### 8.1 版本信息

- 当前核心版本: `4.9.78`
- 资源版本控制: 文件名包含内容哈希 (如 `core.5652d3dc.js`)

### 8.2 A/B 实验配置

```javascript
window.webAbTest = {
  "webplayer": "1",
  "enable_shortcut_key": "DISABLE",    // 快捷键实验
  "enable_live_anime": "ENABLE",       // 直播动画实验
  "enable_strip_ad": "ENABLE",         // 广告剥离实验
  "comment_version_hash": "fcb41a8b61" // 评论区版本
}
```

页面版本: `new_video`（新版视频页）

---

## 9. 错误监控与容错

### 9.1 白屏检测 (Mirror SDK)

```
检测频率: 最多 10 轮
检测 DOM 节点: #app, #mirror-vdcon, .left-container,
               .right-container, .bpx-player-container,
               .bili-mini-mask, .geetest_panel_ghost
```

### 9.2 错误过滤

- 过滤浏览器扩展引起的错误
- 过滤外部注入脚本异常
- 过滤网络超时/取消类 Promise rejection

### 9.3 兼容性处理

- IE9 及以下: 拒绝访问，提示升级浏览器
- 移动端 UA 检测: 自动从 PC 站跳转至移动站 (`m.bilibili.com`)

---

## 10. 性能优化策略

### 10.1 资源加载

- **preload**: 播放器核心 JS 使用 `<link rel='preload'>` 提前加载
- **prefetch**: `window.__playinfo__` 在 SSR 阶段注入视频流 URL，避免二次 API 请求
- **DNS Prefetch**: `dns-prefetch` 标签预解析 CDN 域名
- **CDN**: `s1.hdslb.com` 分发静态资源

### 10.2 渲染优化

- Canvas 渲染弹幕 (bwp-internal-render-canvas)
- 视频浮层 (video perch) 架构
- 懒加载非首屏组件

### 10.3 响应式适配

```javascript
// 动态计算播放器尺寸的核心逻辑
var w = Math.max(document.body.clientWidth || innerWidth, 1100);
var sidebarWidth = innerWidth > 1680 ? 411 : 350;
var playerHeight = Math.round((playerWidth + sidebarWidth) * 9/16);
// 宽屏模式特殊处理
```

- 支持最小宽度 1100px
- 1680px+ 触发"超大屏"布局调整
- 宽屏模式 (window.isWide) 动态调整侧栏

---

## 11. 安全性

### 11.1 防嵌入

```javascript
// 检查是否被非同源 iframe 嵌入
if (parent != self && 
    (parent.document.domain != document.domain || 
     !/bilibili\.com\//.test(document.referrer))) {
  window.open(location.href, "_top");  // 跳出 iframe
}
```

### 11.2 风控

- 验证码 SDK (`CaptchaLoader.js`): 高风险操作时触发
- 用户指纹 (`bili-user-fingerprint.min.js`): 设备指纹采集，反爬/反作弊
- SPAM 前缀 (`spm_prefix: "333.788"`): 全链路埋点追踪

---

## 12. 关键 API 清单（从 core JS 逆向）

### nano 框架 API

| API | 说明 |
|-----|------|
| `nano.createPlayer(config, theme)` | 创建播放器实例 |
| `nano.GroupKind` | 内容类型枚举 (Ugc/Bangumi/...) |
| `player.connect()` | 初始化连接视频源 |
| `player.disconnect()` | 断开播放器 |
| `player.destroy()` | 销毁播放器实例 |

### 播放器实例 API（推测）

| 方法 | 说明 |
|------|------|
| `player.play()` | 播放 |
| `player.pause()` | 暂停 |
| `player.seek(time)` | 跳转到指定时间 |
| `player.setVolume(0-100)` | 设置音量 |
| `player.setQuality(qn)` | 切换清晰度 |
| `player.setPlaybackRate(rate)` | 设置播放速度 |
| `player.switchAudio(trackId)` | 切换音轨 |
| `player.switchSubtitle(lang)` | 切换字幕 |
| `player.toggleDanmaku(visible)` | 开关弹幕 |
| `player.requestFullscreen()` | 进入全屏 |
| `player.exitFullscreen()` | 退出全屏 |
| `player.requestPip()` | 进入画中画 |
| `player.setTheme(theme)` | 切换主题 |
| `player.on(event, handler)` | 绑定事件 |
| `player.off(event, handler)` | 解绑事件 |

---

## 13. 文件清单

本次逆向保存的文件：

```
b站播放器分析/
├── page_decoded.html          # 解码后的完整 HTML (59KB)
├── player_core.js             # 播放器核心 JS (496KB, v4.9.78)
├── video.css                  # 页面 + 播放器样式 (107KB)
├── initial_state.json         # SSR 注入的初始状态数据 (92KB)
├── inline_scripts.js          # 内联脚本（12个） 
├── aux_log-reporter.js        # 埋点上报 SDK (44KB)
├── aux_biliMirror.umd.mini.js # 错误监控 SDK (34KB)
└── bilibili-player-prd.md     # 本文档
```

---

## 附录: 播放器 DOM 层级（完整）

```
#bilibili-player
├── .bpx-player-container
│   ├── .bpx-player-primary-area          (主视频区)
│   │   ├── .bpx-player-video-wrap        (视频容器)
│   │   │   ├── bwp-video                 (视频渲染引擎)
│   │   │   ├── .bpx-player-video-perch   (视频浮层)
│   │   │   └── .bpx-player-video-poster  (封面图)
│   │   ├── .bpx-player-bas-dm-wrap       (基础弹幕层)
│   │   ├── .bpx-player-cmd-dm-wrap       (高级弹幕层)
│   │   ├── .bpx-player-adv-dm-wrap       (代码弹幕层)
│   │   ├── .bpx-player-render-dm-wrap    (弹幕渲染层)
│   │   ├── .bpx-player-row-dm-wrap       (行弹幕层)
│   │   ├── .bpx-player-dm-mask-wrap      (弹幕遮罩)
│   │   ├── .bpx-player-music-wrap        (音乐信息条)
│   │   ├── .bpx-player-subtitle-wrap     (字幕显示层)
│   │   ├── .bpx-player-context-area      (右键菜单触发区)
│   │   ├── .bpx-player-mouse-event       (鼠标事件捕获)
│   │   ├── .bpx-player-top-wrap          (顶部浮层)
│   │   ├── .bpx-player-business-wrap     (商业推广浮层)
│   │   ├── .bpx-player-interaction-story (互动剧情节)
│   │   ├── .bpx-player-interaction-hidden (隐藏的交互层)
│   │   ├── .bpx-player-panorama          (全景视频控件)
│   │   └── .bpx-player-control-mask      (控制栏遮罩触发区)
│   ├── .bpx-player-control-wrap          (控制栏)
│   │   ├── .bpx-player-progress-area     (进度条区)
│   │   └── .bpx-docker                   (工具栏容器)
│   │       ├── .bpx-docker-major         (主要按钮)
│   │       ├── .bpx-docker-minor         (次要按钮)
│   │       └── .bpx-docker-patch         (扩展按钮)
│   ├── .bpx-player-loading-panel         (加载动画)
│   ├── .bpx-player-state-wrap            (状态提示: 播放/暂停图标)
│   ├── .bpx-player-sending-area          (弹幕发送区)
│   │   └── .bpx-player-sending-bar       (发送栏)
│   ├── .bpx-player-ending-wrap           (结尾面板)
│   │   ├── .bpx-player-ending-panel
│   │   └── .bpx-player-ending-backdrop
│   ├── .bpx-player-share-panel           (分享面板)
│   ├── .bpx-player-pc-app                (PC 客户端推广)
│   ├── .bpx-player-mini-site             (迷你站点)
│   ├── .bpx-player-game-center           (游戏中心入口)
│   └── .bpx-player-hinter-area           (提示信息区)
└── #bilibili-player-placeholder          (未加载时的占位符)
```

---

*本文档通过逆向分析 B站 Web 播放器的前端代码生成，基于 2026-05-08 获取的线上版本。*
