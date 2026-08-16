# 熵减移动端 PWA 版设计（MVP：课堂助手 + 空白笔记 + 番茄钟）

> 日期：2026-08-16 ｜ 状态：待评审（v3：课堂助手增加抖音链接引导导入，确认移动端录制识别机制） ｜ 分支：dev
> 背景：评估"把当前 Electron 桌面项目移植到 iOS/Android"的工作量后，确认走项目既定策略
> （PWA 优先，见 docs/product/requirements-pool.md EXP-006 与 docs/Foresight/innovation-features-catalog.md），
> 首批范围锁定三个功能 + 桌面↔移动数据同步。

## 1. 目标与范围

### 1.1 目标

在现有代码库上增加第二条运行时——**PWA（浏览器/移动端）**，首批交付：

1. **番茄钟**：移动端可用，计时准确（后台节流不丢时间），到点通知
2. **空白笔记**：移动端可读写，数据落 IndexedDB（Dexie），与桌面端同构
3. **课堂助手**：三种形态——
   - 实时课堂：麦克风录音 → 转写 → AI 结构化笔记（近似桌面端"实时录制识别"机制；参考 OPPO AI 笔记能力）
   - 视频转笔记：导入视频文件（手机录屏/网课下载/**抖音保存的视频**）→ 复用网关 `analyze-video` → 生成笔记
   - 抖音链接引导：粘贴抖音分享链接 → 引导保存到相册 → 一键导入（方案 A）；服务端自动解析（方案 B）列为后续实验性评估项
4. **桌面 ↔ 移动数据同步**：账号绑定 + sync-service 增量同步

### 1.2 明确不做（MVP 之外）

- 原生 App（Capacitor 壳 / React Native / SwiftUI）——Phase 2 再评估
- 系统级"全局快捷键/侧边栏截屏识别"（移动浏览器平台禁止采集其他 App 画面）——Phase 2 用 iOS Share Extension / Android 分享意图近似替代
- 端侧 WASM 流式转写——Phase 1.5 可选项（见 §5）
- 其余 24 个功能模块的移动端适配
- **移动端 UI 视觉设计/美化**（主题打磨、动效、设计系统细化）——本轮只保证**布局可用 + 功能完整**，视觉打磨放 Phase 2

### 1.3 布局与功能约束（本轮范围边界）

- **做**：响应式布局（360–430px 常见宽度下无横向溢出、无遮挡、可滚动）、触摸可用（点击目标、手势、虚拟键盘适配）、功能链路完整
- **不做**：视觉美化（配色/字体/间距打磨、入场动效、3D 视觉降级之外的展示优化）、移动端专属视觉设计
- 判定标准：移动端"能用、不破、功能通"，视觉细节后续阶段补齐

## 2. 现状盘点（关键事实）

| # | 事实 | 影响 |
|---|------|------|
| F1 | `storageFactory.ts` 已双模式：检测不到 `window.electronAPI` 自动走 Dexie/IndexedDB，且内置 IndexedDB→SQLite 迁移 | 数据层 PWA 零改动可跑 |
| F2 | `asrTranscriber.ts` 已实现"本地 ASR 优先 → 云端降级"，PWA 下自动直走云端 `/api/v1/asr/transcribe`（重试+并发信号量） | 课堂转写链路浏览器端现成 |
| F3 | `tickSlice.ts` 已有墙钟校准（endAt 误差>1s 吸附）+ `visibilitychange` 前台恢复立即 tick；`sendNotification` 用 Web Notification API | 番茄钟后台节流不丢时间 |
| F4 | notes 的 28 处 IPC 全部有 `window.electronAPI` 守卫，PWA 下自动静默降级 | 笔记模块不会报错，但剪藏/PDF/桌面采集会消失 |
| F5 | `vite.config.ts` 已配置 VitePWA（manifest+SW）；设计系统已有移动端 BottomNav/响应式方案；`useDeviceCapability`/`useReducedMotion` 已就绪 | 基建前置条件已具备 |
| F6 | 网关已有 `POST /api/v1/multimodal/analyze-video`（multipart ≤500MB，Gemini 原生视频 → Qwen-VL ffmpeg 抽帧降级，300s 超时）；桌面 `videoAnalyzeHandler.ts` 仅为薄封装 | 视频转笔记能力后端已完整，移动端只缺文件选择+上传 UI |
| F7 | 桌面流式 ASR = `streamingAsr.ts`（平台无关编排）+ `SherpaAsrService`（sherpa-onnx-node 原生）；`asrFilters.ts` 已在共享 `src/lib/capture` | 提炼 StreamingAsrProvider 适配器的前提已具备 |
| F8 | sync-service 是 Go/WebSocket，浏览器可直连；`OfflineQueue` 有测试；`@automerge` 为 WASM 跨端可用 | 同步链路技术选型无障碍 |

## 3. 架构设计

### 3.1 运行时判定（沿用现有模式）

```
getRuntimeEnvironment(): 'pwa' | 'electron'   // 已存在，window.electronAPI 判定
```

- 存储、AI 客户端、同步均按此环境选择实现；不新增第三运行时判定
- PWA 构建产物：`vite build`（非 ELECTRON_BUILD）即产出 PWA（现有配置），新增移动端部署目标（静态托管 + HTTPS）

### 3.2 课堂助手移动端捕获适配器（新增核心件）

```
CaptureAdapter 接口（新增，client/src/features/classroom/capture/）
├── ElectronCaptureAdapter   ← 现有桌面实现（屏幕/窗口/系统音频/本地 ASR），保持不动
└── WebCaptureAdapter        ← 新增：getUserMedia 麦克风 + MediaRecorder 分段 + 云端 ASR
```

- 会话编排（useSessionControl / useClassroomEvents）增加环境分支；移动端隐藏窗口选择/屏幕采集 UI
- 转写：MVP 走云端分段（`transcribeWithRetry` 已现成）；Phase 1.5 换 WASM 流式
- 视频转笔记：`<input type="file" accept="video/*">` → `aiClient` multipart 上传 `/api/v1/multimodal/analyze-video` → 结构化笔记入库。输入源含手机系统录屏、网课下载、抖音保存的视频；抖音分享链接（`douyin.com` 域名检测）走**引导流程**（提示"在抖音保存到相册"后导入）。**不做服务端自动解析**（抖音无公开下载 API；非官方解析受 a_bogus 反爬影响不稳定且有合规风险；方案 B 实验性解析后续单独评估）

### 3.3 ASR 适配器（Phase 1.5，桌面同步受益）

```
StreamingAsrProvider 接口（新增，client/src/lib/asr/）
├── SherpaNodeProvider   ← 桌面：sherpa-onnx-node（保留原生性能）
└── SherpaWasmProvider   ← 移动：web worker + sherpa-onnx-web（WASM+SIMD）
        ↑ 共享流式编排层（从 streamingAsr.ts 提炼：partial 节流/端点断句/热词/静音跳过/SenseVoice 重打分）
```

- 桌面收益：原生绑定构建失败的场景可降级 WASM（缓解 node-gyp/electron-rebuild CI 痛点）；web 预览模式可用流式 ASR
- 注意：桌面性能不依赖 WASM（原生快 2–5 倍），桌面默认仍走原生

### 3.4 数据同步（MVP 含）

- 复用 sync-service（WebSocket）+ OfflineQueue + Automerge CRDT（均已存在）
- 新增：账号绑定流程（supabase 登录在 PWA 已兼容）、浏览器端同步链路验证、冲突策略确认
- 数据归属：PWA 与桌面共用同一账号命名空间，key 兼容（keban 库名等品牌豁免约定不变）

### 3.5 平台限制的既定取舍

| 桌面能力 | 移动 PWA 处理 |
|----------|--------------|
| 屏幕/窗口采集 | 移除（移动浏览器无 getDisplayMedia）；替代：视频文件导入 |
| 系统音频环回 | 移除；替代：麦克风录音 |
| 托盘/全局快捷键 | 移除；替代：通知栏/页面内快捷入口 |
| 本地 Ollama | 移除；走云端 AI 网关（项目已有完整降级链） |
| 后台运行 | 浏览器标签后台会被节流：录音停止并提示；番茄钟靠墙钟校准+通知 |
| better-sqlite3 | Dexie/IndexedDB（F1） |

## 4. 工作量估算

假设：1 名熟悉代码库的全栈工程师全职；不含产品设计、上架、市场。

| 工作项 | 工期 | 说明 |
|--------|------|------|
| 横切基建（PWA 构建/部署、移动端导航与响应式布局、iOS Safari 细节、音频手势解锁） | 1 周 | VitePWA 已配置；仅布局结构，无视觉打磨 |
| 番茄钟（响应式布局 + 通知流程） | 0.5–1 周 | 计时引擎已就绪（F3），纯布局+功能验证 |
| 空白笔记（编辑器布局适配、存储验证、剪藏/PDF 浏览器替代） | 2–3 周 | 编辑器触摸/虚拟键盘/溢出是功能性问题，必须处理；不做视觉 |
| 课堂助手-录音转写（WebCaptureAdapter + 云端分段 ASR） | 3–4 周 | 60 处 IPC 中捕获链路需重写，功能为主 |
| 课堂助手-视频转笔记（文件选择 + 抖音链接引导 + 复用 analyze-video） | 0.5–1 周 | 后端现成（F6）；抖音引导含链接检测与保存指引 |
| 桌面 ↔ 移动同步（账号绑定 + 浏览器端验证） | 1–2 周 | 底子已具备（F8） |
| 联调 + 移动端测试 + 打磨 | 1 周 | 双端回归；打磨仅限功能/布局缺陷 |
| **合计** | **约 9–13 周（≈2–3 人月）** | 2 人并行约 5–7 周 |

可选项：
- 端侧 WASM 流式转写（StreamingAsrProvider，§3.3）：**+1.5–2.5 周**，体验追平 OPPO 实时感、可离线，桌面同时获得降级路径
- Capacitor 壳 + Share Extension/分享意图（Phase 2）：**+2–3 周**，获得"任意 App 分享视频→熵减"的原生触发体验

## 5. 里程碑

- **M1（第 1–3 周）**：横切基建 + 番茄钟可跑；PWA 部署上线内测
- **M2（第 3–7 周）**：空白笔记移动端可用（读写 + 同步打通）
- **M3（第 6–10 周）**：课堂助手录音转写 + 视频转笔记可用
- **M4（第 9–12 周）**：全量联调、双端回归、性能打磨、发布
- **Phase 1.5**：WASM 流式转写（可选，+1.5–2.5 周）
- **Phase 2**：Capacitor 壳评估（分享扩展、后台录音、推送）

## 6. 验收标准（MVP）

1. PWA 可在 iOS Safari / Android Chrome 添加到主屏幕，离线打开可用（SW 缓存）
2. **布局可用**：360–430px 宽度下三个模块无横向溢出、无遮挡、可滚动，触摸/虚拟键盘可用（§1.3 标准；不含视觉美化）
3. 番茄钟：切后台/锁屏 5 分钟再回来，计时不漂移（墙钟校准），到点通知可达
4. 空白笔记：新建/编辑/搜索/文件夹/链接在移动端可用；数据持久化于 IndexedDB
5. 课堂助手：麦克风录音 → 分段转写 → AI 生成结构化笔记全链路通（桌面式录制识别机制的移动版）；导入视频（含手机录屏/抖音保存的视频）→ analyze-video → 笔记入库；粘贴抖音链接出现引导流程并可完成导入
6. 桌面 ↔ 移动：同一账号登录后数据双向增量同步，离线操作入队，恢复网络后补齐
7. 桌面端回归：Electron 现有功能不受影响（适配器模式，桌面路径不变）
8. 仓库门禁：`npm run check` 通过（lint/typecheck×2/test）

## 7. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| iOS Safari 音频/通知限制（需用户手势解锁 AudioContext；通知需添加到主屏幕） | 中 | 引导流程 + 文档说明 |
| 移动端编辑器体验（TipTap 触控/虚拟键盘） | 中 | 编辑器工具栏折叠 + 移动端专项测试 |
| 同步冲突（桌面/移动双写） | 中 | OfflineQueue 已存在 + Automerge CRDT + 冲突策略验证 |
| 3D 场景移动端性能（three.js） | 低 | useDeviceCapability/useReducedMotion 降级（已存在） |
| 视频上传体积（≤500MB 限制、移动网络） | 低 | 上传进度 + 压缩提示 |
