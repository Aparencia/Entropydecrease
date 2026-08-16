# 课堂助手识别功能升级设计（代码级方案）

> 编制日期：2026-08-16
> 依据：《课堂助手识别功能市场成熟度审验报告》（`docs/Foresight/classroom-recognition-maturity-audit.md`）
> 配套调研：`docs/Foresight/ocr-vision-market-2025-2026.md`、`docs/Foresight/asr-market-2025-2026.md`、`docs/research/transcription-competitor-analysis-2026.md`
> 目标：把课堂助手识别链路从「可用」提升至「市场级」，覆盖知识授课与技能学习双场景，兑现「本地优先 + 数据不出本机」
> 工作区根目录以 `<root>` 代指，涉及文件路径均相对该根目录

---

## 一、总体目标与原则

### 1.1 总体目标

把识别链路升级为「识别-理解-内化」闭环：识别准确率市场级（两遍重打分/动态热词/评估基线）、视觉识别真正离线可用（本地 OCR/公式引擎）、产物形态适配双场景（知识授课 → 结构化笔记；技能学习 → 步骤化笔记）、识别过程可见可信（置信度/统计/漏捕提示/修正回写）。

### 1.2 必须遵守的架构约束

| 约束 | 说明 | 证据 |
|---|---|---|
| **本地优先** | 本地引擎（sherpa-onnx / RapidOCR / UniMERNet）优先于云端；新增 AI 能力须有本地兜底路径 | `asrTranscriber.ts`、AGENTS.md |
| **无感采集** | `useSystemPicker: false`，不得引入系统级二次确认；P2-6 输入事件触发需单独安全评审 | `displayMediaHandler.ts` |
| **SEC-005 IPC 安全** | 数据回传 IPC 一律 sender.id 验证 + 运行时结构断言；新 IPC 通道登记 `ipc/channels.ts` 并加入 preload 白名单 | `mediaCaptureHandlers.ts`、`preload.ts` |
| **版本定位延续** | 课堂助手定位不改变，升级为识别链路增量，不改变产品定位 | `docs/versions/v0.4.0.md` |

### 1.3 通用工程约定

- 新增 AI 网关端点遵守路由注册顺序规范（防通配路由遮蔽）与 IPC 鉴权注入
- 单文件 ≤300 行、含 `@ai-context` 中英双语注释（AI 编程规范 §1/§3）
- 客户端 `npm run lint` + `npm run test` + `npm run build` 全绿；网关 `python -m pytest tests/ -q` 基线不回归
- 工作量标注：**S** ≤3 人日 ｜ **M** 3-10 人日 ｜ **L** >10 人日

---

## 二、P0：止血/工程（1-2 周，纯客户端，低风险）

> 目标：消除三大离线 ASR 体验问题（重复/不准确/CPU 100%）+ 建立评估基线 + 可信度基础。全部为客户端改动，不碰打包链路。

| 编号 | 优化项 | 动机/对标 | 技术方案要点 | 涉及文件 | 验收标准 | 工作量 |
|---|---|---|---|---|---|---|
| P0-1 | 识别评估基线 | 市场口径：厂商 98% 是宣传，真实课堂 CER 5-20%；无基线无法证明改进 | 自建课堂/技能语料（10 节课样本，含网课与软件技能各半）；评测脚本计算 CER + 热词命中率；对齐 AISHELL-1/2 + WenetSpeech 参考 | 新增 `client/scripts/asr-eval/`（Node 脚本，独立于网关运行，语料与结果存 `docs/asr-eval-baseline/`） | 基线报告产出；后续每层改动可对比 CER/命中率 | M |
| P0-2 | VAD 升级 Silero | 市场：Silero VAD（2MB ONNX、噪声鲁棒、原生流式）是本地首选；RMS 能量仅粗过滤 | 引入 silero-vad（onnxruntime 推理，主进程加载）；`VADMarker` 增加神经网络 VAD 模式（RMS 作快速预筛，Silero 作精判），loopback/mic 统一走 Silero；保留 RMS 兜底 | `client/electron/ai/vad/`（新增）、`client/src/lib/capture/vadMarker.ts`、`client/src/lib/capture/audioPipeline.ts` | 噪声/混响场景切段边界准确率可量化对比（RMS vs Silero）；单测覆盖 | M |
| P0-3 | 真实置信度 + 质量门控 | 现状 confidence=0.0 占位 / "完整度伪指标"（`transcribe_chain.py` L101、`vision.py` L138-145）；竞品均有关键词置信与修正入口 | ASR：返回引擎级置信度（sherpa getResult 含 confidence 时透传；云端 API 无则按文本长度/重打分一致性估算）；视觉：置信度改为「提取完整性 + 语义一致性」合成分；低置信度段 UI 标记（配合 P1-3 修正入口） | `server/ai-gateway/chains/transcribe_chain.py`、`server/ai-gateway/routers/vision.py`、`client/src/lib/capture/captureTypes.ts`、`client/src/features/classroom/components/UnifiedTimeline.tsx` | 低置信度内容可见标记；confidence 语义文档化；单测覆盖 | M |
| P0-4 | 离线 ASR 重复修复 | 用户反馈「识别偶发重复」；根源：端点规则 rule2（1.2s 静音）对中文句内停顿误断句（`SherpaAsrService.ts` L152-158）、端点命中后块内剩余样本丢弃（`streamingAsr.ts` L110-121）、跨 final 无重叠去重（`useClassroomEvents.ts` L319-334） | ① 端点规则调优：rule2 静音 1.2s→2.0s、minUtteranceLength 8→10；② 端点命中后块内剩余样本续喂新流（不丢弃）；③ UI 跨 final 重叠去重：后缀重叠 ≥4 字或 Jaccard>0.9 时合并；④ `collapseAdjacentDuplicates` 扩展跨标点形态（"就是，就是"）；⑤ 停止 flush 尾句与已推送 final 去重 | `client/electron/ai/local-asr/SherpaAsrService.ts`、`client/electron/ai/local-asr/streamingAsr.ts`、`client/src/features/classroom/hooks/useClassroomEvents.ts`、`client/src/lib/capture/asrFilters.ts` | 100 段样本重复观感消失；长课相邻 final 重复率 <0.5%；回归测试覆盖端点/剩余样本/重叠去重 | M |
| P0-5 | 离线 ASR CPU 优化 | 用户反馈「CPU 100%」；根源：线程数默认 cpuCount-1（`SherpaAsrService.ts` L128-131）、主进程同步 `while(isReady) decode` 无节流 | ① 线程数默认 min(4, cpuCount) 且配置上限 8（zipformer 实际 1-2 线程即够）；② decode 积压节流：落后时合并跳过中间块（按需解码）；③ 非 16k 采样率前置阻断（当前仅 warn，`SherpaAsrService.ts` L263-265）；④ 评估流式解码移入 worker 线程（`utilityProcess`） | `client/electron/ai/local-asr/SherpaAsrService.ts`、`client/electron/ai/local-asr/streamingAsr.ts`、`client/electron/ai/local-asr/config.ts` | 离线会话 CPU 峰值 ≤单核等效（相对下降 ≥50%）；主进程事件循环延迟 <16ms；识别质量不回归 | M |
| P0-6 | 离线 ASR 准确率即时提升 | 用户反馈「识别不准确」；无动态热词、课程术语错字多 | ① 课程名/学科/首帧 AI 识别术语自动注入热词（`useClassroomEvents.ts` 首帧识别成功后调用 `loadSessionHotwords` 并重建流）；② 采样率校验前置（P0-5③ 联动）；③ 为 P1-1 两遍重打分预留接口（`transcribeLocal` 增加可选 rescore 回调） | `client/src/features/classroom/hooks/useClassroomEvents.ts`、`client/src/features/classroom/utils/hotwordRuntime.ts`、`client/electron/ai/local-asr/index.ts` | 课程术语热词命中率 ≥80%；<2 字短句段占比下降；单测覆盖 | S |
| P0-7 | 识别统计面板（F 基础） | 竞品均显示识别工作状态；用户无法感知识别深度 | 会话中实时统计：已捕捉关键帧 N、已转写 M 句、当前 VAD 状态、识别引擎（本地/云端）徽标；复用既有 `session.stats` 与 `VADStats` | `client/src/features/classroom/pages/ClassroomPage.tsx`、`client/src/features/classroom/components/ClassroomStatusBanners.tsx` | 会话中可见识别工作状态；无性能影响 | S |

**P0 依赖**：P0-2 独立；P0-4/P0-5/P0-6 共享本地 ASR 链路建议同批；P0-1 需先行（为 P0-4~P0-6 提供验收基线）；P0-3 依赖 P0-1 的置信度语义；P0-7 独立。全部无跨端/网关改动（P0-3 网关改动为字段透传，风险低）。

---

## 三、P1：核心质量（1-2 月）

> 目标：识别准确率市场级 + 技能场景感知基础 + 可信度闭环。网关 + IPC + 前端混合，逐项独立可交付。

| 编号 | 优化项 | 动机/对标 | 技术方案要点 | 涉及文件 | 验收标准 | 工作量 |
|---|---|---|---|---|---|---|
| P1-1 | 两遍重打分（SenseVoice） | 市场最佳实践：流式 Zipformer 出结果 + 句末 SenseVoice 重打分（sherpa-onnx 官方 two-pass 示例）；直接治「识别不准确」 | ① 下载 SenseVoice-Small 模型（复用 `modelManager.ts`，注意 `cleanupOldModels` 当前会清理 SenseVoice，需改为保留）；② `SherpaAsrService.ts` 新增 rescore 路径：按段转写与流式 final 均送 SenseVoice 重打分（本地 CPU 可跑）；③ 重打分结果与原结果置信度比较，高者胜出；④ 云端降级路径保持 | `client/electron/ai/local-asr/`（SherpaAsrService / modelManager / config）、`client/electron/ai/local-asr/streamingAsr.ts` | 课堂语料 CER 相对下降 ≥10%；SenseVoice 模型下载/管理 UI 可用；重打分失败静默回退原结果 | L |
| P1-2 | 动态热词闭环 | 市场最佳实践：静态术语表（强 boost）+ PPT/板书 OCR 动态词（弱 boost）；熵减双通道独有闭环机会 | ① OCR/视觉提取结果（`VisionWorker` 输出的 concepts/text）提取术语 → 弱 boost 注入当前会话热词（`hotwordRuntime.ts` 增加动态词通道，不持久化）；② 课程维度静态词表维持强 boost；③ 动态词上限与去重（防词表膨胀） | `client/src/features/classroom/utils/hotwordRuntime.ts`、`client/src/lib/capture/hotwordApply.ts`、`client/src/features/classroom/hooks/useClassroomEvents.ts` | 热词命中率提升可量化（P0-1 基线对比）；动态词不污染静态词表；单测覆盖 | M |
| P1-3 | 转写修正回写 | 竞品共性：讯飞「用户修正回写」、飞书「改字同步纪要」；信任建设关键（UX-D） | ① 转写可编辑（时间线段落 inline 编辑）；② 修正文本写入本地词库（replace 词条自动生成或用户确认）；③ 下次识别自动生效（`hotwordStore` 新增「修正来源」标记）；④ 修正后重跑笔记/闪卡使用修正版 | `client/src/features/classroom/components/UnifiedTimeline.tsx`（编辑态）、`client/src/lib/storage/hotwordStore.ts`、`client/src/features/classroom/hooks/useClassroomEvents.ts`、`client/electron/ai/handlers/flashcardHandler.ts` | 修正词下次识别命中；修正版本下游消费优先；单测覆盖 | M |
| P1-4 | 说话人分离 + 手动重新识别 | 竞品标配；飞书「重新识别」兜底模式；单教师可跳过，2-3 人互动用离线后处理 | ① 离线后处理：课后对会话音频跑 FunASR CAM++（或 pyannote）说话人聚类（云端或本地评估）；② 手动模式：段落标记说话人、批量替换/合并标签（飞书式）；③ 单教师会话自动跳过（P1-6 分类结果驱动） | `server/ai-gateway/routers/`（新增 diarize 端点，评估）、`client/src/features/classroom/components/UnifiedTimeline.tsx`、`client/src/lib/capture/captureTypes.ts` | 2-3 人场景 DER ≤15%；手动重识别 UI 可用；单教师会话零打扰 | M |
| P1-5 | 中英混说 | 通义「中英自由说」是国产主场；代码课「中文讲解+英文术语」刚需 | ① 评估 FunASR `paraformer-bilingual-zh-en` 流式版（本地）可行性（sherpa-onnx 是否支持该模型格式，不支持则评估 FunASR 原生推理）；② 云端 transcribe 端点启用混说参数；③ 语言检测结果写入转写段元数据 | `client/electron/ai/local-asr/`、`server/ai-gateway/routers/transcribe.py`、`client/src/features/classroom/utils/asrTranscriber.ts` | 混说样本英文术语不被音译错字；本地不支持时自动走云端且提示（本地优先优雅降级） | L |
| P1-6 | 轻量内容类型感知（UX-A） | 技能学习场景需求：识别策略因内容类型而异 | 规则版分类器：窗口标题关键词（PS/剪辑/代码工具等）+ 转写术语规则（"点击/拖到/设置为/参数"）→ 课程 / 软件技能 / 手法技巧 / 讲座；分类驱动采样参数（技能类提高采样频率）与产物形态（步骤化 vs 结构化，P2-7） | `client/src/features/classroom/utils/`（新增 `contentClassifier.ts`）、`client/src/features/classroom/hooks/useClassroomEvents.ts`、`client/src/lib/capture/smartSampler.ts` | 分类准确率 ≥80%（规则版）；分类结果驱动采样参数生效 | M |
| P1-7 | 指令句补帧（UX-B） | 技能场景核心：转写指令句出现时强制补抓操作瞬间 | 转写 final 文本匹配指令模式（"点击/拖到/设置为/选择/打开"）→ 触发一次立即截图（绕过定时采样）；与 `crossFusion` 时间窗联动 | `client/src/features/classroom/hooks/useClassroomEvents.ts`、`client/src/lib/capture/captureManager.ts` | 操作瞬间捕捉率提升可量化（对比无补帧）；补帧不显著增加成本 | M |
| P1-8 | 漏捕检测 + 手动补截（UX-D） | 转写提到操作但画面未捕捉 → 用户信任流失；竞品无此机制（熵减差异化） | ① 漏捕检测：指令句（P1-7）出现后 N 秒内无新关键帧 → 提示「这一步画面可能没捕捉到」；② 快捷键手动截图（预设键）插入时间线；③ 手动截图进入关键帧流水线（复用既有存储） | `client/src/features/classroom/hooks/useClassroomEvents.ts`、`client/src/features/classroom/components/`（提示条）、`client/src/lib/capture/captureManager.ts` | 漏捕提示率与手动补截可用；手动截图时间线可见 | M |
| P1-9 | 实时截图流同屏（UX-F） | 识别过程可见性：边识别边显示最近关键帧 | 会话视图增加最近关键帧缩略流（最近 6 帧，复用 `smartBundle.keyframes`）；与实时字幕同屏 | `client/src/features/classroom/components/UnifiedTimeline.tsx`、`client/src/features/classroom/pages/ClassroomPage.tsx` | 识别过程可见；无性能影响（缩略图缓存） | S |

**P1 依赖**：P1-1 依赖 P0-6 预留接口与 P0-1 基线；P1-2 依赖 P1-6（视觉通道）但可先基于已有 concepts 落地；P1-3 依赖 P0-3（置信度标记）；P1-6/P1-7/P1-8 为技能场景前奏，P1-9 独立；P1-4 依赖 P1-6（单教师跳过）；P1-5 独立（spike 先行）。

---

## 四、P2：差异化（季度级）

> 目标：视觉识别真正离线可用 + 技能场景完整能力（步骤化笔记）+ 本地引擎差异化。涉及 native/ONNX 依赖与打包配置，单独排期。

| 编号 | 优化项 | 动机/对标 | 技术方案要点 | 涉及文件 | 验收标准 | 工作量 |
|---|---|---|---|---|---|---|
| P2-1 | 本地 OCR（RapidOCR） | 最大结构性缺口：无本地 OCR，视觉离线不可用；市场推荐 RapidOCR（PP-OCRv5/ONNX） | ① 引入 rapidocr onnxruntime 推理（主进程 utilityProcess worker）；② fine 路径接入本地 OCR（`VisionWorker` 增加本地优先分支：本地 OCR 出 text/formulas 草稿 → 云端 VLM 仅作语义增强/兜底）；③ 模型分发（electron-builder extraResources）+ 模型管理 UI（扩展 `AsrModelPrompt`） | `client/electron/ai/local-ocr/`（新增）、`client/src/lib/ai/visionWorker.ts`、`client/electron-builder.yml`、`.github/workflows/`（额外审查） | 离线识别可用率 100%；OCR 文本准确率对比基线（P0-1）；打包产物可运行 | L |
| P2-2 | 公式引擎 | 现状纯 VLM prompt；市场：手写板书 → UniMERNet，印刷 → PP-FormulaNet | ① 本地公式识别引擎（UniMERNet 优先，onnx 导出）；② 先版面定位公式框再识别（P2-3 联动）；③ 公式结果与 VLM 输出交叉校验（高置信度胜出） | `client/electron/ai/local-formula/`（新增）、`client/src/lib/capture/tipTapNodeBuilder.ts` | 印刷公式识别准确率 ≥95%（测试集）；手写板书公式可用；离线可用 | L |
| P2-3 | 版面解析（PP-StructureV3） | 结构化 PPT/界面页面：标题/正文/图表/公式分块；技能场景参数面板定位基础 | ① PP-StructureV3 版面检测（onnx）；② 输出分块结构注入 `VisionWorker` 结构化字段（替换 VLM prompt 的部分职责）；③ 为 P2-6 区域监测提供版面坐标 | `client/electron/ai/local-layout/`（新增）、`client/src/lib/capture/captureTypes.ts` | 分块正确率 ≥85%（测试集）；离线可用 | L |
| P2-4 | 本地小 VLM 增强 + 采集期时间轴对齐 | 市场：「专用 OCR 打底 + VLM 增强」；采集期对齐（抓屏时间戳 + ASR 句级时间戳）比事后检索可靠 | ① 本地小 VLM（Qwen2.5-VL-7B 量化，可选下载）仅对关键帧做语义增强（要点/概念/图表解读），云端 VLM 降级为可选；② 采集期对齐：截图带精确时间戳、ASR final 带句级时间戳，`crossFusion` 窗口对齐升级为时间戳精确匹配 | `client/electron/ai/local-vlm/`（新增）、`client/src/lib/capture/crossFusion.ts`、`client/src/lib/capture/smartSampler.ts` | 离线语义增强可用；时间轴对齐误差 <1s；VLM 未下载时自动降级 | L |
| P2-5 | 视觉增强内容分类（UX-A 升级） | 规则版（P1-6）升级为 VLM 分类器 | 本地/云端 VLM 对关键帧分类（课程/软件技能/手法/讲座），替换规则版；分类置信度输出 | `client/src/features/classroom/utils/contentClassifier.ts`、`client/electron/ai/local-vlm/` | 分类准确率 ≥90%；与 P1-6 规则版对比可量化 | M |
| P2-6 | 区域化监测 + 输入事件触发（UX-B 升级） | 技能场景最痛：参数面板数值变化自动记录（"曝光+0.5"）；操作瞬间捕捉 | ① 区域化 OCR 监测：版面（P2-3）定位固定参数面板区域，定时 OCR 数值变化 → 记录参数变更（时间戳+前后值）；② 输入事件触发截图：native 模块监听系统鼠标点击/键盘（需安全评审，无感采集约束下保守实现：仅高频变化检测替代，或用户授权后启用） | `client/electron/ai/local-ocr/`、`client/src/lib/capture/smartSampler.ts`、`client/native/`（评估） | 参数变化自动入笔记（"曝光+0.5"形态）；输入事件触发可用性经安全评审；无授权时不启用 | L |
| P2-7 | 步骤化笔记（UX-C） | 技能场景产物形态革命：步骤卡片流 + 缩略图墙 + 双栏对照 | ① 步骤边界检测：大变化帧（界面切换，changeScore ≥0.6）+ 指令句（P1-7）→ 新步骤；② 步骤卡片：截图 + 操作说明（OCR/转写指令句提炼）+ 参数变更（P2-6）+ 时间戳；③ 缩略图墙：一屏浏览全部步骤，点击跳转视频对应时刻；④ 双栏对照：左步骤卡、右对应转写 | `client/src/features/classroom/components/`（新增 `StepFlowView.tsx`、`StepCard.tsx`）、`client/src/lib/capture/stepExtractor.ts`（新增）、`client/src/lib/storage/captureStore.ts` | 一节课步骤卡片完整可跳转；步骤边界准确率 ≥80%（评估集）；产物可插入笔记/导出 | L |
| P2-8 | 步骤 → 复习联动（UX-E） | 费曼式主动回忆：看截图回忆操作；步骤闪卡；checklist | ① 练习模式：隐藏步骤说明，看截图回忆操作，翻卡对照；② 步骤闪卡：参数设置/快捷键 → 闪卡（复用 `flashcardHandler.ts`）；③ "跟着做" checklist：步骤转 checklist 边看边做 | `client/electron/ai/handlers/flashcardHandler.ts`、`client/src/features/classroom/components/StepFlowView.tsx` | 步骤→闪卡转化 ≥90%；练习模式可用；checklist 可勾选 | M |

**P2 依赖**：P2-1/P2-2/P2-3 为本地引擎三件套，可并行但共享模型分发基建；P2-4 依赖 P2-1（OCR 打底）；P2-5 依赖 P2-4；P2-6 依赖 P2-3（版面定位）；P2-7 依赖 P1-6/P1-7 + P2-6；P2-8 依赖 P2-7。全部涉及 native/ONNX 依赖与打包配置（`electron-builder.yml`、workflows 需额外审查），建议独立排期、单独验证。

---

## 五、全景依赖与排期建议

```
P0（1-2 周）                    P1（1-2 月）                        P2（季度级）
──────────────────────          ──────────────────────            ──────────────────────
P0-1 评估基线 ──┐
P0-2 VAD Silero ─┤              P1-1 两遍重打分 ──────────────────→ P2-4 本地VLM+时间轴对齐
P0-3 置信度 ────┼──(质量基建)──→ P1-3 修正回写 ──┐
P0-4 重复修复 ──┤               P1-2 动态热词 ────┼──(技能场景)──→ P2-6 区域监测+输入触发
P0-5 CPU 优化 ──┘               P1-6 内容分类 ────┼────────────→ P2-5 VLM分类
P0-6 准确率即时 ───────────────→ P1-7 指令补帧 ───┴────────────→ P2-7 步骤化笔记 → P2-8 复习联动
P0-7 统计面板                   P1-8 漏捕检测 ────────────────────┘
                                P1-9 实时截图流
                                P1-4 说话人分离（依赖 P1-6）
                                P1-5 中英混说（独立 spike）
                                                        P2-1 本地OCR ─┬─→ P2-2 公式引擎
                                                        P2-3 版面解析 ─┘
```

- **P0** 全部为客户端改动，可并行；P0-4/P0-5/P0-6 建议合并为一个「离线 ASR 体验修复」PR。
- **P1** 按「质量线（P1-1/2/3）→ 技能线（P1-6/7/8）→ 体验线（P1-4/5/9）」三个可验证里程碑推进。
- **P2** 涉及 `.github/workflows/` 与 `electron-builder.yml`（AGENTS.md 标注需额外审查），单独排期；本地引擎三件套（P2-1/2/3）共享模型分发基建，建议同批。

---

## 六、成功度量

落地后以下可观测指标作为验收与回归基准（括号内为采集方式）：

| 指标 | 定义 | 目标 | 采集方式 |
|---|---|---|---|
| **转写 CER** | 课堂/技能语料字错率 | P0 出基线；P1-1 后相对下降 ≥10% | P0-1 评测脚本 |
| **热词命中率** | 课程术语在转写中的正确出现率 | P0-6 ≥80%；P1-2 进一步提升 | P0-1 评测脚本 + 会话统计 |
| **相邻 final 重复率** | 流式转写相邻段落内容重叠比例 | P0-4 后 <0.5% | 会话日志分析 |
| **离线会话 CPU 峰值** | 本地 ASR 采集会话主进程 CPU | P0-5 后 ≤单核等效（下降 ≥50%） | Electron 进程采样 |
| **离线识别可用率** | 无网条件下识别（ASR+视觉）成功率 | P2 后 100%（ASR 已达标，视觉待 P2-1） | 离线会话回归 |
| **操作瞬间捕捉率** | 指令句对应画面的捕获比例 | P1-7/P2-6 后可量化提升 | 会话对照实验 |
| **步骤边界准确率** | 步骤化笔记步骤切分正确率 | P2-7 ≥80% | 评估集标注 |
| **内容分类准确率** | 课程/技能/手法/讲座分类 | P1-6 ≥80%；P2-5 ≥90% | 分类评估集 |
| **置信度标记覆盖率** | 低置信度内容被标记的比例 | P0-3 后 100% | 单测 + 手工回归 |

---

## 七、风险与注意

1. **准确率口径**：不对标厂商 98% 宣传口径；以自建语料 CER + 热词命中率为验收基线（市场共识：真实课堂 CER 5-20% 属正常）。
2. **本地引擎依赖**：RapidOCR/UniMERNet/Silero 均为 ONNX 模型，需纳入 electron-builder extraResources；模型体积 300-500MB（int8/GGUF 可降），需模型管理 UI 与增量下载。
3. **P2-6 输入事件触发**：系统级输入监听涉及隐私与安全，无感采集约束下必须保守实现（默认关闭，用户授权后启用），需单独安全评审。
4. **P1-4 说话人分离**：流式 diarization 仍实验性，勿上生产；仅离线后处理 + 手动兜底（市场共识）。
5. **P1-5 中英混说**：本地模型选型需先 spike（sherpa-onnx 对 FunASR 模型格式兼容性不确定），失败则云端混说参数 + 本地提示降级。
6. **P0-5 CPU 优化**：线程数下调与 decode 节流可能引入识别延迟，须以 P0-1 基线回归确认质量不降。
7. **SenseVoice 重打分**：`modelManager.ts` 的 `cleanupOldModels` 当前会清理 SenseVoice 文件，P1-1 必须改为保留并纳入模型管理。
8. **既有已落地能力不回归**：P0 止血（错误分类/降级提示/启动记忆/健康检查/应用内确认/ASR 丢弃提示）、热词 P1-3、口语书面化、真流式 ASR 均为既有能力，本方案为增量叠加。

---

## 附：依据材料

- 审验报告：`docs/Foresight/classroom-recognition-maturity-audit.md`
- 市场调研：`docs/Foresight/ocr-vision-market-2025-2026.md`、`docs/Foresight/asr-market-2025-2026.md`、`docs/research/transcription-competitor-analysis-2026.md`
- 既有路线图：`docs/Foresight/classroom-assistant-optimization-roadmap.md`（P1-1 问答、P1-2 时间轴等课堂整体项不在本方案范围，识别链路聚焦）
- 已知 bug 修复记录：`docs/knowledge/bugs/2026-08-classroom-asr-file-protocol-worklet-load-failure.md`、`docs/knowledge/bugs/2026-07-classroom-capture-asr-hallucination-json-leak.md`
