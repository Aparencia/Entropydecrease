# 课堂助手识别功能升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把课堂助手识别链路从「可用」提升至「市场级」：P0 修复离线 ASR 三大体验问题（重复/不准确/CPU 100%）并建立评估基线；P1 识别准确率市场级（两遍重打分/动态热词/修正回写/说话人分离/中英混说）+ 技能场景感知；P2 视觉识别真正离线可用（本地 OCR/公式引擎/版面）+ 步骤化笔记（技能场景产物革命）。

**Architecture:** 本地引擎优先 + 云端降级（本地优先原则）：P0/P1 纯客户端与网关字段透传（不碰打包）；P2 引入 ONNX/native 依赖（RapidOCR/UniMERNet/Silero），经 utilityProcess worker 隔离，模型经 electron-builder extraResources 分发。内容类型感知（规则版 P1-6 → VLM 版 P2-5）驱动采样参数与产物形态（结构化笔记 / 步骤化笔记）。

**Tech Stack:** Electron + React 18 + TypeScript、sherpa-onnx-node（既有）、silero-vad（ONNX）、rapidocr（ONNX）、sherpa-onnx 公式/重打分模型；Python FastAPI 网关（字段透传）。验证命令：`npm run lint` + `npm run test` + `npm run build`（client/）、`python -m pytest tests/ -q`（ai-gateway/）。

**Spec:** [2026-08-16-classroom-recognition-upgrade-design.md](../specs/2026-08-16-classroom-recognition-upgrade-design.md)

**Maturity Audit:** [classroom-recognition-maturity-audit.md](../../Foresight/classroom-recognition-maturity-audit.md)

---

# Phase P0 — 止血/工程（1-2 周）

## Task P0.1: 识别评估基线（语料 + CER + 热词命中率）

**Files:**
- Create: `client/scripts/asr-eval/README.md`
- Create: `client/scripts/asr-eval/eval.mjs`
- Create: `client/scripts/asr-eval/lib/cer.mjs`
- Create: `client/scripts/asr-eval/lib/hotwordHit.mjs`
- Create: `client/scripts/asr-eval/corpus/README.md`（语料清单与获取说明）
- Create: `docs/asr-eval-baseline/BASELINE-2026-08-16.md`

- [ ] **Step 1: 语料清单** — 定义 10 节课样本（5 网课知识授课 + 5 软件技能，各 10 分钟音频 + 人工参考转写 + 术语表）；语料获取方式与版权说明写入 `corpus/README.md`（本地私有语料不入库，仅清单入库）
- [ ] **Step 2: CER 计算** — 字符级编辑距离（中文按字符、英文按词），输出 CER%、段级分布
- [ ] **Step 3: 热词命中率** — 术语表 vs 转写文本命中统计（含替换后文本）
- [ ] **Step 4: 评测入口** — eval.mjs 支持 `--local`（IPC 调本地 sherpa）/ `--cloud`（网关）/ `--both`，输出对比表
- [ ] **Step 5: 基线报告** — 运行首次评测，产出 `BASELINE-2026-08-16.md`（各课 CER、术语命中率、引擎对比），作为 P0-4~P0-6 与 P1 全部验收的对比基准

**验证:** `node client/scripts/asr-eval/eval.mjs --local` 可运行并输出基线 JSON；基线报告有全部 10 课指标。

## Task P0.2: VAD 升级 Silero（RMS 预筛 + Silero 精判）

**Files:**
- Create: `client/electron/ai/vad/sileroVad.ts`
- Create: `client/electron/ai/vad/modelManager.ts`（Silero 模型下载/校验，~2MB ONNX）
- Create: `client/electron/ai/vad/index.ts`（IPC: `vad_check_available` 注册，channels.ts + preload 白名单登记）
- Edit: `client/electron/ipc/channels.ts`
- Edit: `client/electron/preload.ts`
- Edit: `client/src/lib/capture/vadMarker.ts`（Silero 精判模式；RMS 保留作快速预筛）
- Edit: `client/src/lib/capture/audioPipeline.ts`（音频块流向）
- Edit: `client/src/lib/capture/asrFilters.ts`（静音门控阈值与 Silero 协同说明）
- Edit: `client/src/lib/capture/vadMarker.test.ts`（新增 Silero 模式用例）
- Edit: `client/package.json`（silero-vad 依赖，optionalDependencies）

- [ ] **Step 1: 依赖与模型** — 引入 silero-vad（onnxruntime 推理，主进程加载失败不崩溃）；模型下载并入 `modelManager` 风格管理
- [ ] **Step 2: 主进程服务** — Silero 推理封装（16k 单声道 Float32 输入），IPC `vad_check_available` 注册并登记白名单（SEC-005）
- [ ] **Step 3: VADMarker 集成** — 语音段状态机不变，能量判定改为「RMS 预筛 → Silero 精判」；loopback/mic 统一路径；Silero 不可用时回退纯 RMS（现状行为）
- [ ] **Step 4: 测试与对比** — 单测覆盖（Silero 命中/回退/段边界）；用 P0.1 语料中噪声样本对比 RMS vs Silero 切段边界（静音误判率、语音截断率）
- [ ] **Step 5: 门禁** — lint + test + build 全绿

**验证:** 噪声/混响样本切段边界可量化优于 RMS；Silero 不可用时行为与现状一致（无回归）。

## Task P0.3: 真实置信度 + 质量门控

**Files:**
- Edit: `server/ai-gateway/chains/transcribe_chain.py`（confidence 语义：引擎置信度或估算值，去除 0.0 占位）
- Edit: `server/ai-gateway/routers/transcribe.py`（透传 confidence）
- Edit: `server/ai-gateway/routers/vision.py`（confidence 语义修订为「提取完整性 + 语义一致性」）
- Edit: `server/ai-gateway/chains/vision_extract_chain.py`（输出置信度字段）
- Edit: `client/src/lib/capture/captureTypes.ts`（confidence 字段语义注释）
- Edit: `client/src/features/classroom/components/UnifiedTimeline.tsx`（低置信度标记样式）
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（消费 confidence）
- Edit: `client/src/features/classroom/utils/analysisErrors.test.ts`（扩展）

- [ ] **Step 1: ASR 置信度** — sherpa getResult 返回 confidence 时透传（zipformer-transducer 支持）；云端无则按文本长度/重打分一致性估算，语义文档化
- [ ] **Step 2: 视觉置信度** — 「提取完整性 + 语义一致性」合成分（在现有完整度 0.5+0.5 基础上加语义一致性因子），字段语义写入代码注释（GW-2#11 风格）
- [ ] **Step 3: UI 标记** — 低置信度（<阈值）转写段/视觉段视觉标记（弱化/角标），悬停显示置信度值
- [ ] **Step 4: 网关 pytest + 客户端单测** — confidence 契约测试；网关 331 基线不回归

**验证:** 低置信度内容可见标记；confidence 语义在代码注释与 API 文档一致；网关 pytest 全绿。

## Task P0.4: 离线 ASR 重复修复（端点规则 + 剩余样本续喂 + 跨 final 去重）

**Files:**
- Edit: `client/electron/ai/local-asr/SherpaAsrService.ts`（endpointConfig 调优）
- Edit: `client/electron/ai/local-asr/streamingAsr.ts`（端点命中后块内剩余样本续喂新流）
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（跨 final 重叠去重）
- Edit: `client/src/lib/capture/asrFilters.ts`（`collapseAdjacentDuplicates` 扩展跨标点形态）
- Edit: `client/src/lib/capture/asrFilters.test.ts`（新增用例）

- [ ] **Step 1: 端点规则调优** — rule2 `minTrailingSilence` 1.2s→2.0s、`minUtteranceLength` 8→10（缓解中文句内停顿误断句）；rule1 保持 2.4s
- [ ] **Step 2: 剩余样本续喂** — `feedStreamingAsr` 端点命中后，当前块中尚未喂入的样本续喂新流（reset 后继续），避免句子断裂与尾词重读
- [ ] **Step 3: 跨 final 重叠去重** — `useClassroomEvents` 维护上一 final 尾缀；新 final 与尾缀重叠 ≥4 字或 Jaccard>0.9 时截断合并
- [ ] **Step 4: 重复压缩扩展** — `collapseAdjacentDuplicates` 支持跨标点相邻重复（"就是，就是"→"就是"）；不误伤"对，对"类确认语
- [ ] **Step 5: flush 去重** — `stopStreamingAsr` flush 尾句与已推送 final 重叠时去重
- [ ] **Step 6: 回归验证** — 用 P0.1 语料 100 段样本统计相邻 final 重复率 <0.5%；单测覆盖全部新形态

**验证:** 长课相邻 final 重复率 <0.5%；P0.1 基线 CER 不劣化（重复压缩不误杀）。

## Task P0.5: 离线 ASR CPU 优化（线程数 + decode 节流 + 采样率阻断）

**Files:**
- Edit: `client/electron/ai/local-asr/SherpaAsrService.ts`（线程数策略 + 非 16k 阻断）
- Edit: `client/electron/ai/local-asr/config.ts`（threads 默认值与上限）
- Edit: `client/electron/ai/local-asr/streamingAsr.ts`（decode 积压节流）
- Edit: `client/src/features/classroom/utils/asrTranscriber.ts`（采样率校验前置提示）

- [ ] **Step 1: 线程数策略** — 默认 `min(4, cpuCount)`，配置上限 8；文档注明 zipformer 实际 1-2 线程即够
- [ ] **Step 2: decode 积压节流** — 音频块积压时合并跳过中间块（按需解码，末尾必解码）；避免主进程同步解码风暴
- [ ] **Step 3: 非 16k 采样率前置阻断** — 非 16k 转写请求直接报错并提示（替代当前仅 warn）；渲染进程侧在采集启动前校验
- [ ] **Step 4: 性能验证** — 离线会话采样 CPU 峰值（任务管理器/`process.cpuUsage`），相对现状下降 ≥50%；P0.1 基线 CER 不回归

**验证:** CPU 峰值 ≤单核等效；主进程事件循环延迟 <16ms；识别质量不回归。

## Task P0.6: 离线 ASR 准确率即时提升（课程术语自动热词 + rescore 接口预留）

**Files:**
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（首帧识别成功后注入热词并重建流）
- Edit: `client/src/features/classroom/utils/hotwordRuntime.ts`（动态注入通道）
- Edit: `client/electron/ai/local-asr/index.ts`（`local_asr_transcribe` 增加可选 rescore 参数占位）
- Edit: `client/electron/ai/local-asr/SherpaAsrService.ts`（rescore 回调接口签名预留）
- Edit: `client/src/lib/capture/hotwordApply.test.ts`（扩展）

- [ ] **Step 1: 课程识别 → 热词注入** — `detect-course` 成功（或窗口标题课程名）后，将 courseName/subject/suggested_terms 注入 boost 词表（`loadSessionHotwords` 后追加）
- [ ] **Step 2: 重建流生效** — 真流式运行中注入热词：stop → 携带新热词 restart（或评估 sherpa 热词动态更新能力，不支持则重启流，保留断点续喂）
- [ ] **Step 3: rescore 接口预留** — `transcribeLocal` 增加可选 `rescore?: (text: string) => Promise<string>` 回调签名（P1.1 接入 SenseVoice），本任务不实现逻辑
- [ ] **Step 4: 验证** — P0.1 语料中课程术语热词命中率 ≥80%；单测覆盖注入/去重/上限

**验证:** 术语热词命中率 ≥80%；热词注入不阻塞采集时序（异步、失败静默）。

## Task P0.7: 识别统计面板

**Files:**
- Edit: `client/src/features/classroom/pages/ClassroomPage.tsx`
- Edit: `client/src/features/classroom/components/ClassroomStatusBanners.tsx`
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（统计状态导出）

- [ ] **Step 1: 统计状态** — 会话中实时统计：已捕捉关键帧 N、已转写 M 句、VAD 状态（语音中/静音）、识别引擎徽标（本地 zipformer / 云端 / 重打分占位）
- [ ] **Step 2: UI 展示** — 状态条/侧栏展示，复用既有 banner 组件样式；不阻塞采集
- [ ] **Step 3: 验证** — 会话中可见识别工作状态；无性能影响

**验证:** 统计可见且实时；无性能影响。

## Phase P0 门禁

- [ ] `cd client && npm run lint && npm run test && npm run build` 全绿
- [ ] P0.1 基线报告产出；P0.4/P0.5 用基线回归确认质量不劣化
- [ ] P0 全部提交遵循 Conventional Commits（`fix(classroom):` / `feat(classroom):` / `perf(classroom):`）

---

# Phase P1 — 核心质量（1-2 月）

## Task P1.1: 两遍重打分（SenseVoice-Small 句末重打分）

**Files:**
- Create: `client/electron/ai/local-asr/sensevoiceRescore.ts`
- Edit: `client/electron/ai/local-asr/modelManager.ts`（保留 SenseVoice 模型，纳入管理；修正 `cleanupOldModels` 清理逻辑）
- Edit: `client/electron/ai/local-asr/config.ts`（模型列表）
- Edit: `client/electron/ai/local-asr/SherpaAsrService.ts`（接入 rescore）
- Edit: `client/electron/ai/local-asr/streamingAsr.ts`（final 前重打分）
- Edit: `client/src/features/classroom/utils/asrTranscriber.ts`（透传配置）
- Edit: `client/src/pages/settings/components/AsrSettingsSection.tsx`（开关/模型管理 UI）

- [ ] **Step 1: 模型管理修正** — `cleanupOldModels` 保留 SenseVoice；模型下载/删除 UI 支持
- [ ] **Step 2: SenseVoice 推理封装** — 句末音频段（final 对应的原始 PCM）送 SenseVoice 重打分，输出候选文本 + 置信度
- [ ] **Step 3: 接入流式与按段路径** — 重打分结果与原结果按置信度比较，高者胜出；失败静默回退原结果
- [ ] **Step 4: 验证** — P0.1 语料 CER 相对下降 ≥10%；重打分延迟 <1s（不拖慢实时性，否则改异步）

## Task P1.2: 动态热词闭环（OCR 术语 → 弱 boost）

**Files:**
- Edit: `client/src/features/classroom/utils/hotwordRuntime.ts`（动态词通道，不持久化）
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（视觉提取 concepts 注入）
- Edit: `client/src/lib/capture/hotwordApply.ts`（动态词去重/上限）
- Edit: `client/src/lib/capture/hotwordApply.test.ts`

- [ ] **Step 1: 动态词通道** — 视觉提取（`VisionWorker` 输出 concepts/text）提取术语 → 弱 boost（权重低于静态词表）
- [ ] **Step 2: 上限与去重** — 动态词上限（如 50）、与静态词表去重、会话结束清空
- [ ] **Step 3: 验证** — 热词命中率提升可量化（P0.1 基线对比）

## Task P1.3: 转写修正回写（编辑 → 词库 → 下次生效）

**Files:**
- Edit: `client/src/features/classroom/components/UnifiedTimeline.tsx`（段落 inline 编辑态）
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（修正持久化）
- Edit: `client/src/lib/storage/hotwordStore.ts`（「修正来源」标记）
- Edit: `client/src/features/classroom/utils/hotwordRuntime.ts`（修正词自动生效）
- Edit: `client/electron/ai/handlers/flashcardHandler.ts`（下游消费修正版）

- [ ] **Step 1: 转写可编辑** — 时间线段落 inline 编辑（保存/取消/标记「已修正」）
- [ ] **Step 2: 回写词库** — 修正文本差异提取 → 生成 replace 词条（自动或用户确认）写入 `hotwordStore`（source='correction'）
- [ ] **Step 3: 下游优先** — 笔记/闪卡生成优先使用修正版文本（audioText 替换）
- [ ] **Step 4: 验证** — 修正词下次识别命中；修正版本下游消费优先；单测覆盖

## Task P1.4: 说话人分离（离线后处理 + 手动重新识别）

**Files:**
- Create: `server/ai-gateway/routers/diarize.py`（评估，funasr CAM++ 或 pyannote 服务化）
- Create: `server/ai-gateway/chains/diarize_chain.py`
- Edit: `server/ai-gateway/main.py`（路由注册顺序）
- Edit: `client/src/features/classroom/components/UnifiedTimeline.tsx`（说话人标签 + 手动重识别 UI）
- Edit: `client/src/lib/capture/captureTypes.ts`（speaker 字段）

- [ ] **Step 1: 服务端 diarize 端点** — 会话音频 → 说话人聚类（DER ≤15% 目标）；单教师会话自动跳过（P1.6 分类驱动）
- [ ] **Step 2: 手动重识别** — 段落说话人标记、批量替换/合并标签（飞书式）；结果持久化
- [ ] **Step 3: 验证** — 2-3 人场景 DER ≤15%；单教师零打扰

## Task P1.5: 中英混说（FunASR paraformer-bilingual-zh-en spike）

**Files:**
- Create: `docs/knowledge/solutions/2026-08-mixed-language-spike.md`（spike 结论）
- Edit: `client/electron/ai/local-asr/`（按 spike 结论接入或标注不支持）
- Edit: `server/ai-gateway/routers/transcribe.py`（混说参数）
- Edit: `client/src/features/classroom/utils/asrTranscriber.ts`（语言映射）

- [ ] **Step 1: Spike** — 评估 sherpa-onnx 对 FunASR bilingual 模型格式兼容性；SenseVoice 混说能力实测；结论落盘
- [ ] **Step 2: 按结论接入** — 本地支持则接入；不支持则云端混说参数 + 本地提示降级（本地优先优雅降级）
- [ ] **Step 3: 验证** — 混说样本英文术语不被音译错字

## Task P1.6: 轻量内容类型感知（规则版分类器）

**Files:**
- Create: `client/src/features/classroom/utils/contentClassifier.ts`
- Create: `client/src/features/classroom/utils/contentClassifier.test.ts`
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（分类驱动）
- Edit: `client/src/lib/capture/smartSampler.ts`（技能类提高采样频率参数）

- [ ] **Step 1: 规则分类器** — 窗口标题关键词 + 转写术语规则 → 课程/软件技能/手法技巧/讲座
- [ ] **Step 2: 参数驱动** — 技能类：采样间隔缩短（如 15s→5s）+ 变化阈值降低（0.12→0.05）；课程类维持现状
- [ ] **Step 3: 验证** — 分类准确率 ≥80%（评估集）；分类结果驱动采样参数生效

## Task P1.7: 指令句补帧

**Files:**
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（final 文本指令模式匹配 → 强制截图）
- Edit: `client/src/lib/capture/captureManager.ts`（补帧入口）
- Edit: `client/src/lib/capture/smartSampler.ts`（强制捕获支持）

- [ ] **Step 1: 指令模式匹配** — "点击/拖到/设置为/选择/打开" 等模式命中 final 文本
- [ ] **Step 2: 强制补帧** — 命中后立即触发一次截图（绕过定时采样），与 crossFusion 时间窗联动
- [ ] **Step 3: 验证** — 操作瞬间捕捉率提升可量化；补帧不显著增加成本

## Task P1.8: 漏捕检测 + 手动补截

**Files:**
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（漏捕检测）
- Create: `client/src/features/classroom/components/MissedCaptureHint.tsx`（提示条）
- Edit: `client/src/lib/capture/captureManager.ts`（手动截图入口）
- Edit: `client/src/features/classroom/pages/ClassroomPage.tsx`（快捷键注册）

- [ ] **Step 1: 漏捕检测** — 指令句后 N 秒无新关键帧 → 提示「这一步画面可能没捕捉到」
- [ ] **Step 2: 手动补截** — 快捷键截图插入时间线（复用关键帧存储）
- [ ] **Step 3: 验证** — 漏捕提示率与手动补截可用；时间线可见

## Task P1.9: 实时截图流同屏

**Files:**
- Edit: `client/src/features/classroom/components/UnifiedTimeline.tsx`（最近 6 帧缩略流）
- Edit: `client/src/features/classroom/pages/ClassroomPage.tsx`

- [ ] **Step 1: 缩略流** — 复用 `smartBundle.keyframes` 最近 6 帧缩略图 + 实时字幕同屏
- [ ] **Step 2: 验证** — 识别过程可见；无性能影响（缩略图缓存）

## Phase P1 门禁

- [ ] P1.1 CER 相对下降 ≥10%（P0.1 基线对比）
- [ ] P1.2/P1.3 热词命中率与修正回写闭环验证
- [ ] P1.6 分类准确率 ≥80%；P1.7/P1.8 技能场景捕捉提升可量化
- [ ] 网关 pytest 基线不回归；客户端 lint/test/build 全绿

---

# Phase P2 — 差异化（季度级）

## Task P2.1: 本地 OCR（RapidOCR / PP-OCRv5 ONNX）

**Files:**
- Create: `client/electron/ai/local-ocr/`（onnxruntime 推理 + utilityProcess worker + IPC 注册）
- Edit: `client/src/lib/ai/visionWorker.ts`（本地 OCR 优先分支）
- Edit: `client/electron-builder.yml`（extraResources 模型分发，额外审查）
- Edit: `.github/workflows/`（构建矩阵，额外审查）
- Edit: `client/src/features/classroom/components/AsrModelPrompt.tsx`（模型管理扩展）

- [ ] **Step 1: 引擎接入** — rapidocr onnxruntime 推理（utilityProcess 隔离，主进程不阻塞）
- [ ] **Step 2: fine 路径本地优先** — 本地 OCR 出 text/formulas 草稿 → 云端 VLM 仅语义增强/兜底
- [ ] **Step 3: 模型分发** — extraResources + 下载管理 UI；打包产物验证
- [ ] **Step 4: 验证** — 离线识别可用率 100%；OCR 文本准确率对比基线

## Task P2.2: 公式引擎（UniMERNet / PP-FormulaNet）

**Files:**
- Create: `client/electron/ai/local-formula/`（onnx 推理）
- Edit: `client/src/lib/capture/tipTapNodeBuilder.ts`（接入）
- Edit: `client/electron-builder.yml`（模型分发）

- [ ] **Step 1: 引擎接入** — UniMERNet（手写板书优先）onnx 导出 + 推理
- [ ] **Step 2: 版面定位联动** — 先版面定位公式框（P2.3）再识别
- [ ] **Step 3: 交叉校验** — 与 VLM 公式输出交叉校验，高置信度胜出
- [ ] **Step 4: 验证** — 印刷公式 ≥95%（测试集）；手写板书可用

## Task P2.3: 版面解析（PP-StructureV3）

**Files:**
- Create: `client/electron/ai/local-layout/`（onnx 推理）
- Edit: `client/src/lib/capture/captureTypes.ts`（版面结构字段）
- Edit: `client/src/lib/ai/visionWorker.ts`（注入分块结果）

- [ ] **Step 1: 版面检测** — 标题/正文/图表/公式分块输出
- [ ] **Step 2: 注入结构化字段** — 替换 VLM prompt 的部分职责；为 P2.6 提供版面坐标
- [ ] **Step 3: 验证** — 分块正确率 ≥85%（测试集）

## Task P2.4: 本地小 VLM 增强 + 采集期时间轴对齐

**Files:**
- Create: `client/electron/ai/local-vlm/`（Qwen2.5-VL 量化，可选下载）
- Edit: `client/src/lib/capture/crossFusion.ts`（时间戳精确匹配升级）
- Edit: `client/src/lib/capture/smartSampler.ts`（精确时间戳）
- Edit: `client/src/features/classroom/hooks/useClassroomEvents.ts`（句级时间戳）

- [ ] **Step 1: 本地 VLM** — 关键帧语义增强（要点/概念/图表解读），未下载时自动降级云端
- [ ] **Step 2: 采集期对齐** — 截图精确时间戳 + ASR final 句级时间戳 → 时间窗融合升级为精确匹配
- [ ] **Step 3: 验证** — 离线语义增强可用；时间轴对齐误差 <1s

## Task P2.5: 视觉增强内容分类（VLM 版）

**Files:**
- Edit: `client/src/features/classroom/utils/contentClassifier.ts`（VLM 分类替换规则版）

- [ ] **Step 1: VLM 分类** — 关键帧分类 + 置信度输出；规则版作回退
- [ ] **Step 2: 验证** — 分类准确率 ≥90%

## Task P2.6: 区域化监测 + 输入事件触发

**Files:**
- Edit: `client/electron/ai/local-ocr/`（区域 OCR 监测）
- Create: `client/native/input-hook/`（评估；安全评审后实施）
- Edit: `client/src/lib/capture/smartSampler.ts`

- [ ] **Step 1: 区域化 OCR 监测** — 版面定位参数面板区域，定时 OCR 数值变化 → 参数变更记录（"曝光+0.5"）
- [ ] **Step 2: 输入事件触发** — 系统级鼠标/键盘监听（默认关闭，用户授权后启用；无感采集约束下保守实现）
- [ ] **Step 3: 安全评审** — 隐私影响评估；无授权不启用
- [ ] **Step 4: 验证** — 参数变化自动入笔记

## Task P2.7: 步骤化笔记（技能场景产物）

**Files:**
- Create: `client/src/lib/capture/stepExtractor.ts`（步骤边界检测）
- Create: `client/src/features/classroom/components/StepFlowView.tsx`（缩略图墙 + 双栏对照）
- Create: `client/src/features/classroom/components/StepCard.tsx`
- Edit: `client/src/lib/storage/captureStore.ts`（步骤持久化）
- Edit: `client/src/features/classroom/pages/ClassroomPage.tsx`（入口）

- [ ] **Step 1: 步骤边界检测** — 大变化帧（changeScore ≥0.6）+ 指令句（P1.7）→ 新步骤
- [ ] **Step 2: 步骤卡片** — 截图 + 操作说明（OCR/指令句提炼）+ 参数变更（P2.6）+ 时间戳
- [ ] **Step 3: 缩略图墙** — 一屏浏览全部步骤，点击跳转视频对应时刻
- [ ] **Step 4: 验证** — 步骤边界准确率 ≥80%（评估集）；产物可插入笔记/导出

## Task P2.8: 步骤 → 复习联动

**Files:**
- Edit: `client/electron/ai/handlers/flashcardHandler.ts`（步骤闪卡）
- Edit: `client/src/features/classroom/components/StepFlowView.tsx`（练习模式 + checklist）

- [ ] **Step 1: 练习模式** — 隐藏说明看截图回忆操作，翻卡对照
- [ ] **Step 2: 步骤闪卡** — 参数设置/快捷键 → 闪卡（复用 flashcardHandler）
- [ ] **Step 3: checklist** — 步骤转清单边看边做
- [ ] **Step 4: 验证** — 步骤→闪卡转化 ≥90%

## Phase P2 门禁

- [ ] 本地引擎三件套（P2.1/2/3）离线可用率 100%，打包产物可运行
- [ ] P2.7 步骤边界准确率 ≥80%；P2.8 步骤→闪卡转化 ≥90%
- [ ] `electron-builder.yml` 与 workflows 变更经额外审查；CI 构建全绿

---

# 里程碑与验证门禁总览

| 里程碑 | 内容 | 验证门禁 |
|---|---|---|
| M-P0 | 离线 ASR 三问题修复 + 评估基线 + Silero VAD + 置信度 | CER 基线产出；重复率 <0.5%；CPU 下降 ≥50%；lint/test/build 绿 |
| M-P1 | 重打分 + 动态热词 + 修正回写 + 说话人 + 混说 + 技能感知 | CER 下降 ≥10%；热词命中率 ≥80%；分类 ≥80%；网关 pytest 不回归 |
| M-P2 | 本地 OCR/公式/版面 + 步骤化笔记 + 复习联动 | 离线可用率 100%；步骤边界 ≥80%；打包产物可运行 |

# 风险与注意（摘自 Spec §7）

- 准确率口径：以自建语料 CER + 热词命中率为验收，不对标厂商 98% 宣传
- P2 native/ONNX 依赖与模型分发（300-500MB）需打包审查与模型管理 UI
- P2.6 输入事件触发需安全评审，默认关闭
- P1.5 混说先 spike；P1.1 修正 `cleanupOldModels` 保留 SenseVoice
- P0.5 线程下调以 P0.1 基线回归确认质量不降
