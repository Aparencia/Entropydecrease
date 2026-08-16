# 熵减移动端 PWA 版 Implementation Plan

> **For agentic workers:** 按任务顺序逐 Task 实施，Step 使用 checkbox（`- [ ]`）跟踪。
> **Spec:** `docs/superpowers/specs/2026-08-16-pwa-mobile-design.md`（v2 已定稿）

**Goal:** 在现有代码库上增加第二条运行时——PWA（iOS Safari / Android Chrome），首批交付：番茄钟、空白笔记、课堂助手（**系统录屏导入转写为主力（含系统音频）** + 麦克风实时转写应急 + 视频/抖音视频转笔记）、桌面↔移动账号同步。移动端本轮只保证**布局可用 + 功能完整**，不含 UI 视觉美化（Spec §1.3）。

**Architecture:** 复用现有双模式基座（`storageFactory` PWA/Dexie 分支、ASR 云端降级链、墙钟校准计时）；新增 `WebCaptureAdapter`（麦克风应急通道，Spec §3.2 音频源决策）与视频导入链路（主力通道，复用网关 `/api/v1/multimodal/analyze-video`）；同步复用 sync-service + OfflineQueue + Automerge。

**Tech Stack:** React 18 + Vite（VitePWA 已配置）、TypeScript、Dexie/IndexedDB、TipTap、Zustand、Web Notification API、supabase-js、Go sync-service（浏览器 WebSocket 直连）。Phase 1.5 可选项：sherpa-onnx-web（WASM + onnxruntime-web）。

**关键约束：**
- 桌面路径**零回归**：所有新增 PWA 分支必须经 `window.electronAPI` 存在性判定，Electron 原有行为不变（Spec §3.2 适配器模式）。
- PWA 下禁止调用未守卫的 IPC；`refreshLocalAsrStatus()` 在无 electronAPI 时已返回 false（自动走云端），不得绕过。
- 存储：PWA 走 Dexie；IndexedDB→SQLite 迁移**仅存在于 Electron 首次启动**，PWA 侧禁止反向迁移（Spec F1）。
- **CORS 前置项**：浏览器直连 AI 网关需确认/新增网关 CORS 允许源（桌面 Electron 无此问题，T0.2 验证）。
- 部署必须 HTTPS（PWA SW 与 getUserMedia 的 secure context 要求）。
- 单文件 ≤300 行、`@ai-context` 中英双语注释（项目规范）；`npm run check` 门禁（lint --deny-warnings / typecheck×2 / test）。
- 移动端验证：Chrome DevTools 设备模拟器 + 真机（iOS Safari / Android Chrome）双轨。

---

## T0: 前置验证（0.5–1 天，阻塞性）

**Files:** `client/vite.config.ts`、`server/ai-gateway`（CORS 中间件）、`client/src/lib/http/apiClient.ts`

- [ ] **Step 1: web 构建冒烟** — `cd client && vite build`（非 ELECTRON_BUILD）产出含 SW/manifest 的 PWA 产物；静态服务打开，确认 `navigator.serviceWorker` 注册成功、manifest 生效
- [ ] **Step 2: 浏览器登录 + AI 调用验证** — 浏览器模式下 supabase 登录成功；远程 AI 调用（如 `/api/v1/...`）无 CORS 报错；若报错，在 ai-gateway 中间件新增允许源配置（生产源 + localhost）
- [ ] **Step 3: 存储双模式冒烟** — 无 electronAPI 环境下 `createAllStores()` 落 Dexie，笔记 CRUD 通过
- [ ] **验收**：web 产物可访问、登录成功、AI 调用无 CORS 错误、Dexie 存储可用；阻塞项全部清零

## M1: 横切基建 + 番茄钟（第 1 周，~1 周）

### Task 1: PWA 部署目标与 manifest 完善（0.5 天）

**Files:** `client/vite.config.ts`、`client/public/`（icon/manifest 字段）

- [ ] **Step 1:** manifest 补齐：`display: standalone`、`orientation`、启动图/图标尺寸（iOS 需 apple-touch-icon）、主题色
- [ ] **Step 2:** 部署目标落地：静态托管（nginx/对象存储）+ HTTPS；确定生产 URL 并在 T0.2 CORS 源中登记
- [ ] **验收**：iOS Safari"添加到主屏幕"后以 standalone 模式启动、图标正常

### Task 2: 移动端导航与响应式布局结构（1 天）

**Files:** `client/src/App.tsx`、`client/src/components/layout/`、`client/src/styles/`

- [ ] **Step 1:** 移动端导航：按设计系统既有方案（BottomNav / 汉堡菜单，见 docs/archive/superdesign-init/layouts.md）接入路由；桌面布局不变，窄屏切换移动导航
- [ ] **Step 2:** 全局容器响应式：viewport meta、safe-area-inset、`100dvh` 处理（iOS 地址栏）、滚动容器
- [ ] **Step 3:** 三个目标模块路由可达（番茄钟/笔记/课堂），其余路由保持桌面入口或占位
- [ ] **验收**：360–430px 下导航可用、无横向溢出；桌面端布局零变化

### Task 3: iOS Safari 平台细节（1 天）

**Files:** `client/src/lib/`（audio 工具）、`client/src/hooks/useReducedMotion.ts`

- [ ] **Step 1:** AudioContext 用户手势解锁：所有音频播放（番茄钟音效/录音提示音）在首次触摸后 resume
- [ ] **Step 2:** 字体/缩放：`font-size` 与 `text-size-adjust` 防 iOS 自动缩放；输入框聚焦不缩放
- [ ] **验收**：iOS Safari 上音效首触可播、无自动缩放异常

### Task 4: 番茄钟移动端（1–1.5 天）

**Files:** `client/src/features/pomodoro/pages/`、`components/`（TimerFace/ImmersiveTimer/设置/统计）

- [ ] **Step 1:** 响应式布局：计时主界面/沉浸页/设置页/统计页窄屏可用（按钮可达、无遮挡、可滚动）
- [ ] **Step 2:** 通知流程验证：Web Notification 权限申请 + 到点通知（`sendNotification` 已现成，F3）
- [ ] **Step 3:** 后台节流验证：切后台/锁屏 ≥5 分钟恢复，墙钟校准不漂移（tickSlice 已实现，验证即可）
- [ ] **验收**：手机端完整番茄流程（启动→专注→休息→统计）可用；后台 5 分钟不漂移；通知可达

## M2: 空白笔记 + 同步（第 2–5 周，~3–4 周）

### Task 5: 笔记存储与数据链路验证（1 天）

**Files:** `client/src/features/notes/`（store/lib）、`client/src/lib/storage/`

- [ ] **Step 1:** PWA 模式下笔记 CRUD/文件夹/搜索（Dexie 全表）/链接/标签全链路验证，修复 PWA 分支缺陷
- [ ] **Step 2:** 笔记加密/导出导入在浏览器环境的行为确认（`backupCrypto` 为纯 TS，验证即可）
- [ ] **验收**：移动端笔记全数据链路可用；无 electronAPI 时无报错（F4 守卫确认）

### Task 6: 编辑器布局适配（功能向，1.5–2 周，最大单项）

**Files:** `client/src/features/notes/components/editor/`、`NoteEditPage.tsx`、`EditorToolbar.tsx`

- [ ] **Step 1:** 工具栏窄屏折叠（溢出项收纳，不遮挡内容）
- [ ] **Step 2:** 触摸可用：选区/光标操作、滑动滚动、触摸目标 ≥44px（关键操作）
- [ ] **Step 3:** 虚拟键盘：输入时内容不遮挡（`visualViewport` 监听或 fixed 布局修正）
- [ ] **Step 4:** 图片插入：`<input type="file" accept="image/*">` 替代粘贴（桌面粘贴路径保留）
- [ ] **Step 5:** 移动端只读/阅读模式可用（若已有 useNoteReadingMode 则验证）
- [ ] **验收**：手机上可新建/编辑/插图/保存笔记，无输入遮挡、无工具栏溢出

### Task 7: 剪藏/PDF 浏览器替代（1 天）

**Files:** `client/src/features/notes/hooks/useClipImport.ts`、`package.json`

- [ ] **Step 1:** URL 剪藏：浏览器 fetch（CORS 允许的站点可用；受限站点提示降级）；不可用时隐藏入口
- [ ] **Step 2:** PDF 解析：引入 pdf.js 或裁剪（仅移动端路径），解析后走既有内容入库
- [ ] **验收**：移动端剪藏/PDF 导入可用或明确降级提示，无死链 UI

### Task 8: 桌面↔移动同步（1–1.5 周）

**Files:** `client/src/lib/sync/`（OfflineQueue/同步客户端）、`client/src/lib/auth/supabaseClient.ts`、`server/sync-service/`

- [ ] **Step 1:** 账号绑定流程：PWA 登录（supabase-js 已验证）→ 设备注册 → 同步凭证获取
- [ ] **Step 2:** 浏览器 WebSocket 直连 sync-service 验证（CORS/协议层确认）
- [ ] **Step 3:** OfflineQueue 浏览器环境测试（现有测试为 jsdom，补真浏览器行为验证）
- [ ] **Step 4:** 冲突策略确认：桌面↔移动双写场景（Automerge CRDT + syncConflicts 表现层）
- [ ] **验收**：同一账号桌面↔移动双向增量同步；离线操作入队、恢复后补齐；冲突可见可解

## M3: 课堂助手（第 2–6 周，~3–4 周；与 M2 并行）

### Task 9: WebCaptureAdapter（麦克风应急通道，1–1.5 周）

**Files:** 新增 `client/src/features/classroom/capture/WebCaptureAdapter.ts`、`client/src/lib/audio/`（浏览器侧）

> 音频源决策（Spec §3.2 v4）：PWA 无法实时监听系统扬声器；**主力通道 = 系统录屏导入**（Task 10 链路，系统音频随录屏文件落盘），本任务只做麦克风应急通道。

- [ ] **Step 1:** getUserMedia 麦克风采集（16kHz 单声道：AudioWorklet/ScriptProcessor 降采样，复用 asrFilters 处理链）
- [ ] **Step 2:** MediaRecorder 分段（5–15s）+ 每段转码为云端 ASR 所需格式
- [ ] **Step 3:** `CaptureAdapter` 接口定义（含现有 Electron 路径能力枚举：captureType/windowless 模式），`useSessionControl`/`useClassroomEvents` 加环境分支
- [ ] **Step 4:** 移动端隐藏窗口选择/屏幕采集/系统音频 UI（`WindowSelectCard`/Vision 入口等按环境条件渲染）
- [ ] **Step 5:** 课堂主界面音频源选择：麦克风（实时应急）/ 系统录屏导入（主力，引导至 Task 10 导入入口）
- [ ] **Step 6:** 会话中断恢复：标签切后台录音停止→前台恢复续录（复用/对齐 useAudioRecovery 语义）
- [ ] **验收**：手机麦克风录音→分段→云端转写（transcribeWithRetry 现成链路）文本回流；录屏导入入口可达；后台切换不崩溃、可恢复

### Task 10: 视频转笔记（含抖音链接引导，1–1.5 天）

**Files:** `client/src/features/classroom/`（新增导入入口）、`client/src/lib/ai/`（上传调用）

- [ ] **Step 1:** 文件选择 UI（`<input type="file" accept="video/*">`）+ 上传进度 + 取消
- [ ] **Step 2:** 复用网关 `POST /api/v1/multimodal/analyze-video`（≤500MB、300s 超时，对齐 videoAnalyzeHandler 契约）
- [ ] **Step 3:** 结果入库：结构化笔记写入 notes 存储（复用 noteGenerator/既有生成链路）
- [ ] **Step 4:** 抖音链接引导：粘贴框检测 `douyin.com` 域名 → 展示"在抖音 App 保存到相册"分步指引 → 引导跳转文件选择；不做服务端自动解析（Spec §3.2 决策）
- [ ] **Step 5:** 手机系统录屏场景说明（系统录屏 → 相册 → 导入），与抖音引导共用入口
- [ ] **验收**：导入手机录屏/抖音保存的网课视频 → 生成结构化笔记入库；粘贴抖音链接出现引导并可完成导入；失败有明确提示

### Task 11: 课堂会话页响应式布局（0.5–1 天）

**Files:** `client/src/features/classroom/pages/ClassroomPage.tsx`、`components/`（SessionContentView/UnifiedTimeline/QA 面板）

- [ ] **Step 1:** 会话控制（开始/暂停/停止）、转写流、分段列表、QA 面板窄屏布局可用
- [ ] **验收**：手机上完整课堂会话流程可操作，无遮挡溢出

## M4: 联调与发布（第 8–11 周，~1–1.5 周）

### Task 12: 双端回归与移动端专项测试（3–4 天）

**Files:** 全量（回归）+ `client/src/**/*.test.ts`（新增 PWA 分支测试）

- [ ] **Step 1:** Electron 桌面回归：`npm run check` + 手工冒烟（笔记/番茄钟/课堂桌面路径不变）
- [ ] **Step 2:** 真机专项：iOS Safari（音频/通知/键盘/后台）+ Android Chrome（同上）验收清单执行
- [ ] **Step 3:** 长会话性能：课堂 60 分钟录音转写内存/队列表现；番茄钟长开漂移测试
- [ ] **Step 4:** 新增 PWA 分支单测（适配器环境判定、降级路径、存储双模式）纳入 `npm run check`
- [ ] **验收**：Spec §6 验收标准 1–8 全部通过

### Task 13: 发布（1–2 天）

**Files:** 部署配置、`docs/`（使用说明）

- [ ] **Step 1:** 部署生产 PWA（HTTPS）+ 网关 CORS 最终确认
- [ ] **Step 2:** 内测指引文档（添加主屏幕、通知权限、桌面↔移动同步说明）
- [ ] **验收**：外网 URL 可安装、内测用户全流程可用

## Phase 1.5（可选，+1.5–2.5 周）：端侧 WASM 流式转写

### Task 14: StreamingAsrProvider 抽象 + WASM 实现

**Files:** 新增 `client/src/lib/asr/`（接口 + 两实现）、改造 `client/electron/ai/local-asr/streamingAsr.ts`（提炼共享编排层）

- [ ] **Step 1:** 从 streamingAsr.ts 提炼平台无关编排层（partial 节流/端点断句/热词/静音跳过/SenseVoice 重打分）
- [ ] **Step 2:** `SherpaNodeProvider`（桌面，保留原生，行为不变）+ `SherpaWasmProvider`（web worker + sherpa-onnx-web，WASM+SIMD）
- [ ] **Step 3:** 桌面降级路径：原生加载失败 → WASM（缓解 node-gyp CI 痛点）
- [ ] **Step 4:** 模型分发：移动端模型下载/缓存（IndexedDB/Cache Storage）
- [ ] **验收**：桌面原生性能不变；移动端流式 partial 延迟 <2s、可离线；桌面原生失败可降级 WASM

---

## 依赖关系与关键路径

```
T0（阻塞前置）
  └─ M1（Task 1→2→3→4，串行 1 周）
       ├─ M2：Task 5 → 6（最长）→ 7；Task 8 依赖 Task 5，可与 6/7 并行
       └─ M3：Task 9 → 10 → 11（M2 与 M3 并行，共享 M1 基座）
            └─ M4：Task 12（依赖 M2+M3 完成）→ Task 13
Phase 1.5：Task 14 依赖 Task 9（采集链路）与 M1
```

关键路径：T0 → M1 → M2（Task 6 编辑器为最大单项）→ M4 ≈ **9–12 周（单人）**；M3 与 M2 并行后总窗口不变；2 人并行时 M2/M3 各归一人，**5–7 周**。

## 工作量汇总（与 Spec §4 对齐）

| 阶段 | 任务 | 工期（单人） |
|---|---|---|
| T0 | 前置验证 | 0.5–1 天 |
| M1 | Task 1–4（基建+番茄钟） | 1 周 |
| M2 | Task 5–8（笔记+同步） | 3–4 周 |
| M3 | Task 9–11（课堂助手：录屏导入为主 + 麦克风应急） | 2.5–3.5 周（与 M2 并行） |
| M4 | Task 12–13（联调发布） | 1–1.5 周 |
| Phase 1.5 | Task 14（WASM 流式，可选） | +1.5–2.5 周 |