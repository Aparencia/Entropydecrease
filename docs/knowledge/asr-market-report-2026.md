# 语音识别（ASR）技术与市场调研报告（2025–2026）

> 调研人：ASR 技术市场调研员（web 检索）｜调研时点：2026 年初（信息窗口 2025.01 – 2026.02）
> 方法：以 `web_search` 检索官方文档 / 论文 / 权威博客 / 社区实测，结论均附来源 URL。
> 声明：价格为检索时点快照，商业 API 价格随时变动，落地前务必以官网最新计费页为准；社区博客的“实测准确率”为单点样本，仅供横向参考，不能替代自建评测。

---

## 摘要（TL;DR）

- **本地流式 ASR 已成熟**：sherpa-onnx 是端侧/桌面部署事实标准（~10.9K Star，持续发版），流式 Zipformer（中文）+ 两遍解码（流式出实时结果、句末用 SenseVoice/Whisper 离线重打分）是 2026 年性价比最高的本地方案。
- **中文课堂场景**：纯中文用流式 Zipformer/Paraformer；**中英混说用 FunASR `paraformer-bilingual-zh-en` 系列**（有流式版）；SenseVoice-Small 胜在速度与多语言，纯中文精度不及 Paraformer-large。
- **热词偏置是课堂术语识别的关键**：sherpa-onnx 官方支持 hotwords（transducer 系模型，上下文图/音素级偏置），阿里 SeACo-Paraformer 是 Paraformer 系热词标准做法，Whisper 靠 prompt 注入（initial_prompt）兜底。
- **说话人分离**：pyannote / NeMo / CAM++（FunASR）离线方案成熟（DER 约 10–15%）；**流式 diarization 仍不成熟**；2–3 人课堂建议离线后处理或干脆不做（单教师讲授可不做）。
- **VAD**：Silero VAD 是流式/本地首选（2MB ONNX、噪声鲁棒）；WebRTC VAD 太弱，energy-based 仅适合安静近麦。
- **准确率口径**：厂商“98%”是标准普通话/安静语料宣传口径；真实课堂/会议场景中文 CER 普遍在 5–20%，评估必须用自建语料 + AISHELL/WenetSpeech 对齐。
- **云端 API**：国内（讯飞/阿里/腾讯/百度）中文最优且便宜（按秒/分钟计费，小时级成本十元内）；海外 Deepgram/AssemblyAI 按小时计费（$0.15–0.37/h 量级），中文可用但课堂术语弱。
- **推荐组合（中文课堂·弱网离线）**：`Silero VAD → sherpa-onnx 流式双语 Paraformer/Zipformer（热词表）→ 句末 SenseVoice-Small 两遍重打分`，全程本地、CPU 可跑、离线可用；在线时可叠加阿里/讯飞云端 API 做兜底精修。

---

## 1. 本地/端侧流式 ASR 模型现状（2025–2026）

### 1.1 sherpa-onnx 生态概览

[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)（k2-fsa，Apache-2.0）是 2025–2026 年端侧/桌面 ASR 部署的事实标准：统一 ONNX Runtime 推理、支持 Android/iOS/macOS/Windows/Linux/嵌入式，社区约 10.9K Star，持续发版（如 [v1.12.18](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.18)）。支持的模型族与架构见 [DeepWiki 支持矩阵](https://deepwiki.com/k2-fsa/sherpa-onnx/1.2-supported-platforms-and-architectures)。

| 模型族 | 类型 | 流式 | 中文能力 | 资源占用 | 典型用途 |
|---|---|---|---|---|---|
| **Zipformer（icefall 中文模型）** | Transducer / CTC | ✅ 原生流式 | 优（普通话标准基准 CER 低） | 中等（int8 后约 100–300MB，CPU RTF < 0.1） | 本地实时字幕/听写，sherpa 首选流式 |
| **Paraformer（FunASR 导出）** | 自回归→非自回归（离线） | ❌ 离线（另有 streaming 变体） | 优（中文开源榜首） | 中等（~220M） | 高精度离线转写 |
| **SenseVoice-Small** | 离线（非流式） | ❌ | 良（多语言 zh/en/yue/ja/ko，附带情感/事件标签） | 小（234M，GGUF 后更小） | 快转、多语言、两遍解码重打分 |
| **Whisper（small/base/medium/distil）** | Encoder-Decoder | ❌ 原生不支持，需滑窗/两遍 | 良（多语言通用，中文弱于专用模型） | 大（medium 起 CPU 吃力） | 通用离线、多语言兜底 |
| **Moonshine** | Encoder-Decoder | ❌ | 中（侧重英语） | 极小（手机可跑） | 超低功耗端侧 |
| **NeMo Transducer** | Transducer | ✅（PR #3077 支持 hotwords） | 中 | 中等 | 已有 NeMo 资产的团队 |

来源：
- https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.18
- https://deepwiki.com/k2-fsa/sherpa-onnx/1.2-supported-platforms-and-architectures
- https://jishuzhan.net/article/2036383957487517698 （“把 Whisper、Moonshine、SenseVoice 装进手机：sherpa-onnx 离线部署框架”）
- https://deepwiki.com/k2-fsa/sherpa/3.1-asr-models

### 1.2 关键结论

1. **流式首选 Zipformer**：sherpa-onnx 的中文流式体验最佳路径是 icefall 训练的中文 Zipformer（Transducer），延迟数百 ms 内出部分结果；社区还出现了双语 `x-asr-zh-en-streaming-zipformer2` 的 GGUF 量化版，说明双语流式需求在 2025 年已被覆盖（[HF 模型卡](https://huggingface.co/api/resolve-cache/models/Luigi/x-asr-zh-en-streaming-zipformer2-gguf/566f11eb9a8f9b97f6cccd3b51bc1fd528d66475/README.md)）。
2. **SenseVoice vs Paraformer（中文课堂）**：社区多篇实测（如 [Paraformer-Large vs SenseVoice-Small 测评](https://blog.csdn.net/weixin_33562004/article/details/156975108)、[中文会议音频实测讨论](https://github.com/modelscope/FunASR/discussions/2947)）的一致结论：**纯中文精度 Paraformer 系 > SenseVoice**；SenseVoice 的杀手锏是**速度**（[llama.cpp/GGUF CPU 基准](https://github.com/QwenAudio/SenseVoice/blob/main/runtime/llama.cpp/BENCHMARKS.md)：约 15–50× 实时，[Mac 实测 52× 实时](https://whispernotes.app/zh-Hant/blog/sensevoice-fastest-cjk-transcription)）与中英粤日韩多语言 + 情感/事件标签。课堂场景：**精度优先选 Paraformer/Zipformer 流式；速度/低成本优先或作为重打分模型选 SenseVoice-Small**。
3. **两遍解码（two-pass）是本地流式最佳实践**：流式模型出即时部分结果，句末用 SenseVoice/Whisper 等离线模型重打分整句，兼顾实时性与整句精度（[sherpa-onnx two-pass 官方示例](https://github.com/k2-fsa/sherpa-onnx/blob/b74c4dfe/python-api-examples/two-pass-speech-recognition-from-microphone.py)）。
4. **faster-whisper / whisper.cpp 的流式可行性**：两者本身都是**离线模型加速器**，不原生流式。faster-whisper（CTranslate2）比 OpenAI Whisper 快约 4 倍，可配合 VAD + 滑窗/增量分段做成“准实时”（参考 [实时字幕实现](https://github.com/nullpox7/realtime-whisper-subtitles-optimized)、[Faster-Whisper 实时转文本解析](https://cloud.baidu.com/article/3665296)）；whisper.cpp 有 `stream` 示例（重叠窗口伪流式），但**稳定性和延迟都不如原生流式模型**。结论：要真流式，别用 Whisper 系，用 Zipformer/Paraformer 流式 + Whisper/SenseVoice 兜底重打分。
5. **端侧部署成本**：sherpa-onnx int8 量化 + NPU 加速参数在嵌入式/NPU 上可行（[量化与 NPU 加速指南](https://blog.hotdry.top/posts/2025/10/26/edge-device-offline-speech-processing-sherpa-onnx-quantization-npu/)）；[VoicePing 离线基准](https://voiceping.net/zh/blog/research-offline-speech-transcription-benchmark/) 实测 16 个模型在 Android/iOS/macOS/Windows 的表现，中文场景下 SenseVoice/Zipformer 系在“速度×精度”综合上领先。桌面端（本仓库目标平台）CPU 即可流畅跑流式中文模型。

---

## 2. 中英混说 / 代码切换（Code-Switching）

### 2.1 市场主流方案对比

| 方案 | 类型 | 中英混说能力 | 流式 | 备注 |
|---|---|---|---|---|
| **FunASR `paraformer-bilingual-zh-en`**（离线 + streaming） | 专用双语模型 | 强（专为中英混说训练） | ✅ 有流式版 | 中文课堂混说首选；[模型卡](https://huggingface.co/funasr/paraformer-zh-streaming) 与 FunASR 工具链 |
| **SenseVoice-Small** | 多语言通用 | 良（zh/en 混说可识别） | ❌ 离线 | 附带情感/事件标签，快 |
| **Whisper（large-v3 等）** | 多语言通用 | 良（多语训练，混说整体可听写） | ❌ | 中文占主体的混说不如专用双语模型；长英文片段 OK |
| **阿里云 Paraformer-v2 / SeACo 系列** | 云端/开源 | 强（SeACo 论文即双语+热词） | 云端流式 | 商用级混说+热词能力 |
| **Qwen3-ASR（0.6B–8B，2025 开源）** | 大模型 ASR | 强（LM 架构、多语） | FunASR 运行时支持 | 新势力，效果接近/超过 Whisper-large 中文；资源要求较高 |

来源：
- https://huggingface.co/funasr/paraformer-zh-streaming
- https://browse.arxiv.org/abs/2308.03266 （SeACo-Paraformer：非自回归 + 热词 + 混说）
- https://blog.csdn.net/weixin_42561464/article/details/156960671 （Seaco Paraformer 中英混说实测）
- https://blog.csdn.net/weixin_42588672/article/details/157422772 （多语言场景表现测试）
- https://developer.aliyun.com/article/1693370 （通义百聆语音双子星开源）
- https://blog.csdn.net/weixin_31974443/article/details/157455740 （Qwen3-ASR-1.7B vs Whisper-large-v3 vs SenseVoice-Small）

### 2.2 关键结论

1. **课堂“中英混说”要选专用双语模型**：中文课堂的混说形态是“中文为主、夹英文术语/人名/公式念法”，`paraformer-bilingual-zh-en`（离线 + 流式）为此设计，社区实测中英混说场景优于纯中文模型和 Whisper（[实测](https://blog.csdn.net/weixin_42561464/article/details/156960671)）。
2. **实现机制**：双语模型在训练数据中混入中英代码切换语料，输出层覆盖中英字/词表；Paraformer 系为“非自回归 + 上下文偏置”，混说与热词天然结合（SeACo 论文）；Whisper 依赖大规模多语预训练“硬记”混说，但对少见术语/学科词不稳。
3. **工程上的兜底**：即使主模型是纯中文流式，也建议在热词表中注入英文术语（见 §3），并保留 SenseVoice-Small（zh/en 混说）做两遍重打分候选。
4. 2025 年新变量：阿里 [通义百聆语音双子星](https://developer.aliyun.com/article/1693370)（9 语言/18 方言，合成+识别）与 [Qwen3-ASR](https://blog.csdn.net/weixin_31974443/article/details/157455740) 系列开源，大模型 ASR 对混说和噪声的鲁棒性显著提升，代价是资源占用（至少 1.7B 级别），适合在线/服务器端而非弱网端侧。

---

## 3. 热词 / 上下文偏置（Contextual Biasing / Hotword Boosting）

### 3.1 主流实现机制对比

| 机制 | 代表实现 | 原理 | 适用模型 | 课堂场景适配 |
|---|---|---|---|---|
| **上下文图偏置（Context Graph）** | **sherpa-onnx hotwords**（[官方文档](https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html)、[Issue #735](https://github.com/k2-fsa/sherpa-onnx/issues/735)） | 由热词表编译成上下文图，解码（beam search）时对含热词的路径加权（transducer 系），可按词设 boost 分数 | Zipformer / Transducer（流式+离线）；[NeMo transducer 也已支持（PR #3077）](https://github.com/k2-fsa/sherpa-onnx/pull/3077) | ✅ 首选：课堂术语表 → hotwords 文件，流式即可生效 |
| **上下文感知注意力（SeACo）** | **SeACo-Paraformer**（[论文 2308.03266](https://huggingface.co/papers/2308.03266)）；阿里云 Paraformer 热词接口（[热词管理](https://help.aliyun.com/en/model-studio/paraformer-asr-phrase-manager)、[提升准确率](https://www.alibabacloud.com/help/zh/model-studio/improve-asr-accuracy)） | 热词嵌入与声学编码做注意力融合，非自回归解码直接偏置 | Paraformer 系（离线/流式） | ✅ 官方开源 + 云端 API 均有，社区称课堂术语命中提升明显 |
| **Prompt 注入** | Whisper `initial_prompt`；CB-Whisper（[LREC 2024](https://aclanthology.org/2024.lrec-main.262/)、[论文 2309.09552](https://ar5iv.labs.arxiv.org/html/2309.09552)） | 把热词拼进 prompt 引导解码 | Whisper 系 | ⚠️ 有效但脆：受 prompt 长度/语言影响，可能引入幻觉重复 |
| **WFST 偏置（Kaldi 系）** | 经典 Kaldi 上下文 FST；部分商用引擎 | 解码图中加入热词路径 | HMM/DNN + WFST | 传统方案，维护成本高，新项目少见 |
| **商用热词接口** | 讯飞（听写/实时转写热词、个性化词汇）、阿里云（热词表/短语管理） | 云端词表下发参与解码 | 云端 API | ✅ 云端兜底时直接用厂商接口 |

### 3.2 关键结论

1. **本地流式热词 = sherpa-onnx hotwords**：对 Zipformer 流式模型，热词在解码期生效（非后处理），支持按词设 boost 权重，是最贴近课堂实时场景的本地机制（[文档](https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html)）。
2. **Paraformer 系热词 = SeACo**：模型原生支持热词定制，阿里云将同一技术开放为云端 API 的热词管理（[phrase manager](https://help.aliyun.com/en/model-studio/paraformer-asr-phrase-manager)），FunASR 镜像内置 SeACo 模型，课堂术语命中率提升显著（[热词详解](https://blog.csdn.net/weixin_35987118/article/details/160001469)、[输入规范](https://blog.csdn.net/weixin_35706255/article/details/157217833)）。
3. **Whisper prompt 注入仅作兜底**：`initial_prompt` 简单有效，但长热词表会劣化；论文级方案（CB-Whisper）需微调，成本高。
4. **课堂术语最佳实践**：把课程术语表（学科专有名词、英文缩写、公式/符号念法、教师姓名、教材关键词）做成**两级热词**：高频固定术语（强 boost）＋动态上下文（本节 PPT/板书 OCR 出的词，弱 boost，随课程切换）；本地用 sherpa hotwords/SeACo，在线叠加厂商热词接口。
5. **讯飞/阿里商业机制**：均为云端词表参与解码的偏置方案；阿里公开了 SeACo 开源实现（可私有化），讯飞以开放平台热词/个性化词库形式提供——私有化程度阿里占优。

---

## 4. 说话人分离（Speaker Diarization）

### 4.1 主流方案对比（2025–2026）

| 方案 | 类型 | 代表版本 | 准确率量级（DER） | 成本/资源 | 流式 |
|---|---|---|---|---|---|
| **pyannote.audio** | 开源（社区模型） | 3.1 / [pyannote-community 社区模型（2025，宽松许可）](https://huggingface.co/pyannote-community/speaker-diarization-community-1) | 会议场景 DER 约 10–15%（[评测](https://huggingface.co/papers/2509.26177)） | 免费；CPU 可跑（慢） | ❌ 离线为主 |
| **NVIDIA NeMo** | 开源（TitaNet 嵌入 + 聚类） | NeMo 2.x | 与 pyannote 同档（不同数据集互有胜负） | 免费；GPU 更佳 | ❌ |
| **FunASR CAM++** | 开源（阿里） | CAM++ 说话人分离 | 中文会议实测与 pyannote 相当 | 免费；CPU 可跑 | ❌ |
| **阿里云 Paraformer（云端）** | 商用 | 实时/离线转写附带说话人分离 | 商用级 | 按音频时长计费 | ✅ 云端流式 |
| **讯飞（云端）** | 商用 | 讯飞听见 / 实时转写 | 商用级（营销口径高） | 按时长/套餐 | ✅ |
| **流式 diarization 探索** | 开源/研究 | SCDiar（[speaker change detection + ASR](https://ieeexplore.ieee.org/abstract/document/10888692)）、[WhisperLiveKit](https://github.com/Decentralised-AI/WhisperLiveKit)、[LiveKit 系](https://github.com/Sirisha05n4/LiveKit) | 尚不稳定 | 免费 | ✅（实验性） |

来源：
- https://huggingface.co/pyannote-community/speaker-diarization-community-1
- https://huggingface.co/papers/2509.26177 （Benchmarking Diarization Models）
- https://voiceping.net/zh/blog/research-diarization-2025/ （说话人分离模型实战对比评估）
- https://github.com/zxkane/audio-transcriber （FunASR Paraformer/SenseVoice + CAM++ diarization 全链路）
- https://ieeexplore.ieee.org/abstract/document/10888692 （SCDiar 流式分离）
- https://eric.ed.gov/?id=ED675664 （嘈杂课堂多阶段说话人分离研究）

### 4.2 关键结论

1. **离线分离已成熟**：pyannote / NeMo / CAM++ 三选一即可，会议级 DER 约 10–15%；中文场景 FunASR CAM++ 与阿里生态集成最顺（[全链路示例](https://github.com/zxkane/audio-transcriber)）。
2. **流式 diarization 仍不成熟**：2025–2026 的主流做法是“在线聚类 + speaker change detection”（如 SCDiar、WhisperLiveKit），准确率与稳定性明显逊于离线整体聚类；**不要在生产课堂流式管线里依赖流式分离**。
3. **课堂 2–3 人场景性价比**：单教师讲授 → **不做 diarization**（省延迟/算力，还能避免误分）；需要“师生互动记录”时，用离线后处理（句段 + 分离）性价比最高——免费开源方案足够，无需付费 API。嘈杂课堂下 DER 会恶化（参考 [课堂噪声研究](https://eric.ed.gov/?id=ED675664)），需先降噪。
4. 若选云端：阿里云 Paraformer 流式接口自带说话人分离，比单独接 diarization 服务更省事（§7）。

---

## 5. VAD（语音活动检测）

### 5.1 主流方案对比

| 方案 | 类型 | 准确率/鲁棒性 | 资源 | 流式 | 结论 |
|---|---|---|---|---|---|
| **Silero VAD** | 神经（ONNX） | 高：噪声鲁棒、低误触发（公开评测显著优于 WebRTC） | ~2MB，CPU 实时 | ✅ 原生流式（chunk 级） | **本地/流式首选** |
| **WebRTC VAD** | 传统统计（GMM） | 中低：安静环境可用，噪声/音乐下漏检误检多 | 极小 | ✅ | 仅适合极简轻量场景 |
| **Energy/Zero-crossing** | 传统规则 | 低：仅安静近麦有效 | 极小 | ✅ | 只做粗过滤，需配合神经 VAD |
| **pyannote VAD / 其他神经 VAD** | 神经 | 高（分割级） | 中 | 一般 | 与 diarization 管线搭配用 |

来源：
- https://picovoice.ai/blog/best-voice-activity-detection-vad/ （2026 年 Cobra vs Silero vs WebRTC VAD 选型）
- https://arxiv.org/pdf/2402.09797 （VAD 相关研究）
- https://theneuralbase.com/conversational-ai/learn/intermediate/voice-activity-detection/
- https://arxiv-org.ezproxy.obspm.fr/html/2506.08846v3 （Aphasia 场景 Silero/Pyannote VAD 对比评测）
- https://cloud.baidu.com/article/4348382 （Python VAD 工具包解析）

### 5.2 关键结论

1. **流式 VAD 最佳实践 = Silero VAD**：ONNX 2MB、16k 单声道、逐 chunk（如 32ms/512 采样）输出语音概率，内置“min silence / max speech”策略，**课堂噪声/翻页/投影风扇下鲁棒性明显优于 WebRTC**（[选型文](https://picovoice.ai/blog/best-voice-activity-detection-vad/)）。
2. 不建议单独用 energy-based 或 WebRTC 作为课堂主 VAD；如算力极度受限，可用 energy 粗过滤 + Silero 精判的双级结构。
3. 与 ASR 管线配合：VAD 分段 → 段尾触发“两遍重打分”，这是本地流式低延迟的关键（避免 ASR 自己端点检测的漂移）。

---

## 6. 语音识别准确率评估口径

### 6.1 各主流口径与“98%”的真相

| 口径 | 含义 | 典型数值 | 说明 |
|---|---|---|---|
| 厂商宣传（讯飞 98%+/98.7%([来源](https://www.xfyun.cn:443/site/3348.html))、阿里“工业级”） | 标准普通话、安静、近麦、读稿语料上的识别 | 97–99% | **营销口径，不可直接用于课堂** |
| 标准基准 CER（AISHELL-1/2([FunASR benchmark](https://modelscope.github.io/FunASR/benchmark.html)、[CER 明细](https://raw.githubusercontent.com/modelscope/FunASR/main/benchmarks/benchmark_pipeline_cer.md))、WenetSpeech） | 干净朗读/播音中文，CER 越低越好 | 开源最优约 2%（Paraformer-large 量级），SenseVoice-Small 约高 2–3 个百分点，Whisper-large-v3 约 5% 量级 | 开源模型横向对比的标准尺 |
| 真实会议/课堂（[FunASR vs Whisper 会议实测](https://github.com/modelscope/FunASR/discussions/2947)、[三项目比较](https://www.cnblogs.com/xio1028/p/19011196)、[中文实测对比](https://blog.csdn.net/weixin_29867767/article/details/158478153)） | 多人、噪声、口语、混说 | 中文 CER 普遍 5–20%（好模型 5–10%） | **课堂验收应以此为准** |
| Common Voice 中文等众包集 | 用户录音，噪声大 | 普遍差于 AISHELL | 只做鲁棒性参考 |

### 6.2 关键结论

1. **“98%”不可信**：讯飞宣称的 98%/98.7% 是受控语料口径（[讯飞官方宣传](https://www.xfyun.cn:443/site/3348.html)）；真实课堂/会议场景，即使商用大模型中文 CER 也常见 5–15%。
2. **评估标准动作**：① 官方基准（AISHELL-1/2、WenetSpeech）对齐开源模型排名；② **自建课堂语料**（教师真实讲课录音，含 PPT 术语、板书、混说）作为唯一验收口径；③ 指标用 **CER** 而非“准确率”，并额外统计**热词命中率**与**首字/整句延迟**。
3. 开源模型中文排名（社区实测口径）：Paraformer-large（纯中文离线）≈ 流式 Zipformer（流式）> SenseVoice-Small ≈ Whisper-large-v3（速度差 1–2 个数量级）；Qwen3-ASR-1.7B+ 为 2025 新黑马（[对比](https://blog.csdn.net/weixin_31974443/article/details/157455740)），但需更高算力。
4. 评测工具：FunASR 官方 [benchmark](https://modelscope.github.io/FunASR/zh/benchmark.html) 已给出 pipeline（VAD+ASR+PUNC）的 CER 参考值，可作为基线模板。

---

## 7. 商业云端 ASR API（2026 价格与能力）

> 价格为检索时点快照，落地前以官网为准。

| 厂商 | 产品/模型 | 计费方式 | 价格量级（检索时点） | 中文准确率 | 热词/自定义 | 说话人分离 |
|---|---|---|---|---|---|---|
| **讯飞** | [实时语音转写大模型](https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html)、[录音文件转写](https://www.xfyun.cn/services/lfasr)、讯飞听见 | 按次/按分钟 + 套餐；新用户有免费额度（[说明](https://blog.csdn.net/weixin_35949153/article/details/152956834)） | 小时级成本个位数–十元量级（套餐） | 商用级中文（宣传 98%+） | ✅ 热词/个性化词库 | ✅（听见/转写产品） |
| **阿里云** | [Paraformer-v2 / Paraformer-realtime-v2](https://help.aliyun.com/zh/model-studio/model-pricing)（Model Studio） | **按输入音频秒数计费**（[计费规则](https://www.alibabacloud.com/help/en/model-studio/model-pricing)） | 小时级十元内量级（[计费页](https://help.aliyun.com/zh/model-studio/model-pricing)） | 工业级中文（Paraformer 系） | ✅ 热词/短语管理（[phrase manager](https://help.aliyun.com/en/model-studio/paraformer-asr-phrase-manager)） | ✅ 流式接口自带 |
| **腾讯云** | [ASR 实时/录音识别](https://intl.cloud.tencent.com/zh/document/product/1118/43352)、[智能语音费用](https://cloud.tencent.com/document/product/436/84601) | 按次/按分钟阶梯 | 与讯飞同档 | 商用级中文 | ✅ | ✅ |
| **百度** | 短语音/实时语音识别 | 按次/按秒阶梯 | 与讯飞同档 | 商用级中文 | ✅ | ✅（长音频） |
| **Deepgram** | [Nova-3（2025）](https://convertaudiototext.com/blog/deepgram-nova-3-explained)、[定价](https://www.llmreference.com/provider/deepgram/nova-3) | 预录/流式分档，按小时或分钟 | $0.15–0.30/h 量级（流式） | 中文可用、非最强 | ✅（关键词/上下文） | ⚠️ 有限 |
| **AssemblyAI** | [Universal-1 / Universal-Streaming（多语实时，2025 支持中文](https://newdecoded.com/news/assemblyai-launches-multilingual-universal-streaming)） | [按小时计费](https://www.assemblyai.com/pricing.md) | $0.15–0.37/h 量级（视档次，[实际成本分析](https://brasstranscripts.com/blog/assemblyai-pricing-per-minute-2025-real-costs)、[2026 定价](https://costbench.com/software/ai-transcription-apis/assemblyai/)） | 中文可用 | ✅ 词表/提示 | ✅（Speaker Diarization 附加） |

来源：
- https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html 、https://www.xfyun.cn/services/lfasr 、https://www.xfyun.cn:443/site/3348.html 、https://chdh.me/tools/ai-tools/office/iflyrec/
- https://help.aliyun.com/zh/model-studio/model-pricing 、https://help.aliyun.com/zh/model-studio/paraformer-v2
- https://intl.cloud.tencent.com/zh/document/product/1118/43352 、https://cloud.tencent.com/document/product/436/84601
- https://convertaudiototext.com/blog/deepgram-nova-3-explained 、https://www.llmreference.com/provider/deepgram/nova-3 、https://aiagentsquare.com/compare/deepgram-vs-assemblyai
- https://www.assemblyai.com/pricing.md 、https://newdecoded.com/news/assemblyai-launches-multilingual-universal-streaming 、https://brasstranscripts.com/blog/assemblyai-pricing-per-minute-2025-real-costs 、https://costbench.com/software/ai-transcription-apis/assemblyai/
- 横向评测参考：https://www.xfyun.cn/site/1867.html 、https://agent.csdn.net/6a17c4e310ee7a33f275e3e2.html

### 关键结论

1. **中文课堂场景选国内厂商**：讯飞/阿里/腾讯/百度中文识别与热词体系远强于海外；阿里云 Paraformer 流式接口**自带说话人分离 + 热词管理**，集成成本最低。
2. **价格量级**：国内按秒/分钟计费，课堂 1 小时音频成本多在**个位数到十几元人民币**；海外按小时计费约 $0.15–0.37/h（人民币约 1–3 元/小时，但中文质量与术语支持弱，且实时流式计费复杂）。
3. **隐私/离线**：本仓库“本地优先”原则下，云端 API 只作在线增强兜底，数据不出本机为核心卖点。

---

## 8. 中文课堂场景推荐技术栈组合

**场景约束**：单教师讲授（麦克风近场）、PPT + 板书（术语密集、含中英混说）、弱网/离线优先、桌面端（Electron）本地运行。

### 8.1 推荐组合（本地优先，与仓库“本地优先 + AI 增强可选”理念一致）

```
[麦克风 16k 单声道]
      ↓
Silero VAD（流式分段，min_silence 可调）
      ↓
sherpa-onnx 流式双语模型（主识别，实时部分结果）
  ├─ 纯中文课：icefall 中文流式 Zipformer（Transducer）
  └─ 中英混说课：FunASR paraformer-bilingual-zh-en-streaming（导出 ONNX/GGUF）
      ↓  + hotwords（课堂术语表，sherpa 上下文图偏置 / SeACo 热词）
句末触发 → SenseVoice-Small 两遍重打分（整句精修，CPU 15×+ 实时）
      ↓
可选：在线时叠加阿里云 Paraformer-realtime-v2（热词 + 说话人分离）做兜底对比
      ↓
LLM 后处理（标点/纠错/结构化笔记，走仓库现有 AI 网关，离线用本地模型）
```

### 8.2 取舍与理由

| 决策点 | 选择 | 理由 |
|---|---|---|
| 流式主模型 | 流式 Zipformer / 双语 Paraformer 流式（sherpa-onnx） | 原生流式延迟低（部分结果 <500ms）、CPU 可跑、支持 hotwords；不选 Whisper 流式（无原生流式） |
| 中英混说 | 双语模型 + 英文术语热词表 | 双语模型专为混说设计；热词表兜底学科英文缩写/公式念法 |
| 整句精度 | SenseVoice-Small 两遍重打分 | 流式模型整句略差，句末用离线模型（快、准）精修；比 Whisper-large 快 1–2 个数量级 |
| 热词 | sherpa hotwords（本地）+ 厂商热词接口（云端兜底） | 课程术语命中率是课堂体验关键；PPT/板书 OCR 动态更新热词表 |
| VAD | Silero VAD | 噪声鲁棒、2MB、流式；WebRTC/energy 仅作前置粗过滤 |
| 说话人分离 | 单教师 → 默认不做；师生互动 → 离线 CAM++/pyannote | 单教师无分离需求，省延迟与误分风险；流式 diarization 不成熟（§4） |
| 云端 API | 仅在线时作兜底（阿里云 Paraformer-realtime-v2 优先） | 中文最优、自带热词+分离、按秒计费；弱网离线时完全本地可用 |
| 评估 | AISHELL-1/2 + WenetSpeech 对齐 + 自建课堂语料（CER + 热词命中率） | 厂商“98%”口径不可用，必须自建验收集 |

### 8.3 风险与缓解

- **本地流式模型长句/噪声弱于云端大模型** → 两遍重打分 + VAD 合理切段缓解；极端噪声课可开云端兜底。
- **混说场景精度略降** → 双语模型 + 热词表 + SenseVoice 重打分，三重缓解。
- **模型体积**：Zipformer int8 + SenseVoice-Small 合计约 300–500MB，随安装包分发可接受；如需再降，用 GGUF 量化（社区已有双语 Zipformer2 GGUF）。
- **热词维护成本**：热词表由课程大纲/PPT 自动生成，需做“低频误boost”监测（热词过强会引入幻觉词）。

---

## 参考来源汇总（按节）

1. **本地/流式模型**：sherpa-onnx [GitHub Releases](https://github.com/k2-fsa/sherpa-onnx/releases/tag/v1.12.18)｜[支持矩阵](https://deepwiki.com/k2-fsa/sherpa-onnx/1.2-supported-platforms-and-architectures)｜[VoicePing 16 模型离线基准](https://voiceping.net/zh/blog/research-offline-speech-transcription-benchmark/)｜[SenseVoice llama.cpp 基准](https://github.com/QwenAudio/SenseVoice/blob/main/runtime/llama.cpp/BENCHMARKS.md)｜[Paraformer vs SenseVoice 测评](https://blog.csdn.net/weixin_33562004/article/details/156975108)｜[FunASR vs Whisper 会议实测](https://github.com/modelscope/FunASR/discussions/2947)｜[two-pass 示例](https://github.com/k2-fsa/sherpa-onnx/blob/b74c4dfe/python-api-examples/two-pass-speech-recognition-from-microphone.py)｜[faster-whisper 实时](https://cloud.baidu.com/article/3665296)｜[实时字幕 faster-whisper](https://github.com/nullpox7/realtime-whisper-subtitles-optimized)｜[量化/NPU](https://blog.hotdry.top/posts/2025/10/26/edge-device-offline-speech-processing-sherpa-onnx-quantization-npu/)｜[端侧中文实战](https://ithome.me/post/2026/08/06/on-device-asr-sherpa-onnx/)
2. **中英混说**：[SeACo-Paraformer 论文](https://browse.arxiv.org/abs/2308.03266)｜[双语混说实测](https://blog.csdn.net/weixin_42561464/article/details/156960671)｜[多语言测试](https://blog.csdn.net/weixin_42588672/article/details/157422772)｜[paraformer-zh-streaming](https://huggingface.co/funasr/paraformer-zh-streaming)｜[通义百聆开源](https://developer.aliyun.com/article/1693370)｜[Qwen3-ASR 对比](https://blog.csdn.net/weixin_31974443/article/details/157455740)
3. **热词/偏置**：[sherpa hotwords 官方文档](https://k2-fsa.github.io/sherpa/onnx/hotwords/index.html)｜[Issue #735](https://github.com/k2-fsa/sherpa-onnx/issues/735)｜[NeMo hotwords PR](https://github.com/k2-fsa/sherpa-onnx/pull/3077)｜[SeACo 论文](https://huggingface.co/papers/2308.03266)｜[阿里热词管理](https://help.aliyun.com/en/model-studio/paraformer-asr-phrase-manager)｜[阿里提升准确率](https://www.alibabacloud.com/help/zh/model-studio/improve-asr-accuracy)｜[Whisper 上下文偏置](https://ar5iv.labs.arxiv.org/html/2309.09552)｜[CB-Whisper](https://aclanthology.org/2024.lrec-main.262/)
4. **说话人分离**：[pyannote community 模型](https://huggingface.co/pyannote-community/speaker-diarization-community-1)｜[Diarization 评测](https://huggingface.co/papers/2509.26177)｜[VoicePing diarization 调研](https://voiceping.net/zh/blog/research-diarization-2025/)｜[CAM++ 全链路](https://github.com/zxkane/audio-transcriber)｜[SCDiar 流式](https://ieeexplore.ieee.org/abstract/document/10888692)｜[课堂噪声分离研究](https://eric.ed.gov/?id=ED675664)
5. **VAD**：[Cobra/Silero/WebRTC 选型（2026）](https://picovoice.ai/blog/best-voice-activity-detection-vad/)｜[VAD 论文](https://arxiv.org/pdf/2402.09797)｜[Silero/Pyannote 对比](https://arxiv-org.ezproxy.obspm.fr/html/2506.08846v3)｜[Python VAD 工具包](https://cloud.baidu.com/article/4348382)
6. **评估口径**：[FunASR benchmark](https://modelscope.github.io/FunASR/benchmark.html)｜[CER 明细](https://raw.githubusercontent.com/modelscope/FunASR/main/benchmarks/benchmark_pipeline_cer.md)｜[讯飞 98.7% 宣传](https://www.xfyun.cn:443/site/3348.html)｜[SenseVoice vs Whisper-large-v3 中文](https://blog.csdn.net/weixin_29867767/article/details/158478153)｜[三项目比较](https://www.cnblogs.com/xio1028/p/19011196)
7. **商业 API**：[阿里云计费](https://help.aliyun.com/zh/model-studio/model-pricing)｜[Paraformer-v2](https://help.aliyun.com/zh/model-studio/paraformer-v2)｜[讯飞实时转写大模型](https://www.xfyun.cn/doc/spark/asr_llm/rtasr_llm.html)｜[讯飞录音转写](https://www.xfyun.cn/services/lfasr)｜[讯飞听见评测](https://chdh.me/tools/ai-tools/office/iflyrec/)｜[腾讯云 ASR](https://intl.cloud.tencent.com/zh/document/product/1118/43352)｜[腾讯云费用](https://cloud.tencent.com/document/product/436/84601)｜[Deepgram Nova-3](https://convertaudiototext.com/blog/deepgram-nova-3-explained)｜[Deepgram 定价](https://www.llmreference.com/provider/deepgram/nova-3)｜[AssemblyAI 定价](https://www.assemblyai.com/pricing.md)｜[AssemblyAI 多语实时](https://newdecoded.com/news/assemblyai-launches-multilingual-universal-streaming)｜[AssemblyAI 成本分析](https://brasstranscripts.com/blog/assemblyai-pricing-per-minute-2025-real-costs)｜[Deepgram vs AssemblyAI](https://aiagentsquare.com/compare/deepgram-vs-assemblyai)
