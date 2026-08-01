# 熵减性能深度分析与优化路线图

> 类型：技术方案 / 性能分析报告
> 日期：2026-08-01
> 范围：渲染进程（client/src）、Electron 主进程（client/electron）、AI 网关（server/ai-gateway）
> 方法：静态代码审计（逐文件核实行号）+ 已有性能机制评估 + 内测反馈（CPU 9.8%~28.1%、内存 5GB）交叉验证

---

## 一、执行摘要

### 总体结论

应用整体架构成熟（AI 降级链、采集节流去重、3D 自适应分级设计良好），但存在**三类系统性性能问题**：

1. **React 重渲染失控**（最普遍）：全部 6 个功能模块的页面组件普遍用 `useShallow(s => s)` 订阅整个 zustand store，高频字段（计时器秒数、翻卡状态、输入框）变化时触发整页重渲染。
2. **内存无界增长**（最致命）：课堂助手音频段 `audioBase64` 转写后永不释放（长课堂数百 MB）、笔记 base64 图片内嵌文档放大所有序列化开销、多处采集缓冲区无上限。这是内测反馈"内存 5GB"的主因。
3. **渲染路径重复计算**（最隐蔽）：笔记每次自动保存全量重载所有笔记、每次键入同步 `JSON.stringify` 整个文档、列表过滤/搜索未缓存。

### 五大性能瓶颈（按用户感知影响排序）

| # | 瓶颈 | 位置 | 影响 |
|---|------|------|------|
| 1 | 笔记自动保存触发全量 `loadNotes()` | useNoteStore.ts:213 | 打字卡顿（笔记上百后明显） |
| 2 | 课堂音频段 base64 永不释放 | useClassroomEvents.ts:191 / vadMarker.ts:259 | 长课堂内存数百 MB（5GB 主因） |
| 3 | 键入时同步 `JSON.stringify` 整个文档 | useNoteEditor.ts:106 | 含图文档打字阻塞主线程 |
| 4 | 番茄钟 RAF 60fps 空转（每秒仅需 1 次） | TimerRing.tsx:74 / ImmersiveTimer.tsx:107 | 1h 计时 21.6 万次无效 DOM 写入 |
| 5 | 全模块整 store 订阅 | 6 个页面组件 | 高频交互触发整页重渲染 |

### 优化收益预估

- **P0 三项**（笔记全量重载 + 音频 base64 释放 + stringify 移入防抖）可消除最痛的打字卡顿与内存膨胀，预计内存峰值下降 60%+。
- **三档性能模式**已上线（v0.31.0 后），模块态降帧是最大单点收益（用户多数时间停留在模块页，3D 此前仍全帧渲染）。

---

## 二、功能流畅性评估

> 严重程度：🔴 严重 / 🟠 中等 / 🟡 轻微。所有行号基于当前代码核实。

### 2.1 笔记系统（问题最严重）

| 级别 | 问题 | 位置 | 机制 |
|------|------|------|------|
| 🔴 | 自动保存触发全量 `loadNotes()` | useNoteStore.ts:213 | 打字停顿 500ms → updateNote → 从 IndexedDB 全量读所有笔记 + 重排 + 全页重渲染。另有多余 getById（:203） |
| 🔴 | 键入时同步 `JSON.stringify` 整文档 | useNoteEditor.ts:106 | `debouncedSave(JSON.stringify(e.getJSON()))`——防抖只防保存，stringify 每次键入同步执行；含 base64 图片时文档达数 MB |
| 🟠 | 渲染中 `getFilteredNotes/getAllTags/stripHtml` | NotesPage.tsx:139-141 | 无 useMemo；搜索对每篇 content（含 base64）`toLowerCase().includes()` 全量扫描 |
| 🟠 | base64 图片内嵌文档 | useNoteEditor.ts:120-130 | 2MB 图片→2.7MB base64，永久存在于文档 JSON/每次 stringify/IndexedDB/搜索扫描，形成乘数效应 |
| 🟠 | NoteEditPage 渲染中 JSON.parse + 全文遍历 | NoteEditPage.tsx:198/250 | 康奈尔笔记每次渲染 JSON.parse；`editor.getText()` 遍历全文档仅取前 500 字 |
| ✅ | 笔记列表 >50 用 VirtualList | NotesPage.tsx:368 | 五模块中唯一用上虚拟化 |

### 2.2 番茄钟

| 级别 | 问题 | 位置 | 机制 |
|------|------|------|------|
| 🔴 | 整 store 订阅 + 每秒 tick → 全页每秒重渲染 | PomodoroPage.tsx:39-46 | `useShallow(s => s)` 订阅整 store，`remainingSeconds` 每秒必变，浅比较无法拦截 |
| 🔴 | RAF 60fps 做每秒才需一次的更新 | TimerRing.tsx:74-95 / ImmersiveTimer.tsx:107-119 | 进度每秒变一次，RAF 持续 60fps 每帧 setAttribute 相同值 + 读 innerWidth；圆环已有 CSS transition 兜底，RAF 纯冗余 |
| 🟠 | render 中创建新对象/元素 | PomodoroPage.tsx:134-140 | motion 的 initial/animate/transition 每次重建 |
| 🟡 | `key={timeStr}` 每秒卸载重挂载 + document.title 每秒写 | TimerRing.tsx:190 / PomodoroPage.tsx:93 | 数字翻动效果代价（可接受）；title 无需每秒更新 |
| ✅ | setInterval 清理正确 | PomodoroPage.tsx:84-91 | — |

### 2.3 闪卡

| 级别 | 问题 | 位置 | 机制 |
|------|------|------|------|
| 🔴 | 双整 store 订阅 | StudySessionPage.tsx:51-57 | study store 高频字段（isFlipped/showStrengthPulse）触发整页重渲染；flashcard store 含大数组却只用 3 个恒定 action |
| 🟠 | `calculateIntervals` 渲染中未缓存 | StudySessionPage.tsx:126-135 | SM2 计算每次渲染执行 |
| 🟠 | setTimeout 未清理 | useCardInteraction.ts:84/90-98 | 卸载后 setState；对比同文件 L68 有清理（疏漏） |
| 🟠 | `getAll()` 全量加载复习记录仅为统计今日数 | useStudySessionStore.ts:115-118 | 复习记录增长最快，半年数万条，每次进会话全量反序列化 |
| 🟠 | FlashcardsPage 统计 O(牌组×卡片) 扫描 | FlashcardsPage.tsx:125/170 | getAll 全部卡片 + map 中每组 filter 整个 allCards |
| 🟡 | 卡片列表无虚拟化 + 每卡 spring 动画 | DeckCardList.tsx:84-140 | 单组几十张影响有限，数百张时显著 |

### 2.4 费曼学习法

| 级别 | 问题 | 位置 | 机制 |
|------|------|------|------|
| 🔴 | `useFeynmanStore()` 无 selector 订阅 | useSocraticFlow.tsx:71 | 比 useShallow 更糟，store 任何变化都重渲染；实际只需 2 个恒定 action |
| 🟠 | 整 store 订阅 + `getCurrentView()` 渲染中创新对象 | useFeynmanSession.ts:34/67 | getCurrentView 每次返回新对象，下游 effect 每次拿新引用 |
| 🟠 | 重复 filter（疑似复制粘贴 bug） | FeynmanSessionPage.tsx:75-76 | masteredCount 与 convertedCount 两次完全相同的 filter |
| 🟠 | setTimeout 未清理 | useSocraticFlow.tsx:90-97 | 阶段过渡 300ms 内卸载 setState |
| 🟡 | 渲染中创新对象/数组 + loadWeakPoints O(n×m) | FeynmanSessionPage.tsx:63 / feynmanStepSlice.ts:226 | variants/数组未 memo；薄弱点 getAll + includes 过滤 |

### 2.5 灵感空间（质量最高）

| 级别 | 问题 | 位置 | 机制 |
|------|------|------|------|
| 🟠 | filter/Set/group 未 memo，键入全量重算 | InspirationPage.tsx:97-103/324 | 受控 input 每次键入触发重算 |
| 🟠 | InspirationCard 未 memo + 每卡新回调 | InspirationPage.tsx:342 | 父组件键入重渲染时所有 orb 重渲染 |
| 🟡 | orb 列表无虚拟化 + 每 orb 一个 layoutId | InspirationPage.tsx:323-348 | flex-wrap 难虚拟化（架构约束） |
| ✅ | DeepSeaAmbient 纯 CSS 动画 + 三档降级 + reduced-motion | DeepSeaAmbient.tsx | 全应用动画降级范本 |
| ✅ | useBatchSort 信号量并发控制 + 超时 + abort | useBatchSort.ts | 设计良好 |

### 2.6 课堂助手

采集管线设计成熟（见第四节），主要性能问题是**内存**（见第三节）而非流畅性。实时 AI 有多层节流去重（视觉 3s 间隔 + Jaccard 去重 + dHash 去重），不存在每帧调 AI。

### 2.7 跨模块共性问题

**共性 1：zustand 订阅粒度**——所有 store 底部都定义了细粒度 selector hooks，但页面组件普遍不用：

| 模块 | 位置 | 订阅方式 |
|------|------|---------|
| 番茄钟 | PomodoroPage.tsx:46 | `useShallow(s => s)` 整 store |
| 闪卡 | StudySessionPage.tsx:55/57 | `useShallow(s => s)` 整 store |
| 费曼 | useSocraticFlow.tsx:71 | **无 selector**（最糟） |
| 笔记 | NotesPage.tsx:122 / NoteEditPage.tsx:45 | `useShallow(s => s)` 整 store |
| 灵感 | InspirationPage.tsx:34 | `useShallow(s => s)` 整 store |

**统一规范建议**：禁止 `useShallow(s => s)`；action 用 `getState()` 或单字段 selector；状态字段按更新频率拆分订阅。

**共性 2：setTimeout 无卸载清理**——useCardInteraction.ts:84/90、useSocraticFlow.tsx:92/257。统一用 ref + cleanup。

---

## 三、内存管理分析

### 3.1 确认的泄漏（会在正常使用下快速耗尽内存）

#### 🔴 [高] 音频段 audioBase64 转写后永不释放（5GB 主因）

- **位置**：useClassroomEvents.ts:191-220（smartBundle.audioSegments）、vadMarker.ts:259-265（VADMarker.segments）
- **机制**：每个语音段最长 28s（vadMarker.ts:47），16kHz/单声道/16bit ≈ 896KB 原始 PCM，WAV base64 后约 **1.2MB/段**。2 小时连续语音数百段，smartBundle 与 VADMarker.segments 各持一份，合计**数百 MB**，直到会话 reset()。
- **对比**：关键帧 imageBase64 在分析后会置空（useClassroomEvents.ts:163-168、useClassroomAnalysis.ts:66-69），但音频段**无对应剥离逻辑**。
- **修复**：转写回填 audioText 时同步剥离：`s.id === seg.id ? { ...s, audioText: text, audioBase64: '' } : s`；VADMarker.segments 在 onSegmentReady 发射后只保留元数据。

### 3.2 无界增长风险（中-低）

| 级别 | 问题 | 位置 | 机制 |
|------|------|------|------|
| 🟠 中 | VADMarker.timeline 无界增长 | vadMarker.ts:78/180 | 每个 5s 音频块 push 一条，2h≈1440+ 条，仅 reset 清空 |
| 🟠 中 | CrossFusionEngine.completedSegments 无界（Path A fine） | crossFusion.ts:33/183 | 每 3s fuse 一次，整会话累积 |
| 🟠 中 | IndexedDB WindowCapture.segments 读改写放大（Path A fine） | captureStore.ts:47-58 | 每个结果「读整条→展开数组→全量写回」O(n) 重写放大 |
| 🟡 低 | smartBundle.keyframes 元数据无界 | useClassroomEvents.ts:128-131 | imageBase64 已剥离，仅元数据累积（240-480 小对象） |
| 🟡 低 | AuroraDomeWorld 每帧新建 Vector2 | AuroraDomeWorld.tsx:312 | ChromaticAberration offset 每次渲染 new（GC 压力，非泄漏） |

### 3.3 经审计确认管理良好（无问题）

| 模块 | 结论 |
|------|------|
| CaptureManager | fusionIntervalId/frameWatchdog 清理完善，dispose 正确 off eventBus |
| 课堂全部 hooks | useEffect 均返回 cleanup；IPC on 均解绑；音频管道正确关闭 AudioContext/ScriptProcessor/MediaStream |
| 主进程 screenCapture/videoRecorder/audioCapture | 定时器/写流/Provider 均有 dispose |
| preload.on | 返回精确 removeListener（非 removeAllListeners，避免误清其他订阅者） |
| smartSampler | bitmap.close() 两路径都调用；已加 30 帧 base64 上限 |
| asrTranscriber 信号量 | 队列上限 10，超限丢最旧 |
| 3D 场景 | R3F 声明式资源默认自动 dispose；MemoryManager 监控；粒子 Float32Array 经 useMemo 由 R3F 回收 |
| 各状态 hooks | useAIGatewayHealth/useOllamaStatus/useNetworkStatus/useStuckTimer 清理完善 |

### 3.4 长时间运行内存增长趋势分析

内测机器运行 18+ 小时、内存 5GB，结合代码分析，增长来源（按贡献排序）：

1. **课堂音频段 base64**（若长时间开启课堂采集）：数百 MB，最大头。
2. **笔记 base64 图片**（若笔记含图）：每张图 2-3MB，永久驻留文档 + IndexedDB。
3. **采集缓冲区**（timeline/completedSegments/segments）：数十 MB，随会话时长线性增长。
4. **Electron 多进程基线**（5 进程）：主/GPU/渲染/实用进程各自基线，正常约 500MB-1GB。
5. **Chromium 渲染进程缓存**（长时间运行的 DOM/JS 堆碎片）。

**关键判断**：5GB 中，正常基线约 1-1.5GB，其余 3.5GB+ 主要来自课堂音频段泄漏 + 笔记图片。修复 3.1 + 笔记图片改 blob 引用后，预计长时间运行内存可稳定在 1.5-2GB。

---

## 四、性能优化机制评估

### 4.1 3D 渲染性能

**架构**（client/src/lib/3d/）：

| 组件 | 职责 | 评价 |
|------|------|------|
| SceneProvider | Canvas 容器 + frameloop 控制 | ✅ 模块态降帧已实现（本次新增） |
| PerformanceMonitor | drei PerformanceMonitor 测 FPS → tier | ✅ 工业级实现（滑动均值 + 滞回 + flip-flop 保护） |
| QualityController | 按 effectiveTier 调 DPR（1/1.5/2） | ✅ 已接入天花板模型 |
| AuroraDomeWorld | 浅色场景：穹顶 + 太阳 + 星尘 + 云层 + 后处理 | 🟠 后处理较重；每帧 new Vector2 |
| DeepSeaWorld | 深色场景：光照 + 球体 + 后处理（Bloom/景深/暗角） | 🟠 景深（DepthOfField）是最重的后处理 |
| ParticleSystem | 粒子（500/1200/2000） | 🟠 useFrame 每帧 CPU 更新所有粒子位置 |

**主要开销来源**（按 GPU 成本排序）：
1. **后处理多 pass**：Bloom（mipmapBlur 多分辨率）+ ChromaticAberration + Vignette（浅色）/ DepthOfField（深色，最重）。每个都是全屏 pass，分辨率越高越贵。
2. **粒子 CPU 更新**：ParticleSystem useFrame 每帧遍历所有粒子（最高 2000）做 sin/cos 计算 + 写 Float32Array。
3. **DPR**：DPR 2 时渲染像素是 DPR 1 的 4 倍，后处理成本随之 4 倍。

**已有优化**：tier 分级（粒子数/DPR/后处理开关）、模块态降帧、drei 自适应。

**待优化**：
- 后处理仅 low 档关闭，medium/high 仍全开（见 4.2 关键发现）。
- ParticleSystem 每帧 CPU 更新可改 GPU shader 或降低更新频率。
- ChromaticAberration offset 每帧 new Vector2（应 useMemo）。

### 4.2 三档性能模式实际效果（关键发现）

本次上线的三档模式（静谧/从容/澎湃）通过 **tier 天花板模型**（`effectiveTier = min(自动tier, 档位上限)`）生效：

| 模式 | tier 上限 | DPR | 粒子（穹顶） | 后处理 | 模块态帧率 | 动画 |
|------|----------|-----|------------|--------|-----------|------|
| 静谧 low | low | 1 | 500 | **关闭** | 暂停 | 减弱 |
| 从容 medium（默认） | medium | 1.5 | 1000 | **开启** | 10fps | 正常 |
| 澎湃 high | high | 2 | 1500 | **开启** | 30fps | 正常 |

**⚠️ 关键发现：默认“从容”档仍开启全部后处理。** 后处理（尤其深色景深）是 3D 最大 GPU 开销，但仅在“静谧”档关闭。这意味着：
- 默认档的 3D GPU 开销仍然显著（后处理 + DPR 1.5 + 1000 粒子）。
- 三档模式对**模块态**的优化（降帧）收益最大（用户多数时间在模块页），但对**概览态**（3D 导航）的优化有限（后处理未降）。

**建议**：考虑让“从容”档也降级部分后处理（如关闭色差、降低 Bloom 分辨率），或把后处理开关从“仅 low”改为“low + medium 降级”。这能在不牺牲太多观感的前提下显著降低默认档 GPU 开销。

### 4.3 模块态 3D 降帧/暂停（本次最大单点收益）

- **机制**：概览态 frameloop=always（全帧）；模块态按档位 demand+降帧（medium 10fps / high 30fps）或 never（low 暂停）。
- **为何收益最大**：用户绝大多数时间停留在仪表盘/模块页，3D 被 FunctionalOverlay 毛玻璃遮罩覆盖却仍全帧渲染——这是持续开销最大头。降帧后模块态 GPU 占用大幅下降。
- **配套**：模块态不渲染 PerformanceMonitor（降帧后的 FPS 是人为限制值，若用于测量会误判降级）。

### 4.4 AI 功能性能影响与降级处理

**调用开销**（整体健康，均为手动触发 + loading 状态，不阻塞 UI）：
- 🟠 每次 AI 调用重复 `getSession()` + 动态 import（aiPluginProvider.ts:32-44）——增加前置延迟。
- 🟠 base64 编码用字符串逐字节拼接 O(n²)（visionWorker.ts:284 / asrWorker.ts:116）——大帧阻塞主线程。
- 🟠 课堂分析一次性发送全部关键帧（sessionAnalyzer.ts:92-115）——已有增量分析 analyzePartial 是正确方向，建议默认走增量。

**降级机制**（设计成熟，但有“建成未生效”项）：

| 已覆盖（良好） | 缺失/失效 |
|--------------|----------|
| 本地 Ollama → 云端网关（callWithLocalFallback） | 🚨 离线 AI 队列 offlineAIQueue 是死代码，未接入调用链 |
| 网关多 Provider 降级链 + 预算（fallback.py） | 🚨 流式降级 call_with_fallback_stream 无超时预算/中途不切换 |
| Provider 瞬态重试（2 次指数退避） | 🚨 流式全链路建成但 UI 完全未消费（useAIStream 无人用） |
| 超时熔断（全链路 AbortController/wait_for） | 🟠 客户端直连 AI 无瞬态重试 |
| 限流降级（Redis 不可用放行） | 🟠 aiServiceFallback/aiFallbackManager 缓存降级未接入主链 |
| 实时采集多层节流去重（视觉 3s + Jaccard + dHash） | 🟠 Ollama 缓存 30s 过期即判不可用，误走云端 |
| 健康检查分级（quick/live/full） | 🟠 网关无高成本功能全局并发上限 |

**实时课堂 AI**（设计优秀）：视觉四重门控（变化检测 + 3s 间隔 + Jaccard 去重 + dHash 去重），不存在每帧调 AI。🟠 ASR Worker 无时间节流（仅静音门控），fine 路径建议加最小处理间隔。

---

## 五、性能基准测试方案

### 5.1 测试指标与工具

| 指标 | 工具 | 采集方式 |
|------|------|---------|
| CPU 使用率（分进程） | 任务管理器 / `app.getAppMetrics()` | 主进程 API 取每进程 CPU% |
| 内存（RSS/堆） | 任务管理器 / `process.memoryUsage()` / `performance.memory` | 渲染进程 JS 堆 + 进程 RSS |
| FPS | stats.js / PerformanceMonitor 的 fps / rAF 计数 | 概览态 3D FPS |
| GPU 使用率 | 任务管理器 GPU 列 | 概览态/模块态对比 |
| 主线程阻塞 | Chrome DevTools Performance（Long Tasks） | 打字/搜索时的 long task |
| 内存增长曲线 | 定时采样 memoryUsage 绘曲线 | 长时间运行（1h） |

**建议内置诊断面板**（开发模式）：在设置页“关于”或独立 debug 入口展示实时 FPS/CPU/内存（复用 PerformanceMonitor 的 fps + `app.getAppMetrics()`），便于内测人员自助采集数据。

### 5.2 测试场景矩阵

| 场景 | 操作 | 关注指标 | 高负载点 |
|------|------|---------|---------|
| S1 空闲仪表盘 | 停留仪表盘 5min | 模块态 CPU/GPU/内存 | 3D 降帧后是否真降 |
| S2 3D 概览导航 | 概览态悬停/点击行星 5min | 概览态 FPS/GPU | 后处理 + 粒子 |
| S3 番茄钟计时 | 运行 25min 番茄钟 | CPU/内存趋势 | RAF/计时器 |
| S4 笔记编辑 | 编辑含图大笔记 + 打字 | 打字 long task/内存 | stringify/全量重载 |
| S5 闪卡学习 | 连续翻卡 100 张 | 翻卡 FPS/重渲染 | 整 store 订阅 |
| S6 课堂采集（高负载） | 采集 1h（屏幕 + 音频 + AI） | 内存增长曲线/CPU | 音频 base64/关键帧/AI |
| S7 长时间运行 | 混合使用 4h | 内存增长趋势 | 泄漏检测 |

### 5.3 测试程序

1. **环境固定**：同一台机器、关闭无关应用、固定性能模式（分别测静谧/从容/澎湃）。
2. **基线采集**：每个场景运行前记录初始内存，运行中每 30s 采样 CPU/内存/FPS，运行后记录峰值。
3. **三档对比**：S1/S2/S6 三个场景在静谧/从容/澎湃下各跑一遍，对比 CPU/GPU/FPS/内存。
4. **优化前后对比**：记录当前（v0.31.x）基线，每项 P0/P1 优化后重测对应场景，量化收益。
5. **内存泄漏判定**：S7 长时间运行，若内存持续线性增长（无平台期）→ 泄漏；若趋于平稳 → 正常缓存。

### 5.4 验收基准（建议）

| 指标 | 目标 |
|------|------|
| 空闲仪表盘 CPU（模块态降帧后） | < 3% |
| 概览态 FPS（从容档） | ≥ 45fps |
| 笔记打字 long task | 无 > 50ms 的 long task |
| 课堂采集 1h 内存增长 | < 500MB（修复音频泄漏后） |
| 长时间运行（4h）内存 | 趋于平稳，无持续线性增长 |
| 翻卡交互 FPS | ≥ 55fps |

---

## 六、优化建议（按优先级与投入产出比）

### P0 — 立即修复（高收益、中低成本）

| # | 优化项 | 位置 | 收益 | 成本 |
|---|--------|------|------|------|
| 1 | 课堂音频段 base64 转写后剥离 | useClassroomEvents.ts:191 / vadMarker.ts:259 | 消除 5GB 内存主因 | 低 |
| 2 | 笔记 updateNote 改局部更新（去掉全量 loadNotes） | useNoteStore.ts:213 | 消除打字卡顿 | 中 |
| 3 | 键入 JSON.stringify 移入防抖回调内 | useNoteEditor.ts:106 | 消除大文档打字阻塞 | 低 |
| 4 | 删除 TimerRing/ImmersiveTimer 冗余 RAF | TimerRing.tsx:74 / ImmersiveTimer.tsx:107 | 消除每秒 21.6 万次无效 DOM 写 | 低 |

### P1 — 近期优化（中高收益、中成本）

| # | 优化项 | 位置 | 收益 | 成本 |
|---|--------|------|------|------|
| 5 | 全模块整 store 订阅改细粒度 selector | 6 个页面组件 | 大幅减少各页重渲染 | 中 |
| 6 | “从容”档降级部分后处理（关色差/降 Bloom） | AuroraDomeWorld/DeepSeaWorld | 降低默认档 GPU 开销 | 低 |
| 7 | 笔记搜索/过滤/stripHtml 缓存化 + 预览文本预计算 | NotesPage.tsx / useNoteStore.ts | 消除搜索卡顿 | 中 |
| 8 | 闪卡/复习记录 getAll 改索引查询 | useStudySessionStore.ts:115 / FlashcardsPage.tsx | 随数据增长收益递增 | 中 |
| 9 | setTimeout 统一 ref + cleanup | useCardInteraction/useSocraticFlow | 消除卸载后 setState | 低 |

### P2 — 中期优化（高收益、高成本）

| # | 优化项 | 位置 | 收益 | 成本 |
|---|--------|------|------|------|
| 10 | 笔记图片改 IndexedDB blob 引用（不内嵌 base64） | useNoteEditor.ts:120 | 根治文档体积膨胀（乘数效应） | 高 |
| 11 | 接入或删除离线 AI 队列 offlineAIQueue | offlineAIQueue.ts | 离线 AI 可用性 | 中 |
| 12 | 流式输出 UI 落地（或删除死代码） | aiStreamConsumer.ts | 渐进输出体验 | 中 |
| 13 | 流式降级加首 token/空闲超时 | fallback.py:210 | 流式容错 | 中 |
| 14 | IndexedDB segments 改独立表追加写 | captureStore.ts:47 | 消除读改写放大 | 中 |

### P3 — 长期优化（锦上添花）

| # | 优化项 | 位置 | 收益 | 成本 |
|---|--------|------|------|------|
| 15 | 粒子系统改 GPU 更新/降更新频率 | ParticleSystem.tsx | 降概览态 CPU | 中 |
| 16 | base64 编码改分块/Worker | visionWorker.ts:284 / asrWorker.ts:116 | 消除大帧主线程阻塞 | 低 |
| 17 | AI 调用缓存 token + 静态 import | aiPluginProvider.ts:32 | 降每次 AI 前置延迟 | 低 |
| 18 | 内置性能诊断面板（FPS/CPU/内存） | 设置页 | 内测自助采集 | 中 |
| 19 | 各模块 memo 化（variants/数组/卡片） | 多文件 | 减少重渲染 | 低 |

### 实施建议

1. **先修 P0 四项**（尤其音频 base64 泄漏 + 笔记两项），这是内测反馈“卡顿 + 5GB 内存”的直接解药，预计内存峰值降 60%+、打字卡顿消除。
2. **建立基准基线**：修复前用第五节方案采集 v0.31.x 基线数据，修复后重测量化收益（避免“优化了但不知道效果”）。
3. **制定团队规范**：禁止 `useShallow(s => s)` 整 store 订阅（共性问题根源），纳入代码审查清单。
4. **决策“建成未生效”能力**：离线队列、缓存降级、流式输出三套能力已建成但未接入，应决策“接入 or 删除”，避免维护负担与误导。

---

## 附：已上线的性能优化（本次工作）

- 三档性能模式（静谧/从容/澎湃，默认从容）：performanceMode.ts + usePerformanceMode.ts + PerformanceSettings.tsx
- tier 天花板模型：effectiveTier = min(自动tier, 档位上限)
- 模块态 3D 降帧/暂停：SceneProvider frameloop 控制
- 静谧档全局减弱 Framer Motion 动画：AppLayout MotionConfig
- 主进程采集频率按档位缩放：performance:set-mode IPC
- 关键帧 base64 内存上限（最近 30 帧）：smartSampler.ts
