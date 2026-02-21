# Immersive Reader Chrome Extension - 技术实施计划

## 1. Context

基于 PRD 需求，开发一款 Chrome 浏览器插件：AI 驱动的文字转语音 (TTS) 与阅读辅助工具。用户可以用"听"的方式消费网页文本内容，同时获得实时文本高亮和自动滚屏辅助。

**已确认需求 / 默认假设（MVP）**：

- 交付方式：Unpacked 自用/内测（后续上架 Chrome Web Store 再收敛权限）
- 语言覆盖：中文 + 英文（含混排）
- 变速策略：播放中仅调整 `playbackRate`，不重新生成音频

**技术决策**：

| 决策项 | 选择 |
|--------|------|
| 前端框架 | React + TypeScript |
| 构建工具 | Vite + CRXJS v2.0+ |
| TTS 后端 | 用户自行配置 OpenAI 兼容 API endpoint + Key |
| 跨域请求策略 | MVP: `host_permissions: ["<all_urls>"]`（Unpacked 场景） |
| Extension 规范 | Chrome Extension Manifest V3 |
| 状态管理 | Zustand |
| 文本提取 | 主内容检测 + 提取（Readability + 自研启发式 + 站点特化） |
| 中英分词/断句 | `Intl.Segmenter` (优先) + fallback |
| PDF 支持 | 延后，MVP 不含 |

**仓库现状**：空白仓库，仅有 LICENSE、README、.gitignore。

---

## 2. 架构概览

### 2.1 组件通信架构图

```
┌─────────────┐     chrome.runtime      ┌──────────────────────┐
│   Popup     │ ◄────────────────────► │  Background           │
│  (React)    │      .sendMessage       │  Service Worker       │
└─────────────┘                         │                       │
                                        │  - TTS API 调用       │
┌─────────────┐     chrome.runtime      │  - 文本分块           │
│  Options    │ ◄────────────────────► │  - 消息路由           │
│  (React)    │                         └────────┬─────────────┘
└─────────────┘                                  │
                                                 │ chrome.runtime
┌────────────────────────────┐                   │
│  Content Script (React)    │ ◄─────────────────┤
│                            │                   │
│  - 文本提取 (Readability)   │                   │
│  - 高亮引擎 (span 包裹)     │                   ▼
│  - 悬浮播放器 (Shadow DOM)  │         ┌────────────────────┐
│  - 自动滚屏                │         │ Offscreen Document │
│  - Play 按钮注入           │         │                    │
└────────────────────────────┘         │ - 音频播放          │
                                       │ - HTMLAudioElement  │
                                       │ - 时间上报          │
                                       └────────────────────┘
```

### 2.2 各组件运行时能力对比

| 组件 | 运行时上下文 | 可访问 DOM? | chrome.* API | 可播放音频? |
|------|-------------|-------------|--------------|------------|
| Background (Service Worker) | 隔离 | 否 | 完整 | 否 |
| Content Script | 页面 DOM (隔离世界) | 是 | 有限 (runtime, storage) | 是，但受宿主 CSP 限制 |
| Offscreen Document | 扩展 origin | 是 (自有 DOM) | 部分 (runtime, storage 等) | 是 (始终可用) |
| Popup | 扩展 origin | 是 (自有 DOM) | 完整 | 是 (但失焦即关闭) |

### 2.3 为什么用 Offscreen Document 播放音频？

Content Script 虽然技术上能播放音频，但宿主页面的 CSP (Content Security Policy) 可能阻止 `blob:` URL 的使用（如 GitHub、银行网站等严格 CSP 页面）。这会导致静默失败，且难以调试。

Offscreen Document 运行在扩展自身的 origin 下，CSP 完全由我们的 manifest 控制，能保证音频播放始终可用。

---

## 3. 项目结构

```
immersive-reader/
├── manifest.json                        # Chrome Extension Manifest V3
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── icons/                           # 扩展图标 (16, 32, 48, 128px)
│
├── src/
│   ├── shared/                          # 跨组件共享代码
│   │   ├── types.ts                     # 全局 TypeScript 类型定义
│   │   ├── constants.ts                 # 常量 (颜色变量、默认配置值)
│   │   ├── segmentation.ts              # 中英分词/断句（Intl.Segmenter + fallback）
│   │   ├── messages.ts                  # 消息协议类型 (discriminated union)
│   │   └── storage.ts                   # chrome.storage 类型安全封装
│   │
│   ├── background/                      # Service Worker (MV3)
│   │   ├── index.ts                     # 入口点 + 消息路由
│   │   ├── job-manager.ts               # 播放会话 job 管理（tab 隔离、取消、并发）
│   │   ├── tts-service.ts              # TTS API 客户端：分块、请求、渐进生成
│   │   └── offscreen-manager.ts         # Offscreen Document 生命周期管理
│   │
│   ├── offscreen/                       # 音频播放引擎 (独立页面)
│   │   ├── offscreen.html               # 最小化 HTML 壳
│   │   └── offscreen.ts                 # AudioElement 队列播放、控制、时间上报
│   │
│   ├── content/                         # Content Script (注入网页)
│   │   ├── index.tsx                    # Content Script 入口
│   │   ├── App.tsx                      # Shadow DOM 内 React 根组件
│   │   ├── mount.ts                     # Shadow DOM 创建 + React 挂载
│   │   │
│   │   ├── extraction/                  # 文本提取引擎
│   │   │   ├── extractor.ts             # 站点类型检测 + 提取器分发
│   │   │   ├── generic-extractor.ts     # 基于 Readability 的通用网页提取
│   │   │   ├── gmail-extractor.ts       # Gmail 专用 DOM 遍历
│   │   │   ├── gdocs-extractor.ts       # Google Docs 文本提取
│   │   │   └── types.ts                 # ExtractedContent, TextBlock, TextNode 接口
│   │   │
│   │   ├── highlighting/               # 文本高亮与同步引擎
│   │   │   ├── highlighter.ts           # 文本节点 → <span> 包裹
│   │   │   ├── timing-engine.ts         # 按字符比例计算词级时间分配
│   │   │   ├── sync-controller.ts       # 基于音频时间驱动 CSS 高亮切换
│   │   │   └── scroll-manager.ts        # 自动滚屏 (跟随高亮词)
│   │   │
│   │   ├── player/                      # 悬浮播放器组件
│   │   │   ├── FloatingPlayer.tsx       # 主播放器组件
│   │   │   ├── ProgressBar.tsx          # 可点击/拖拽进度条
│   │   │   ├── SpeedSlider.tsx          # 阅读速度滑块 (WPM/CPM)
│   │   │   ├── VoiceSelector.tsx        # 语音选择下拉
│   │   │   ├── PlayerControls.tsx       # Play/Pause, ±15s 快进退按钮
│   │   │   ├── TimeDisplay.tsx          # 当前时间 / 预估总时间
│   │   │   └── player.css              # 播放器样式
│   │   │
│   │   ├── buttons/                     # 页面内注入的 Play 按钮
│   │   │   ├── PlayButtonInjector.ts    # 扫描长文本、注入按钮
│   │   │   └── PlayButton.tsx           # 单个 Play 按钮组件
│   │   │
│   │   └── state/
│   │       └── player-store.ts          # Zustand 状态管理
│   │
│   ├── popup/                           # 扩展弹出面板 (360×520px)
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── Popup.tsx
│   │   ├── popup.css
│   │   └── components/
│   │       ├── PageInfo.tsx             # 当前页字数 + 预估阅读时间
│   │       ├── VoiceSelector.tsx        # 语音选择
│   │       ├── SpeedControl.tsx         # 阅读速度滑块 + 数值显示 (WPM/CPM)
│   │       ├── ListenButton.tsx         # "收听本页" CTA
│   │       └── SettingsLink.tsx         # 跳转设置页
│   │
│   ├── options/                         # 设置页
│   │   ├── index.html
│   │   ├── index.tsx
│   │   ├── Options.tsx
│   │   └── options.css
│   │
│   └── assets/
│       └── icons/                       # SVG 图标
│           ├── play.svg
│           ├── pause.svg
│           ├── skip-forward.svg
│           ├── skip-back.svg
│           ├── volume.svg
│           └── settings.svg
```

---

## 4. 核心数据流

### 4.1 完整朗读流程

```
用户点击 "Play" (Content Script 或 Popup)
  │
  ▼
[Content Script] 调用 extractor 提取文本
  │ 返回 ExtractedContent { blocks, fullText, totalWords, langMode }
  ▼
[Content Script] 生成 jobId (uuid)
  │
  ▼
[Content Script] 发送 TTS_REQUEST { jobId, text, voice, model, responseFormat, langMode, initialPlaybackRate } → Background
  │
  ▼
[Background Service Worker]
  1. job-manager: 以 tabId 隔离会话；新 job 到来自动 cancel 同 tab 旧 job
  2. 将文本按句子边界分块 (≤4000 字符/块；中英标点均识别)
  3. 调用 ensureOffscreen() 确保 Offscreen Document 存在
  4. 发送 AUDIO_SET_PLAYBACK_RATE { jobId, playbackRate } → Offscreen
  5. 对每个块:
     a. POST 到用户配置的 API endpoint → 获取音频 ArrayBuffer
     b. 发送 AUDIO_LOAD_CHUNK { jobId, chunkIndex, audioData } → Offscreen
     c. 发送 TTS_CHUNK_READY { jobId, chunkIndex, chunkMeta } → Content Script
  6. 所有块完成后发送 TTS_COMPLETE { jobId }
  │
  ▼
[Offscreen Document]
  1. 接收音频块 ArrayBuffer
  2. 创建 Blob → URL.createObjectURL → HTMLAudioElement
  3. 管理播放队列 (当前块 + 下一块预加载)
  4. timeupdate 事件 → 发送 AUDIO_TIME_UPDATE { jobId, chunkIndex, currentTime, duration }
  5. 当前块结束 → 自动播放下一块
  │
  ▼
[Background] 转发 PLAYBACK_STATE_UPDATE → Content Script (约 4Hz)
  │ 包含 jobId, globalTime, chunkIndex, isPlaying
  ▼
[Content Script]
  1. timing-engine: globalTime → 当前 segment index (二分查找)
  2. sync-controller: 更新 DOM 高亮
     - 当前句子所有 span: .ir-sentence-active (bg: #F5F5F5)
     - 当前 segment span: .ir-word-active (bg: #1A1A1A, color: #FFFFFF)
  3. scroll-manager: 如果当前 segment 接近视口边缘，自动滚屏
```

### 4.2 播放控制流程

```
用户操作 (play/pause/seek/变速)
  → Content Script player-store action
  → chrome.runtime.sendMessage PLAYBACK_CONTROL
  → Background 转发对应命令 → Offscreen
  → Offscreen 执行 audio.play() / audio.pause() / audio.currentTime = x / audio.playbackRate = y
```

---

## 5. 消息协议设计

### 5.1 消息类型总表

| 方向 | 消息类型 | Payload | 用途 |
|------|---------|---------|------|
| Content → Background | `TTS_REQUEST` | `{ jobId, text, voice, model, responseFormat, langMode, initialPlaybackRate }` | 发起生成并准备播放 |
| Content → Background | `TTS_CANCEL` | `{ jobId }` | 取消某次会话（同时停止播放并清理） |
| Content → Background | `PLAYBACK_CONTROL` | `{ jobId, action: 'play'\|'pause'\|'seek'\|'setPlaybackRate'\|'stop', value? }` | 播放控制 |
| Content → Background | `GET_PLAYBACK_STATE` | `{ jobId? }` | 查询当前播放状态 |
| Background → Content | `TTS_STARTED` | `{ jobId }` | 已开始处理本次会话 |
| Background → Content | `TTS_CHUNK_READY` | `{ jobId, chunkIndex, totalChunks, chunkMeta }` | 某块音频已就绪 |
| Background → Content | `TTS_COMPLETE` | `{ jobId, totalChunks }` | 所有块生成完成 |
| Background → Content | `TTS_ERROR` | `{ jobId, error, chunkIndex? }` | 错误通知 |
| Background → Content | `PLAYBACK_STATE_UPDATE` | `{ jobId, globalTime, chunkIndex, isPlaying, duration, playbackRate }` | 播放进度同步 (~4Hz) |
| Background → Offscreen | `AUDIO_LOAD_CHUNK` | `{ jobId, chunkIndex, audioData, totalChunks }` | 加载音频块到队列 |
| Background → Offscreen | `AUDIO_PLAY` | `{ jobId }` | 开始/恢复播放 |
| Background → Offscreen | `AUDIO_PAUSE` | `{ jobId }` | 暂停 |
| Background → Offscreen | `AUDIO_SEEK` | `{ jobId, globalTime }` | 跳转到指定时间 |
| Background → Offscreen | `AUDIO_SET_PLAYBACK_RATE` | `{ jobId, playbackRate }` | 设置播放速率 |
| Background → Offscreen | `AUDIO_STOP` | `{ jobId }` | 停止并清理队列 |
| Offscreen → Background | `AUDIO_TIME_UPDATE` | `{ jobId, chunkIndex, currentTime, duration }` | 播放时间上报 |
| Offscreen → Background | `AUDIO_ENDED` | `{ jobId }` | 所有音频播放结束 |
| Offscreen → Background | `CHUNK_DURATION_KNOWN` | `{ jobId, chunkIndex, duration }` | 音频实际时长 (用于校准高亮) |
| Popup → Background | `START_PAGE_READING` | `{ tabId }` | "收听本页" 按钮 |
| Popup → Background | `GET_PAGE_INFO` | `{ tabId }` | 请求页面字数等信息 |
| Background → Popup | `PAGE_INFO_RESPONSE` | `{ wordCount, isPlaying, ... }` | 页面信息响应 |

### 5.2 TypeScript 类型定义

```typescript
// src/shared/messages.ts

export type ExtensionMessage =
  | { type: 'TTS_REQUEST'; payload: { jobId: string; text: string; voice: string; model: string; responseFormat: string; langMode: 'space' | 'cjk'; initialPlaybackRate: number } }
  | { type: 'TTS_CANCEL'; payload: { jobId: string } }
  | { type: 'PLAYBACK_CONTROL'; payload: { jobId: string; action: 'play' | 'pause' | 'seek' | 'setPlaybackRate' | 'stop'; value?: number } }
  | { type: 'GET_PLAYBACK_STATE'; payload: { jobId?: string } }
  | { type: 'TTS_STARTED'; payload: { jobId: string } }
  | { type: 'TTS_CHUNK_READY'; payload: { jobId: string; chunkIndex: number; totalChunks: number; chunkMeta: unknown } }
  | { type: 'TTS_COMPLETE'; payload: { jobId: string; totalChunks: number } }
  | { type: 'TTS_ERROR'; payload: { jobId: string; error: string; chunkIndex?: number } }
  | { type: 'PLAYBACK_STATE_UPDATE'; payload: { jobId: string; globalTime: number; chunkIndex: number; isPlaying: boolean; duration: number; playbackRate: number } }
  | { type: 'AUDIO_LOAD_CHUNK'; payload: { jobId: string; chunkIndex: number; audioData: ArrayBuffer; totalChunks: number } }
  | { type: 'AUDIO_PLAY'; payload: { jobId: string } }
  | { type: 'AUDIO_PAUSE'; payload: { jobId: string } }
  | { type: 'AUDIO_SEEK'; payload: { jobId: string; globalTime: number } }
  | { type: 'AUDIO_SET_PLAYBACK_RATE'; payload: { jobId: string; playbackRate: number } }
  | { type: 'AUDIO_STOP'; payload: { jobId: string } }
  | { type: 'AUDIO_TIME_UPDATE'; payload: { jobId: string; chunkIndex: number; currentTime: number; duration: number } }
  | { type: 'AUDIO_ENDED'; payload: { jobId: string } }
  | { type: 'CHUNK_DURATION_KNOWN'; payload: { jobId: string; chunkIndex: number; duration: number } }
  | { type: 'START_PAGE_READING'; payload: { tabId: number } }
  | { type: 'GET_PAGE_INFO'; payload: { tabId: number } }
  | { type: 'PAGE_INFO_RESPONSE'; payload: { wordCount: number; isPlaying: boolean } };
```

---

## 6. 核心技术模块详细设计

### 6.1 文本提取引擎

#### 数据结构

```typescript
// src/content/extraction/types.ts

type LangMode = 'space' | 'cjk'; // space: 以空格分词语言；cjk: 中日韩等无空格语言

interface TextNode {
  // 文本内容（注意：不要在内存中长期保存大量重复字符串；MVP 可只在构建 fullText 时临时读取）
  text: string;
  element: HTMLElement;      // 对应的 DOM 元素引用
  charCount: number;
  wordCount: number;         // 仅 space 语言有效（用于 UI 统计）
  unitCount: number;         // 用于变速/预估时长：space=word；cjk=segmented word 或 fallback 到 char
  charOffset: number;        // 在完整文本中的字符偏移
}

interface TextBlock {
  id: string;                // 唯一标识
  nodes: TextNode[];         // 块内有序文本节点
  element: HTMLElement;      // 块级容器元素
  totalChars: number;
  totalWords: number;
  totalUnits: number;
}

interface ExtractedContent {
  title: string;
  blocks: TextBlock[];
  fullText: string;          // 拼接后的纯文本
  langMode: LangMode;
  totalChars: number;
  totalWords: number;
  totalUnits: number;
  siteType: 'generic' | 'gmail' | 'gdocs';
}
```

#### 站点检测与分发

```typescript
// src/content/extraction/extractor.ts

function detectSiteType(): SiteType {
  const hostname = window.location.hostname;
  if (hostname === 'mail.google.com') return 'gmail';
  if (hostname === 'docs.google.com' &&
      window.location.pathname.startsWith('/document/')) return 'gdocs';
  return 'generic';
}

async function extractContent(): Promise<ExtractedContent> {
  const siteType = detectSiteType();
  switch (siteType) {
    case 'gmail':  return extractGmail();
    case 'gdocs':  return extractGDocs();
    default:       return extractGeneric();
  }
}
```

#### 通用提取器

核心难点是“定位有价值的正文”且需要能回到**活 DOM**做高亮。为避免“Readability 克隆 DOM 后再做文本匹配映射”这种高复杂度/低稳定方案，MVP 的通用提取器采用 **主内容 root 侦测 + 活 DOM 遍历**，并将 Readability 作为 fallback：

1. **主内容 root 侦测（从活 DOM 直接选 root）**
   - 优先：`<article>`、`<main>`（需满足最小可见文本阈值 + 低链接密度）
   - 其次：在候选容器（`section/div` 等）中用启发式打分选择：
     - `score = visibleTextLen - linkTextLen*2 - boilerplatePenalty`
     - 排除/降权：`nav/header/footer/aside/form`、高链接密度、display:none、极短块
2. **块级采集（输出可高亮的 TextBlock）**
   - 在 root 内采集 block-level 元素：`p/li/blockquote/h1-h3`（MVP 暂不朗读 `pre/code`，避免把代码读出来）
   - 过滤：过短段落、纯导航/按钮文本、重复段落（简单 hash 去重）
   - 生成 `TextBlock`（element + nodes[]），并拼接 `fullText`
3. **Readability fallback**
   - 若 root 侦测失败（score/字数过低），再用 `@mozilla/readability` 提取纯文本用于朗读
   - 同时降级：关闭词级高亮（仅显示悬浮播放器 + 可选句级/段级高亮），并提示“该页面结构复杂，已使用降级模式”

#### 语言模式判定与分词（`src/shared/segmentation.ts`）

因为 MVP 需要同时支持英文与中文，高亮、chunk 元信息、时长预估都不能只依赖“按空格分词”。统一定义 **unit**：
- `langMode='space'`：unit = word（英文等以空格分词语言）
- `langMode='cjk'`：unit = `Intl.Segmenter` 的 word segment；若不可用则 fallback 到逐字

判定 `langMode`（用于 ExtractedContent 与后续全链路一致）：
- 优先读取 `document.documentElement.lang`（如 `zh`/`en`）
- fallback：抽样 `fullText`，按 CJK 字符比例阈值判定（例如 CJK 占比 > 0.3 → `cjk`）

分词实现：
- 优先：`new Intl.Segmenter(locale, { granularity: 'word' })`
- space fallback：正则按空白/标点切分
- cjk fallback：按 Unicode 字符切分（保留标点为独立 unit，便于断句）

#### Gmail 提取器

Gmail 邮件正文的稳定选择器：`div.a3s.aiL`。线程视图取最后一封展开邮件。需实现 fallback 选择器链，因 Gmail DOM 可能随版本更新变化。

#### Google Docs 提取器

HTML 渲染模式使用 `.kix-wordhtmlgenerator-word-node` 选择器。Canvas 渲染模式（新版）无法直接从 DOM 提取文本，MVP 阶段优雅降级并提示用户。

---

### 6.2 TTS 管道

#### 文本分块

```typescript
// src/background/tts-service.ts

const MAX_CHUNK_CHARS = 4000;  // 留余量，低于 OpenAI 的 4096 限制

interface TTSChunk {
  index: number;
  // 为避免把整篇文章切成很多子字符串长期驻留内存，chunk 只存偏移量；
  // 生成时再用 fullText.slice(startCharOffset, endCharOffset) 得到本块文本。
  startCharOffset: number;
  endCharOffset: number;
  charCount: number;
  unitCount: number;
  startUnitIndex: number;  // 全局 unit 索引（用于高亮同步；space=word，cjk=segment/char）
  endUnitIndex: number;
}
```

分块策略：
1. 维护当前扫描位置 `cursor`（char offset），每块记录 `startCharOffset/endCharOffset`
2. 如果剩余文本 ≤ 4000 字符，整体作为一块
3. 否则在 4000 字符内找最后一个句子边界（中英：`[.!?。！？]`）
4. 无句子边界时 fallback 到最后一个空格；再不行才硬切
5. 为高亮同步，记录每块的全局 unit 索引范围（由 `shared/segmentation.ts` 计算，保证 Background/Content 一致）

#### API 调用

```typescript
async function generateChunkAudio(chunkText: string, settings: TTSSettings): Promise<ArrayBuffer> {
  const response = await fetch(`${settings.apiEndpoint}/audio/speech`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      input: chunkText,
      voice: settings.voice,
      // 变速策略：播放中仅调 playbackRate，不在生成侧叠加 speed，避免“生成速度 * playbackRate”导致不可控
      speed: 1.0,
      response_format: settings.responseFormat ?? 'mp3',
    }),
  });
  return response.arrayBuffer();
}
```

#### 渐进生成

Background 逐块生成音频，每块就绪即发送到 Offscreen 供播放。第一块生成完毕即可开始播放；后续块在播放过程中异步生成并预加载，目标是避免网络/接口波动导致断播，同时避免“生成过快导致音频堆积”带来的内存峰值。

**背压（Backpressure）与并发策略（内存关键）**：
- 生成侧并发：`GEN_CONCURRENCY = 1~2`（MVP 推荐 2，用于快速把缓冲区拉起来；仍保证按 chunkIndex 顺序入队）
- 缓冲窗口：限制“已生成但尚未播放到”的 chunk 数量，默认：
  - `MAX_BUFFER_AHEAD_CHUNKS = 2`（最多比当前播放 chunk 超前 2 块）
  - `MAX_BUFFER_BEHIND_CHUNKS = 1`（保留上一块用于小幅回退 seek；更早的块允许释放）
- Background 侧根据 Offscreen 上报的 `chunkIndex`（来自 `AUDIO_TIME_UPDATE`）计算 `ahead = generatedMax - playingChunkIndex`：
  - `ahead >= MAX_BUFFER_AHEAD_CHUNKS` → 暂停继续生成（`await` 一段时间或等待下一次进度上报）
  - `ahead < MAX_BUFFER_AHEAD_CHUNKS` → 继续生成下一块

**超大文本硬限制（防止极端页面导致内存/费用失控）**：
- 定义 `MAX_JOB_CHARS` / `MAX_JOB_UNITS`（例如 200k chars / 50k units）。超出时：
  - 默认只朗读前 N 个 unit（UI 提示“内容过长，已截断”）
  - 或提供“从选中文本开始朗读”作为替代入口（Phase 4 打磨项）

---

### 6.3 Offscreen 音频播放引擎

```typescript
// src/offscreen/offscreen.ts

// 核心数据结构
interface AudioChunkEntry {
  chunkIndex: number;
  audioElement: HTMLAudioElement;
  duration: number;
  meta: TTSChunk;
}

const audioQueue: AudioChunkEntry[] = [];
let currentChunkIndex = -1;
let playbackRate = 1.0;
```

关键行为：
- 接收 `AUDIO_LOAD_CHUNK`：ArrayBuffer → Blob → URL.createObjectURL → HTMLAudioElement
- `loadedmetadata` 事件：获取实际 duration，上报 `CHUNK_DURATION_KNOWN`
- `timeupdate` 事件：上报 `AUDIO_TIME_UPDATE` (约 4Hz)
- `ended` 事件：自动播放下一块，或上报 `AUDIO_ENDED`
- 支持跨块 seek：根据 globalTime 计算目标块和块内偏移
- 接收 `AUDIO_SET_PLAYBACK_RATE`：设置 `audio.playbackRate`

**内存与资源管理（必须实现，否则长文必炸）**：
- Offscreen 侧只保留一个滑动窗口的音频对象：
  - 当前播放 chunk + `MAX_BUFFER_AHEAD_CHUNKS` 个未来 chunk
  - 可选保留 `MAX_BUFFER_BEHIND_CHUNKS` 个历史 chunk（便于 -15s 或小幅拖动回退）
- 对于超出窗口的历史 chunk，执行释放：
  - `audio.pause()`
  - `audio.src = ''` + `audio.load()`（提示浏览器释放解码缓冲）
  - `URL.revokeObjectURL(blobUrl)`
  - 从 `audioQueue` / map 中移除引用（确保 GC）
- `AUDIO_LOAD_CHUNK` 处理完成后不得持久化 `ArrayBuffer` 引用（只用它生成 Blob；随后让其可 GC）
- `AUDIO_STOP` / `TTS_CANCEL` / 页面卸载时：清空队列并 revoke 所有 blob URL，防止 objectURL 泄漏

生命周期注意：`AUDIO_PLAYBACK` 原因创建的 Offscreen Document 在音频停止 30 秒后自动关闭。Background 在每次操作前调用 `ensureOffscreen()` 按需重建。

---

### 6.4 文本高亮与同步引擎

#### 6.4.1 文本包裹 (Span 注入)

播放开始前，将提取到的所有文本节点按 `langMode` 分割为“朗读单元（unit/segment）”，并将每个 unit 包裹在 `<span>` 中（空白保持为原始 Text，避免破坏排版）：

```typescript
// src/content/highlighting/highlighter.ts

interface WrappedUnit {
  globalIndex: number;        // 全局 unit 索引（space=word；cjk=segment/char）
  element: HTMLSpanElement;   // 包裹 span
  text: string;
  sentenceIndex: number;      // 所属句子索引
}

interface WrappedSentence {
  sentenceIndex: number;
  units: WrappedUnit[];
  startUnitIndex: number;
  endUnitIndex: number;
}
```

实现方式：
1. 对每个 TextBlock 中的 TextNode，使用 `TreeWalker` 找到实际的 `Text` DOM 节点
2. 使用 `shared/segmentation.ts` 的 `segmentText()`（优先 `Intl.Segmenter`，fallback：space 按空格、cjk 按字符）
3. 每个非空白 unit 创建 `<span class="ir-word" data-unit-index="N">`（CSS 仍沿用 `.ir-word*` 命名）
4. 用 `DocumentFragment` + `replaceChild` 替换原文本节点
5. 在句子结束标点（中英：`[.!?。！？]`）处划分句子边界

**高亮的内存/性能保护（MVP 必做）**：
- Span 包裹会显著增加 DOM 节点数，尤其中文逐字模式下 unit 数量很大；需要阈值降级，避免页面卡死或内存飙升
- 建议阈值（可后续调参）：
  - `MAX_UNITS_FOR_UNIT_HIGHLIGHT = 50_000`
  - `MAX_CHARS_FOR_DOM_WRAP = 200_000`
- 触发阈值时的降级策略：
  - 自动关闭 unit 高亮（`highlightWord=false`），仅保留句级或段级高亮
  - 段级高亮实现：只给当前 `TextBlock.element` 加 `.ir-block-active` class（不做 span 注入）
- 停止/取消/导航离开时必须清理：
  - unit 模式：移除所有注入的 span（或整体还原 root 的 `innerHTML`，以“只读正文 root”为边界重建，避免影响全页面）
  - 句/段模式：移除 `.ir-*-active` classes + event listeners

#### 6.4.2 近似 unit 级时间计算

由于 OpenAI 兼容 API 不返回 unit 级时间戳，采用按字符比例近似分配：

```typescript
// src/content/highlighting/timing-engine.ts

interface UnitTiming {
  globalIndex: number;  // unit index
  startTime: number;     // 秒，相对全局音频起点
  endTime: number;
  chunkIndex: number;
}

function calculateTimings(chunks: TTSChunk[], chunkDurations: Map<number, number>): UnitTiming[] {
  // 对每个块：
  //   总字符数 = chunk.text.length
  //   每个 unit 的时间 = (unitCharLen / totalChars) * chunkDuration
  //   叠加全局时间偏移
}
```

精度约 ~90%，对阅读辅助场景完全足够。每块实际 duration 来自 Offscreen 上报的 `CHUNK_DURATION_KNOWN`，比估算更准确。

#### 6.4.3 同步控制器

```typescript
// src/content/highlighting/sync-controller.ts

class SyncController {
  // 接收 PLAYBACK_STATE_UPDATE 消息 (~4Hz)
  // 二分查找当前 globalTime 对应的 unitIndex
  // 与上一帧比较，仅在变化时更新 DOM：
  //   - 移除旧 unit 的 .ir-word-active
  //   - 移除旧句子的 .ir-sentence-active
  //   - 添加新 unit 的 .ir-word-active
  //   - 添加新句子的 .ir-sentence-active
}
```

#### 6.4.4 高亮 CSS

```css
.ir-sentence-active {
  background-color: #F5F5F5 !important;
  border-radius: 2px;
  transition: background-color 0.15s ease;
}

.ir-word-active {
  background-color: #1A1A1A !important;
  color: #FFFFFF !important;
  border-radius: 2px;
  padding: 0 1px;
  transition: background-color 0.1s ease, color 0.1s ease;
}

/* 降级模式：只高亮段落/块级容器 */
.ir-block-active {
  background-color: #F5F5F5 !important;
  border-radius: 4px;
  box-decoration-break: clone;
}
```

#### 6.4.5 自动滚屏

```typescript
// src/content/highlighting/scroll-manager.ts

class ScrollManager {
  // 检测当前高亮 unit 是否在视口中间 40% 区域外
  // 如果超出，使用 scrollIntoView({ behavior: 'smooth', block: 'center' })
  // 检测用户手动滚动 (wheel/touchmove)，暂停自动滚屏 5 秒
}
```

---

### 6.5 悬浮播放器

#### Shadow DOM 挂载

```typescript
// src/content/mount.ts

function mountContentUI(): void {
  const host = document.createElement('div');
  host.id = 'immersive-reader-root';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;';

  const shadow = host.attachShadow({ mode: 'open' });
  // 注入样式 (player.css 作为字符串)
  // 创建 React 挂载点
  // createRoot().render(<App />)
  document.body.appendChild(host);
}
```

使用 Shadow DOM 实现完全样式隔离，防止宿主页面 CSS 污染播放器 UI。

#### 播放器组件树

```
FloatingPlayer
├── 顶部栏
│   ├── TimeDisplay (当前时间 / 总时间)
│   ├── 预估阅读时间 (~X min)
│   └── 最小化按钮
├── ProgressBar (可点击/拖拽)
├── PlayerControls
│   ├── SkipBack (-15s)
│   ├── Play/Pause
│   └── SkipForward (+15s)
└── 设置区
    ├── SpeedSlider (阅读速度：WPM/CPM)
    └── VoiceSelector
```

#### 视觉规格 (PRD 对齐)

- 药丸形设计：`height: 48px`, `border-radius: 24px`
- 背景色：`#FFFFFF`，边框：`1px solid #E5E5E5`
- 阴影：`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08)`
- 交互动画：`transition: all 0.2s ease-in-out`，按下缩放 `transform: scale(0.95)`
- 定位：`position: fixed`，底部居中或右下角
- 层级：`z-index: 2147483647` (最大值)

---

### 6.6 Zustand 状态管理

```typescript
// src/content/state/player-store.ts

interface PlayerState {
  // 播放状态
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;          // 全局时间 (秒)
  totalDuration: number;        // 估算总时长
  currentUnitIndex: number;
  currentChunkIndex: number;
  totalChunks: number;

  // 用户设置 (同步 chrome.storage)
  rateUPM: number;              // 阅读速度（单位/分钟）；UI 根据 langMode 显示为 WPM 或 CPM
  voice: string;
  volume: number;

  // UI 状态
  isPlayerVisible: boolean;
  isMinimized: boolean;

  // 内容
  extractedContent: ExtractedContent | null;
  totalWords: number;

  // Actions
  play: () => void;
  pause: () => void;
  seekForward: () => void;      // +15s
  seekBackward: () => void;     // -15s
  seekTo: (time: number) => void;
  setRateUPM: (rate: number) => void;
  setVoice: (voice: string) => void;
  updatePlaybackState: (state: Partial<PlayerState>) => void;
}
```

内存注意：
- `extractedContent` 持有大量 DOM 引用与索引数组，只能保存在 Content Script 内存中
- 停止播放 / 页面导航 / tab 关闭时必须 `extractedContent=null`，并清理所有 listeners/observers，避免 SPA 场景下累积泄漏
- 不将 `extractedContent`、timings、任何音频数据写入 `chrome.storage`（只存用户设置与极小会话状态）

---

### 6.7 Extension Popup

#### 组件树

```
Popup (360×520px)
├── Header (固定)
│   └── "Immersive Reader" 标题
├── Scrollable Body
│   ├── PageInfo
│   │   ├── 当前页字数
│   │   └── 按当前速度的预估阅读时间 (WPM/CPM)
│   ├── VoiceSelector
│   ├── SpeedControl (阅读速度滑块 + 数值：WPM/CPM)
│   └── ListenButton ("收听本页" CTA)
└── Footer (固定)
    └── SettingsLink → 跳转 Options 页
```

#### Popup ↔ Content Script 通信

Popup 通过 `chrome.tabs.sendMessage(tabId, ...)` 与当前活动标签页的 Content Script 通信。点击 "收听本页" 后关闭 Popup (`window.close()`)，让用户看到页面上的播放器和高亮效果。

---

### 6.8 设置页 (Options)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `apiEndpoint` | string | `''` | OpenAI 兼容 API 基础地址 |
| `apiKey` | string | `''` | API Key |
| `ttsModel` | string | `'tts-1'` | TTS 模型名称 |
| `selectedVoice` | string | `'alloy'` | 语音选项 |
| `rateUPM` | number | `200` | 阅读速度（单位/分钟；space 显示 WPM、cjk 显示 CPM；范围建议 100-900） |
| `responseFormat` | string | `'mp3'` | 音频输出格式 |
| `autoScroll` | boolean | `true` | 是否自动滚屏 |
| `highlightWord` | boolean | `true` | 是否启用词级高亮 |
| `highlightSentence` | boolean | `true` | 是否启用句级高亮 |

所有设置使用 `chrome.storage.local`。临时会话状态 (如各标签页播放位置) 使用 `chrome.storage.session`。

#### 阅读速度 ↔ playbackRate 映射

基准假设（MVP 经验值，可在真实样本上再校准）：
- `playbackRate=1.0` 时，英文约 150 WPM
- `playbackRate=1.0` 时，中文约 300 CPM

```
BASE_UPM_SPACE = 150
BASE_UPM_CJK = 300

playbackRate =
  langMode === 'space'
    ? clamp(rateUPM / BASE_UPM_SPACE, 0.5, 3.0)
    : clamp(rateUPM / BASE_UPM_CJK, 0.5, 3.0)
```

实际语速会因 voice、内容而变化，但本映射足够用于“阅读辅助 + 高亮同步”。生成侧 TTS 固定 `speed=1.0`，变速只通过 `playbackRate` 实时生效。

---

## 7. Manifest V3 配置

```json
{
  "manifest_version": 3,
  "name": "Immersive Reader",
  "version": "0.1.0",
  "description": "AI-powered text-to-speech with real-time highlighting for any web page",
  "permissions": ["activeTab", "storage", "offscreen"],
  "host_permissions": ["<all_urls>"],
  "action": {
    "default_popup": "src/popup/index.html",
    "default_icon": {
      "16": "public/icons/icon-16.png",
      "48": "public/icons/icon-48.png",
      "128": "public/icons/icon-128.png"
    }
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "js": ["src/content/index.tsx"],
      "matches": ["<all_urls>"],
      "run_at": "document_idle"
    }
  ],
  "icons": {
    "16": "public/icons/icon-16.png",
    "48": "public/icons/icon-48.png",
    "128": "public/icons/icon-128.png"
  }
}
```

---

## 8. NPM 依赖清单

### 生产依赖

| 包名 | 用途 |
|------|------|
| `react` | UI 框架 |
| `react-dom` | React DOM 渲染 |
| `zustand` | 轻量级状态管理 |
| `@mozilla/readability` | 文本提取 (Reader View 算法) |

### 开发依赖

| 包名 | 用途 |
|------|------|
| `typescript` | TypeScript 编译 |
| `vite` | 构建工具 |
| `@crxjs/vite-plugin` | Chrome Extension 构建支持 |
| `@vitejs/plugin-react` | React Fast Refresh |
| `@types/react` | React 类型 |
| `@types/react-dom` | ReactDOM 类型 |
| `@types/chrome` | Chrome Extension API 类型 |

---

## 9. 分阶段实施计划

### Phase 1: 项目骨架 + 基础设施

**目标**：项目可构建、可加载到 Chrome，消息传递和存储层就绪。

**要创建的文件**：
- 构建配置：`package.json`, `tsconfig.json`, `vite.config.ts`
- 扩展清单：`manifest.json`
- 共享层：`src/shared/types.ts`, `constants.ts`, `segmentation.ts`, `messages.ts`, `storage.ts`
- Background：`src/background/index.ts` (消息路由骨架), `src/background/job-manager.ts` (会话管理骨架)
- Popup：`src/popup/index.html`, `index.tsx`, `Popup.tsx`, `popup.css`
- Options：`src/options/index.html`, `index.tsx`, `Options.tsx`, `options.css`
- Content Script：`src/content/index.tsx` (最小化注入确认)
- 占位图标：`public/icons/`

**验证方式**：
- `npm run dev` 成功启动
- Chrome 加载 unpacked 扩展无报错
- Popup 正常打开
- Options 页面可保存/读取配置
- Content Script 注入到页面 (console 确认)

---

### Phase 2: TTS 管道 + 音频播放

**目标**：从网页提取文本 → 调用 TTS API → 音频播放。端到端流程跑通。

**要创建的文件**：
- 文本提取：`src/content/extraction/types.ts`, `extractor.ts`, `generic-extractor.ts`
- TTS 管道：`src/background/tts-service.ts`, `offscreen-manager.ts`
- Offscreen：`src/offscreen/offscreen.html`, `offscreen.ts`
- UI 挂载：`src/content/mount.ts`, `App.tsx`
- 播放器 (基础版)：`src/content/player/FloatingPlayer.tsx`, `PlayerControls.tsx`, `player.css`
- 状态：`src/content/state/player-store.ts`
- Popup 组件：`components/ListenButton.tsx`, `PageInfo.tsx`

**新增依赖**：`@mozilla/readability`

**验证方式**：
- 打开文章页面（英文：Medium/Wikipedia；中文：知乎/新闻站/公众号文章）
- 点击 Popup "Listen to this page"
- Console 可见文本提取日志
- API 被正确调用
- 音频从 Offscreen Document 播放
- Play/Pause 切换正常
- >4000 字符文章触发多块生成，播放不中断（至少提前缓冲 1 块）
- 测试错误场景：无效 API Key, 不可达 endpoint
- 内存/资源检查：
  - Offscreen 缓冲窗口生效：ahead chunk 数不超过 `MAX_BUFFER_AHEAD_CHUNKS`
  - 停止/取消后 objectURL 被 revoke，Chrome Task Manager 中扩展内存回落且不持续增长

---

### Phase 3: 高亮引擎 + 完整播放器

**目标**：unit 级/句级实时高亮同步，完整悬浮播放器 UI，自动滚屏。

**要创建的文件**：
- 高亮引擎：`src/content/highlighting/highlighter.ts`, `timing-engine.ts`, `sync-controller.ts`, `scroll-manager.ts`
- 完整播放器：`ProgressBar.tsx`, `SpeedSlider.tsx`, `VoiceSelector.tsx`, `TimeDisplay.tsx`
- Play 按钮：`src/content/buttons/PlayButtonInjector.ts`, `PlayButton.tsx`
- Popup 组件：`VoiceSelector.tsx`, `SpeedControl.tsx`
- 图标：`src/assets/icons/*.svg`
- 全局样式：`src/assets/styles/global.css`

**验证方式**：
- 播放文章时：
  - 当前句子有浅灰色背景
  - 当前 unit 有黑底白字反色高亮（英文=词；中文=分词/逐字）
  - 高亮平滑前进，无跳跃/卡顿
  - 页面自动滚屏跟随
  - 手动滚动暂停自动滚屏 5 秒
- 进度条可点击跳转
- ±15s 快进退正常
- 速度滑块实时改变播放速率
- 语音选择生效
- 长文本旁自动出现 Play 按钮
- 播放器可最小化/展开
- 大页面降级验证：
  - unit 数/字符数超过阈值时自动降级到句/段高亮，页面不冻结、不显著卡顿

---

### Phase 4: Gmail/GDocs + 打磨

**目标**：特殊站点支持，边界情况，生产就绪。

**要创建的文件**：
- `src/content/extraction/gmail-extractor.ts`
- `src/content/extraction/gdocs-extractor.ts`
- `src/popup/components/SettingsLink.tsx`

**功能要点**：
- Gmail：提取邮件正文 (`.a3s.aiL` 选择器 + fallback)
- Google Docs：HTML 渲染模式提取 + canvas 模式优雅降级
- 页面导航清理：移除高亮、停止音频、重置状态
- SPA 导航检测：URL 变化时重新初始化
- 键盘快捷键：Space (play/pause), ← → (skip)
- 错误状态 UI：无文本、API 超时、配额耗尽
- 加载 skeleton 状态
- 无障碍 ARIA labels
- 性能优化：debounce timeupdate, 避免高亮时的 layout thrash

**验证方式**：
- Gmail 中打开邮件 → 播放正文
- Gmail 线程视图 → 提取最新邮件
- Google Docs (HTML 模式) → 提取并朗读
- 播放中导航离开 → 音频停止，高亮清除
- 10000+ words/字 → 多块无缝播放
- 键盘快捷键不与页面快捷键冲突

---

## 10. 依赖构建顺序

```
Phase 1:
  shared/types.ts ─────────────────────┐
  shared/constants.ts                  │
  shared/segmentation.ts ◄── types     │
  shared/storage.ts ◄─── types         ├── Phase 1 基础
  shared/messages.ts ◄── types         │
  background/index.ts ◄── messages     │
  background/job-manager.ts ◄── messages
  popup/* ◄── storage                  │
  options/* ◄── storage                │
  content/index.tsx (stub)             │
                                       │
Phase 2:                               │
  extraction/* ◄── types ◄─────────────┘
  background/tts-service.ts ◄── messages, storage
  background/offscreen-manager.ts ◄── messages
  offscreen/* ◄── messages
  content/state/* ◄── types
  content/mount.ts
  content/App.tsx ◄── state, mount
  content/player/* (基础) ◄── state

Phase 3:
  highlighting/* ◄── extraction types, state
  content/player/* (完整) ◄── state
  content/buttons/* ◄── extraction, state

Phase 4:
  extraction/gmail-* ◄── extraction types
  extraction/gdocs-* ◄── extraction types
  打磨所有现有文件
```

---

## 11. 技术风险与缓解

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| 宿主页 CSP 阻止音频播放 | 高 | ✅ 已通过 Offscreen Document 架构完全规避 |
| Google Docs canvas 渲染模式无法提取文本 | 中 | HTML 模式正常支持 + canvas 模式提示用户 |
| Gmail DOM 类名随版本更新变化 | 中 | 多层 fallback 选择器链 + 用户反馈机制 |
| 高亮时间与音频漂移 | 中 | 每块用实际 duration 校准 + 块边界重同步 |
| Offscreen Document 30s 无音频自动关闭 | 低 | 每次操作前 ensureOffscreen() 按需重建 |
| Readability 对部分页面提取失败 | 低 | Fallback 到 `<main>` / `<article>` / `<body>` |
| 超长文章 (100K+ 词) 性能问题 | 低 | 渐进提取 + 延迟 span 包裹 + chunk 级生成 |
| chunk 切换出现可感知音频间隙 | 中 | Offscreen 预加载下一块（`canplaythrough`）+ 尽量减少块切换次数；必要时升级 WebAudio 调度实现近似无缝 |
| 大音频 ArrayBuffer 跨上下文消息拷贝导致卡顿/内存飙升 | 中 | 控制 chunk 时长与音频格式；必要时改为 Offscreen 直接 fetch 音频（Background 仅发文本与控制消息） |
| DOM span 包裹破坏页面交互/布局（尤其 SPA/编辑器） | 中 | 只在“正文 root”内注入；提供降级：关闭 unit 高亮，仅句级/段级；停止/导航时完整还原 DOM |
| MV3 Service Worker 挂起导致 job 状态丢失 | 低 | job 最小状态写入 `chrome.storage.session`；Offscreen 侧可独立停止播放；恢复策略：状态不一致时安全重置 |
| 跨域 endpoint 权限与 API Key 安全 | 低 | Unpacked MVP 使用 `<all_urls>`；API Key 仅存 `chrome.storage.local`，不注入页面环境；错误信息避免回显敏感数据 |
| TTS API 超时/限流/配额 | 中 | 超时 + 指数退避重试（可配置上限）；对 chunk 生成并发做限流（例如 1-2 并发）并保证优先生成“播放即将需要”的块 |

---

## 12. 关键技术难点与解决方案（MVP 视角）

你提到的两个难点（主内容提取、连续播放）确实是核心；除此之外，还有几类“做出来 vs 做得稳/体验好”的关键挑战。这里把每个难点拆解为**问题 → 方案 → MVP 验收点**，并与本计划的模块对应。

### 12.1 主内容定位：如何找到“有价值的正文”

**问题**：网页结构差异巨大，导航、推荐、评论、页脚、弹窗等噪声会混入；同时我们又需要回到活 DOM 做高亮。

**方案**：
- 通用提取器采用“主内容 root 侦测 + 活 DOM 遍历”（见 6.1 通用提取器）
- Readability 作为 fallback（仅用于朗读文本），映射回活 DOM 失败时降级高亮
- 过滤策略：链接密度、最小可见文本阈值、重复段落去重、排除 boilerplate 容器

**MVP 验收点**：
- 典型新闻站/博客/知识类页面正文命中率高；噪声段落占比可接受
- root 侦测失败时不会崩溃：能朗读、能播放、UI 有降级提示

### 12.2 “发送给模型”与连续播放：chunking + buffering + 取消

**问题**：TTS 接口有输入长度限制；网络抖动/超时会导致断播；用户随时可能暂停、跳转、换 tab/换页面，需要可取消。

**方案**：
- 句子边界 chunk（中英标点）+ hard cut fallback（见 6.2）
- 渐进生成与缓冲：第一块 ready 即播放；后台保持至少 1 块 ahead buffer（见 6.2 渐进生成）
- jobId + job-manager（tab 隔离、取消、并发语义明确），所有消息都绑定 jobId（见 4/5）
- fetch 使用 AbortController；失败按策略重试，并优先生成“快播放到”的 chunk

**MVP 验收点**：
- 长文播放不中断；断网/超时能给出可理解的错误 UI；取消能立刻停

### 12.3 MV3 + CSP：为什么必须 Offscreen，以及生命周期问题

**问题**：Content Script 在严格 CSP 页面播放 `blob:` 音频可能失败；Service Worker 本身不能播放音频；Offscreen 有自动关闭机制。

**方案**：
- 音频播放统一在 Offscreen Document（见 2.3、6.3）
- Background 每次操作前 `ensureOffscreen()`；停止播放后允许 Offscreen 自动释放（见 6.3 生命周期）
- 状态最小持久化：必要信息写入 `chrome.storage.session`，避免 SW 挂起后“逻辑还在跑但状态丢了”（见 11 风险表）

**MVP 验收点**：
- GitHub 等严格 CSP 页面稳定可播
- 放置一段时间后再次播放不会失效（可自动重建 Offscreen）

### 12.4 chunk 切换的“无缝感”（实际体验常见坑）

**问题**：多 chunk 音频用 `HTMLAudioElement` 串起来，切换点可能有可感知间隙；越长文、切换越多，体验越差。

**方案**：
- MVP：Offscreen 预加载下一块，确保进入 `canplaythrough` 再允许当前块结束切换（见 11 风险表）
- 如果仍有间隙：升级为 WebAudio（decode 后用 `AudioBufferSourceNode` 调度），以时间轴方式拼接实现近似 gapless（作为可选增强，不阻塞 Phase 2）

**MVP 验收点**：
- 常见长文 chunk 切换不出现明显“停顿一下再继续”

### 12.5 高亮同步：没有时间戳怎么对齐

**问题**：TTS 不返回词级时间戳；中文还涉及分词；变速会改变时长；chunk 时长只有在 metadata 后才知道。

**方案**：
- 统一 unit 概念（space=word、cjk=segment/char）+ `Intl.Segmenter`（见 6.1 分词、6.4 高亮）
- 按字符比例分配 unit 时间，并用 `CHUNK_DURATION_KNOWN` 用真实 duration 校准（见 6.4.2）
- 变速只调 `playbackRate`：同步引擎用“真实播放时间”驱动（Offscreen 上报的是当前播放进度）

**MVP 验收点**：
- 高亮能稳定前进，不跳跃、不倒退；中文页面能逐词/逐字高亮

### 12.6 DOM 注入的兼容性与性能

**问题**：把正文包成大量 `<span>` 可能破坏页面布局/选择/事件；中文逐字高亮 unit 数更大；性能与兼容性风险高。

**方案**：
- 只在正文 root 内注入，避免全页面 TreeWalker
- 设置阈值降级：unit 数过大则只做句级/段级高亮
- 停止/导航时清理：恢复原始 DOM（通过缓存原始 TextNode 内容或保留替换前的节点引用）

**MVP 验收点**：
- 主流站点不卡顿；停止后页面交互不受影响

### 12.7 大音频跨上下文传输的成本

**问题**：Background fetch 后把 `ArrayBuffer` 通过 runtime message 发送到 Offscreen，会产生拷贝与内存峰值；极端情况下可能触发卡顿。

**方案**：
- MVP 先按当前方案实现（简单）；并控制 chunk 大小/并发，避免同时积压多块
- 若出现明显卡顿：改为 Offscreen 直接 fetch 音频（Background 只负责路由/会话），避免大二进制在消息里来回搬运（见 11 风险表）

**MVP 验收点**：
- 长文播放时 CPU/内存占用在可接受范围，不出现页面明显卡顿
