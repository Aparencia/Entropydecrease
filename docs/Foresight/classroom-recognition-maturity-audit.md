# 课堂助手识别功能市场成熟度审验报告

> 编制日期：2026-08-16
> 审验对象：熵减课堂助手（回声定位）识别链路，代码范围 `client/src/features/classroom/`、`client/src/lib/capture/`、`client/electron/ai/local-asr/`、`server/ai-gateway/routers/`（vision.py / transcribe.py）
> 市场基准：三份 2026 调研底稿（`docs/Foresight/ocr-vision-market-2025-2026.md`、`docs/Foresight/asr-market-2025-2026.md`、`docs/research/transcription-competitor-analysis-2026.md`）+ 仓库既有竞品分析（`docs/Foresight/classroom-assistant-competitive-analysis.md`，2026-08）
> 配套方案：《课堂助手识别功能升级设计》（`docs/superpowers/specs/2026-08-16-classroom-recognition-upgrade-design.md`）

---

## 一、审验范围与方法

### 1.1 识别链路五域

| 域 | 能力 | 代码位置 |
|---|---|---|
| 语音识别 ASR | 本地 sherpa-onnx 流式 / 云端转写降级链 | `client/electron/ai/local-asr/`、`server/ai-gateway/routers/transcribe.py`、`client/src/features/classroom/utils/asrTranscriber.ts` |
| 屏幕视觉识别 | 关键帧采样 / 多模态 VLM 提取（fine/smart 路径） | `client/src/lib/capture/smartSampler.ts`、`client/src/lib/ai/visionWorker.ts`、`server/ai-gateway/routers/vision.py` |
| 公式识别 | VLM prompt 输出 LaTeX / 文本正则提取 | `server/ai-gateway/chains/vision_extract_chain.py`、`client/src/lib/capture/tipTapNodeBuilder.ts` |
| 课程识别 | 窗口标题规则 / AI 首帧识别 | `client/src/features/classroom/hooks/useWindowWatcher.ts`、`client/src/lib/ai/courseDetector.ts` |
| 热词与纠错 | boost 热词 / replace 替换 / 口语书面化 | `client/src/features/classroom/utils/hotwordRuntime.ts`、`client/src/lib/capture/hotwordApply.ts`、`oralCleanup.ts` |

### 1.2 市场对标

- **产品对标**：通义听悟、讯飞听见、Otter.ai、飞书妙记、Notta、腾讯会议（识别能力机制）
- **技术对标**：开源 ASR（sherpa-onnx / FunASR / SenseVoice）、OCR（PaddleOCR / RapidOCR）、公式识别（UniMERNet / LaTeX-OCR）、VAD（Silero）、说话人分离（pyannote / CAM++）

### 1.3 评审维度

功能完备度 / 识别准确率 / 离线能力 / 工程成熟度，四维评分（1-5 星）。

---

## 二、现状盘点（代码级证据）

### 2.1 语音识别 ASR

- **本地引擎**：sherpa-onnx **zipformer-transducer 中英双语流式**模型（`SherpaAsrService.ts`），支持 `createStream(hotwords)` 热词增强；smart 路径已接线真流式（400ms 采集粒度 + partial/final 推送，`useSessionControl.ts` L149-187）
- **云端降级链**：Qwen3-ASR-Flash → GLM-ASR → fallback（`transcribe.py`），2s 块、30s 超时、重试 1 次、信号量并发 5 / 队列 20（丢弃提示已落地，P0-6）
- **VAD**：`VADMarker` 为 **RMS 能量检测**（`vadMarker.ts`），loopback 预设阈值 / mic 自适应校准，最长段 28s；非神经网络 VAD
- **后处理**：幻觉过滤 + 相邻重复压缩（`asrFilters.ts`）已落地
- **缺口**：无说话人分离；无中英混说模型（mixed→auto 仅映射）；confidence 恒 0.0 占位（`transcribe_chain.py` L101）；无两遍重打分

### 2.2 屏幕视觉识别

- **fine 路径**（`visionWorker.ts`）：截图 → IPC `ai_vision_extract` → 云端 VLM（GLM-4V-Flash / Qwen-VL-Plus）。**名为"逐帧 OCR"，实际无本地 OCR 引擎**——"本地 OCR 照常进行"（`captureGatewayProbe.ts` 注释）与实现不符
- **smart 路径**（`smartSampler.ts`）：变化检测（阈值 0.12）+ dHash 感知去重（64 位汉明 ≤5）+ 15s 定时兜底 → JPEG 1280px 压缩 → 5 帧批量多模态分析
- **缺口**：离线时视觉识别完全不可用（违背本地优先）；无版面解析（PPT 结构仅靠 VLM prompt）；无 SSIM 复核；VLM 调用成本随帧数线性增长

### 2.3 公式识别

- 纯 VLM prompt 输出 LaTeX（`vision_extract_chain.py` mode=formula），max_tokens 2048/4096
- `tipTapNodeBuilder.ts` 正则提取 `$...$` / `$$...$$` 公式
- **缺口**：无专用公式引擎（UniMERNet / LaTeX-OCR / PP-FormulaNet）；手写板书公式无专项能力

### 2.4 课程识别

- 窗口标题规则匹配（`useWindowWatcher.ts`）+ AI 首帧 `detect-course`（8s 超时，失败静默降级，`courseDetector.ts`）
- detectedBy 三态：ai / window_title / manual；课程名联动加载热词词表（`hotwordRuntime.ts`）
- **缺口**：仅首帧一次识别，课程中途切换无感知；无内容类型识别（课程 / 软件技能 / 手法技巧）

### 2.5 热词与纠错

- **热词双机制已落地**（P1-3）：boost 热词（zipformer `createStream(hotwords)` + 云端 hotwords 透传，200 字符截断）+ replace 替换（`hotwordApply.ts`），课程维度绑定，本地存储（`hotwordStore.ts`）
- **口语书面化**：规则版 `oralCleanup.ts` 已存在（离线纯规则，去语气词/句式改写）
- **缺口**：无动态热词（PPT/板书 OCR 术语自动注入）；无用户修正回写闭环（改字 → 词库 → 下次生效）

### 2.6 交叉融合

- VAD 驱动 + ±5s 时间窗融合（`crossFusion.ts`）+ Jaccard 字符集去重 + 公式语音浅层交叉验证（`fusionTextUtils.ts`）
- **缺口**：无采集期时间戳对齐（抓屏时间戳 + ASR 句级时间戳的精确对齐）；融合算法为启发式，无质量评分

---

## 三、市场基准（2026 调研核心结论）

### 3.1 ASR 技术市场（`asr-market-2025-2026.md`）

1. **本地流式 ASR 已成熟**：sherpa-onnx 是事实标准（~10.9K Star）；流式首选 Zipformer（中文），SenseVoice-Small 速度碾压（CPU 15-52× 实时）但纯中文精度低于 Paraformer；最佳实践 = 流式出部分结果 + 句末 SenseVoice/Whisper **两遍重打分**
2. **中英混说**：课堂混说选 FunASR `paraformer-bilingual-zh-en`（有流式版）；SenseVoice 支持 zh/en 混说
3. **热词偏置**：本地用 sherpa-onnx hotwords（解码期偏置）；Paraformer 系用 SeACo；**最佳实践 = 静态术语表（强 boost）+ PPT/板书 OCR 动态词（弱 boost）**
4. **说话人分离**：离线成熟（pyannote / NeMo / FunASR CAM++，DER 10-15%）；流式 diarization 仍实验性勿上生产；单教师可完全不做
5. **VAD 首选 Silero**（2MB ONNX、噪声鲁棒、原生流式）；WebRTC 太弱、energy 仅粗过滤
6. **评估口径**：厂商"98%"是干净语料宣传口径，真实课堂 CER 常见 5-20%；验收必须 CER + 热词命中率，对齐 AISHELL-1/2 + WenetSpeech + 自建课堂语料
7. **商业 API 兜底**：阿里云 Paraformer-realtime-v2 按秒计费且自带热词 + 说话人分离，集成成本最低

### 3.2 OCR/视觉技术市场（`ocr-vision-market-2025-2026.md`）

1. **中文截图 OCR**：PaddleOCR 系是开源事实标准（PP-OCRv5 超轻量 0.07B）；**推荐 RapidOCR（PP-OCRv5 转 ONNX + onnxruntime）**，规避 Paddle Inference CPU 性能回退；Windows x64 端侧部署完全可行
2. **版面解析**：PP-StructureV3（LayoutLMv3 系）性价比最高；MinerU 复杂文档口碑最好；olmOCR / Granite-Docling 为端到端选项
3. **公式识别**：印刷公式 → PaddleOCR 公式模块 / PP-FormulaNet；**手写板书 → UniMERNet 是开源首选**（训练集含手写）；先版面定位公式框再识别收益大
4. **VLM vs 专用 OCR**：**"专用 OCR 打底 + VLM 增强"是行业主流**；端到端 VLM 全量 OCR 是工程陷阱（token 成本线性爆炸 + 延迟 + 幻觉）；本地小 VLM（Qwen2.5-VL-7B 量化）可做关键帧语义增强
5. **关键帧去重**：标准流水线 = 低帧率采样 + 变化检测 + dHash 去重 + **SSIM 复核** + 带时间戳落盘
6. **时间轴融合**：工程主流是**采集期对齐**（抓屏时记时间戳 + ASR 句级时间戳），比事后 CLIP 检索可靠省成本

### 3.3 竞品识别机制（`transcription-competitor-analysis-2026.md`）

1. **识别链路共性**（Recall.ai 公开博客最完整）：采集（含内录）→ VAD 切段 → 流式 ASR（热词注入）→ 说话人分离（声纹聚类 + 标签映射）→ LLM 后处理（书面化/纪要/章节/问答；部分产品用户修正回写）
2. **热词**：转写前注入（讯飞/腾讯/Otter/Notta）+ 转写后替换（讯飞双机制闭环、用户修正回写）——讯飞最完整
3. **说话人分离**：声纹聚类全都有；飞书「重新识别」批量替换标签兜底
4. **中英混说**：通义「中英自由说」单引擎混说是国产主场
5. **截图/PPT 对齐**：通义官方 PPT 抽取；B 站开源「抽帧+OCR+去重+LLM 融合」证明可自建
6. **LLM 后处理**：全行业标配；差异在问答深度与摘要结构

---

## 四、差距矩阵（识别能力 × 竞品 × 熵减）

图例：✅ 完整 ｜ ⚠️ 部分 ｜ ❌ 缺失/明显短板

| 识别能力 | 通义听悟 | 讯飞听见 | Otter | 飞书妙记 | 腾讯会议 | **熵减（现状）** |
|---|---|---|---|---|---|---|
| 实时流式转写 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ 本地流式 zipformer |
| 中文课堂准确率 | ✅ | ✅ 宣传 98% | ⚠️ 中文弱 | ✅ | ⚠️ | ⚠️ 无重打分/动态热词；真实 CER 无基线 |
| 热词/术语定制 | ⚠️ Prompt 替代 | ✅ 双机制+回写 | ✅ 词汇表 | ⚠️ | ✅ 热词设置 | ⚠️ boost+replace 已落地，无动态注入/回写 |
| 中英混说 | ✅ 中英自由说 | ⚠️ 多语种非混说 | ❌ | ⚠️ | ⚠️ | ❌ mixed→auto 仅映射 |
| 说话人分离 | ✅ 声纹 | ⚠️ | ✅ | ✅ 可重新识别 | ✅ | ❌ 未支持 |
| 离线识别 | ❌ | ✅ 离线录音后转 | ❌ | ❌ | ❌ | ⚠️ 本地 ASR 离线可用，**视觉识别离线不可用** |
| 专用 OCR | ⚠️ PPT 抽取 | ✅ 边录边拍 | ✅ 自动幻灯片 | ❌ | ⚠️ | ❌ **无本地 OCR，fine 路径实为云端 VLM** |
| 公式识别 | ⚠️ VLM | ⚠️ | ❌ | ❌ | ❌ | ⚠️ 纯 VLM prompt，无专用引擎 |
| 口语书面化 | ✅ | ✅ 语篇规整 | ⚠️ LLM 摘要 | ⚠️ | ⚠️ | ✅ 规则版已落地 |
| 转写修正回写 | ⚠️ | ✅ 纠错学习 | ✅ | ✅ 改字同步 | ⚠️ | ❌ 转写只读 |
| 截图/转写时间轴对齐 | ✅ PPT 对齐 | ⚠️ | ✅ 逐词高亮 | ✅ 音画时间轴 | ✅ | ⚠️ 启发式融合，无采集期对齐 |
| 识别质量度量 | ⚠️ 无公开 | ✅ 送检口径 | ❌ 不公布 | ⚠️ | ⚠️ | ❌ **无 CER/命中率评估基线** |

---

## 五、成熟度评分

| 域 | 功能完备度 | 准确率 | 离线能力 | 工程成熟度 | 综合 |
|---|---|---|---|---|---|
| 语音识别 ASR | ★★★★☆ | ★★★☆☆ | ★★★★☆ | ★★★★☆ | **3.8** |
| 屏幕视觉识别 | ★★★☆☆ | ★★★☆☆ | ★★☆☆☆ | ★★★☆☆ | **2.8** |
| 公式识别 | ★★☆☆☆ | ★★☆☆☆ | ★★☆☆☆ | ★★★☆☆ | **2.3** |
| 课程识别 | ★★★☆☆ | ★★★☆☆ | ★★★★☆ | ★★★☆☆ | **3.3** |
| 热词与纠错 | ★★★★☆ | ★★★☆☆ | ★★★★☆ | ★★★★☆ | **3.8** |
| **全链路** | **★★★☆☆** | **★★★☆☆** | **★★★☆☆** | **★★★☆☆** | **3.2/5** |

**结论**：识别链路整体处于「可用但未达市场级」——低于市场成熟线（4.0）。最大短板在**视觉识别**（无本地 OCR、离线不可用）与**公式识别**（无专用引擎）；ASR 有良好底座但缺质量手段（重打分/动态热词/评估基线）。

---

## 六、UX 场景光谱分析（识别需求的本质差异）

> 头脑风暴结论：当前识别链路按「网课/知识授课」单一场景设计（定时采样 + 转写优先 + 结构化笔记），未覆盖技能学习场景。

| 场景 | 信息载体 | 言语角色 | 视觉变化 | 现状适配度 |
|---|---|---|---|---|
| 知识授课（网课/讲座） | PPT/板书 | 主体（讲解） | 慢（翻页级） | ✅ 良好 |
| 软件技能（PS/剪辑/编程） | 界面操作（按钮/参数/面板） | 指令（"点这里""调成50"） | 快而密集（点击/拖拽/数值变化） | ❌ 定时采样漏关键操作 |
| 手法技巧（化妆/拍照/手工） | 动作/手法 | 伴随讲解 | 连续动作 | ❌ 需动作时刻捕捉 |
| 混合教程（B站常见） | 讲解 + 演示交替 | 混合 | 混合 | ⚠️ 无场景自适应 |

**核心矛盾**：定时采样（15s 兜底 + 变化触发）为静态 PPT 设计；技能场景的关键信息（点击哪个按钮、参数改成多少、手法怎么动）是转瞬即逝的操作瞬间，错过即"识别不到重点"。

### UX 增强方向（A~F，已确认全纳入）

- **A 内容类型感知**：分类（课程/软件技能/手法/讲座）驱动识别参数与产物形态，自动切换零操作
- **B 操作感知捕捉**：技能类变化阈值调低 + 区域化 OCR 监测参数面板数值 + 指令句补帧（"点击/拖到/设置为"强制补抓）
- **C 步骤化笔记**：产物升级为步骤卡片流（截图+操作说明+参数+时间戳）+ 缩略图墙 + 双栏对照 + 点击跳转
- **D 识别可信度**：低置信度标记 + 一键修正（配合修正回写闭环）+ 漏捕检测与手动补截
- **E 复习内化**：步骤 → 练习模式（看截图回忆操作）/ 步骤闪卡 / checklist
- **F 识别过程可见性**：实时字幕 + 实时截图流同屏 + 识别统计（已捕捉 N 帧/M 句）

---

## 七、关键结论

### 7.1 三大结构性缺口

1. **无本地 OCR，视觉识别离线不可用**（违反"本地优先"承诺；fine 路径名不副实）
2. **无真实置信度与评估基线**（confidence=0.0 占位 / "完整度伪指标"；无 CER/热词命中率度量，无法证明改进）
3. **无识别质量闭环**（转写只读无修正回写；无两遍重打分；无动态热词）

### 7.2 三大机会

1. **动态热词闭环**（PPT/板书 OCR 术语 → 热词注入）——讯飞双机制进阶 + 熵减双通道独有的闭环机会
2. **两遍重打分**（Zipformer + SenseVoice）——sherpa-onnx 官方最佳实践，直接提升中文课堂准确率
3. **本地引擎差异化**（RapidOCR + UniMERNet + Silero VAD）——兑现本地优先叙事，与云系竞品拉开隐私/成本差距

### 7.3 离线 ASR 体验问题（用户实测反馈，代码级定位）

| 问题 | 根源 | 修复归属 |
|---|---|---|
| 识别偶发重复 | 端点规则 rule2（1.2s 静音）对中文句内停顿误断句；端点命中后块内剩余样本丢弃；跨 final 无重叠去重 | P0-4 |
| 识别不准确 | 无两遍重打分；VAD 为 RMS；无动态热词；非 16k 采样率仅 warn 不阻断 | P0-6 / P1-1 / P1-2 |
| CPU 100% | `SherpaAsrService.ts` L128-131 线程数默认 cpuCount-1（4 核=3、8 核=7）；主进程同步 `while(isReady) decode` 无节流 | P0-5 |

---

## 附：依据材料

- 三份市场调研底稿：`docs/Foresight/ocr-vision-market-2025-2026.md`、`docs/Foresight/asr-market-2025-2026.md`、`docs/research/transcription-competitor-analysis-2026.md`
- 仓库既有竞品分析：`docs/Foresight/classroom-assistant-competitive-analysis.md`、`docs/Foresight/classroom-assistant-optimization-roadmap.md`
- 代码证据：见第二章各域引用的文件路径
