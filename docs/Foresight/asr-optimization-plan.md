# 熵减 ASR 质量与链路优化方案（2026-09 盘点 · 技术栈不受限）

> 状态：调研方案（未立项，供用户裁决批次与范围）
> 数据源与证据分级：
> - **【代码证】** 已逐一核对 `app/src-tauri/src` 源码/单测，可作事实依据；
> - **【wiki: 文件(行)】** 出自 `.qoder/repowiki/zh/content/`（2026-09-03 由 Qoder 依 dev 生成、AI 撰写）。wiki 与代码已发现多处背离（见附 A 定案案例），**凡 wiki 断言一律以代码互证为准**；
> - **【推断】** 未验证的分析判断；
> - **【前沿】** 2026-09 web 检索所得外部资料（口径不一，仅作方向与量级参考，引用见附 B）。
> 关联：ADR-003（流式 ASR 架构）· ADR-012（流式质量修复批）· REQ-041/068/101 · Foresight 长期优化清单/视频提取极限 · v0.19 检索与发现层设计（检索质量同样受 ASR 文本质量影响）

## 一、一句话结论

ASR 感知质量的提升空间主要**不在"换更大的模型"**，而在这五件事，按杠杆排序：

1. **真实基线缺失**：90% 保真度是经验估计（原文档自注"需实测校准"），大量模块"真机验收待执行"——没有尺子，一切优化都是猜；
2. **既定规则链参数全员经验化**：VAD 倍率/窗口/预热、端点 rule1/2/3、重打分门限、融合权重、去重阈值——wiki 多处自注"需实测校准"，工具（`bin/cer_bench`/`asr_forensic`/阈值共享槽）已就绪，缺的是语料与 runner；
3. **实时会话缺"会话级全量精修"档**：现在实时只对端点句重打分（3s 超时）、停止补尾句；文件导入却是 SenseVoice 全窗转写。S4 音频落盘已交付，补一个"会话结束全量离线精修（可预览采纳/回退）"是最大单品杠杆；
4. **感知杀手是术语/专名错**（贝塞尔→被萨尔进笔记即知识资产污染），热词/词表闭环的覆盖面与加固优先级高于模型换芯；
5. **技术栈外确实存在 2026 年更强的中文模型档**（FireRedASR v2/Qwen3-ASR/Fun-ASR-Nano 等），但换芯必须过"同一评测集 + 本地约束（离线/TLS/体积/许可/热词支持）"的裁决门，且跨运行时接入（FunASR 服务形态等）属 ADR 级决策。

## 二、现状基线缺口与现成工具（代码证）

| 项 | 现状 | 证据 |
|---|---|---|
| 保真度 | 字幕 100% / 字幕 OCR ~99% / 纯 ASR ~90%（+hotwords 纠偏）为**经验估计，需实测校准** | Foresight 提取极限文档自注 |
| 验收 | 多版本"代码已交付，真机验收待执行" | versions/ 系列 |
| 预处理微基准 | `bin/cer_bench <wav> <ref.txt>`：S4 落盘音频"预处理开/关"两路 SenseVoice 转写 → CER 对比 + `recommend_preproc` 结论（REQ-101 验收口径）；`src/cer.rs` 提供纯函数 | 代码证（bin/cer_bench.rs） |
| 截断取证/阈值诊断 | `bin/asr_forensic`：疑似截断段窗口重转写（TAIL_MARGIN 1.2s）+ RMS 弱音块统计 | 代码证 |
| 诊断共享槽 | VadThresholdSlot 跨会话暴露 VAD 阈值 | 代码证（wiki 亦述） |
| 指标聚合 | 引擎失败/超时/缓存命中计数入质量报告 | 代码证（模块注释）+ wiki 述 |
| 预处理配置持久化 | `audio_preproc_config.rs`（同 OcrDeviceConfig 模式，下次实时会话生效） | 代码证 |
| **缺口** | ①真实语料集（分档案桶 + 人工/字幕参考）②corpus 回归 runner ③错误聚类工具 | 推断 |

**基线先行（P0）** = 把 `cer_bench` 泛化为多文件 corpus 模式（分网课/实操/口播/圆桌/混说桶），输出首轮 CER 与错误聚类——之后所有 A/B 与换芯裁决共用同一把尺。

## 三、全链路机会清单

### 3.1 信号捕获 / 前处理

| 机会 | 现状与证据 | 技术栈内 | 技术栈外/前沿 | 优先级 |
|---|---|---|---|---|
| 预处理链默认定案 | AGC+削波+噪声底动态阈值链，**默认关**，生产启用待 CER 微基准（代码证 audio_preprocess.rs：RNNoise 曾评估延后） | 用 cer_bench + 语料集跑开/关 CER 定默认；REQ-101 验收口径已立 | RNNoise/模型化降噪（净收益需评估；环回是"成品音频"，降噪慎用——代码注） | **P1** |
| 噪声底陈旧 | 噪声底仅静音块更新，连续语音期可能漂移（wiki: 音频捕获系统 185，需互证实现细节） | 语音期低频次更新/能量窗校准 | — | P2 |
| 停录句尾丢失 | flush 时静默尾块直接丢弃（登记豁免；wiki: 音频重采样与处理 193） | 保留尾部缓冲入句音频，末句完整重打分 | — | P2 |
| 双声道取一 | 立体声按声道 RMS 取最大声道（wiki: 音频重采样 300 待互证） | 场景评估（课堂双声源少见），低优 | — | P3 |

### 3.2 VAD / 端点（切句与漏音是全链路起点）

| 机会 | 现状与证据 | 技术栈内 | 技术栈外/前沿 | 优先级 |
|---|---|---|---|---|
| 参数标定族 | 自适应能量 VAD（P10 分位数+平滑限幅）；预热 50 块、窗口 400 块≈80s、±20%/块；rule1 2.4s / rule2 1.2s / rule3 8s（env 可覆盖）——代码证（streaming_endpoint/streaming_asr/vad_adaptive）；wiki 自注"须按业务数据校准倍率/上下限/预热"（自适应 VAD 304、VAD 静音检测 109-112） | `asr_forensic` RMS 弱音块统计 + VadThresholdSlot 观测 → 语料标定；**档案化阈值**（口播/圆桌/实操噪声不同） | 模型化 VAD（见下行） | **P1** |
| **文档/实现落差：Silero VAD** | AGENTS.md 技术栈记载"Silero VAD"，**代码零引用**（全仓 grep 无 silero；实际为能量自适应 + sherpa 端点规则；ADR-003 原文待核） | 决策留痕：修订 AGENTS/（如涉）ADR-003 口径（规范先行） | 若重开 VAD 选型：Silero-ONNX（rust 绑定成熟、sherpa-onnx 生态内置）做模型 VAD spike，与标定后能量 VAD 同评测集对比 | P3 决策项 |
| rule3 等参数入口 | 仅 env `ENTROPY_ASR_RULE3_SECS`（代码证 live_session_lifecycle/prepare 两处口径一致） | 配置 UI/JSON 校准 + 档案化（audio_preproc_config 先例） | — | P2 |
| 阈值槽蓝图 | 多阈值/多数投票为设计蓝图未实现（wiki: 阈值槽式 VAD 自述） | 先量化收益（当前单阈值标定后是否还缺？）再定 | — | P3 |

### 3.3 流式解码 / 引擎

| 机会 | 现状与证据 | 技术栈内 | 技术栈外/前沿 | 优先级 |
|---|---|---|---|---|
| 重打分积压丢内容 | rescore 3s 超时（代码证 RESCORE_TIMEOUT_MS）有界；SenseVoice 慢于语音速率时 channel 积压、停止时内容缺失（wiki: 流式 135/349） | 积压计数/背压统计 + 停止前 drain 策略验证 | — | **P1 验证** |
| 热词加固 | 热词依赖 modified_beam_search（wiki: 模型管理 126/149：表外字 abort、下个端点生效——**需互证**）；领域热词预热注入已有（video_profile_domain_fine 代码证 + wiki 智能分析 197-200） | 注入前 tokens 过滤 + 崩溃防护单测；注入源扩展（文件标题/章节名/术语候选自动入词） | 前沿：三代热词方案（FunASR：热词属性绑定/多策略，[阿里云文章](https://developer.aliyun.com/article/1587443)）；zero-shot trie 上下文偏置（[IEEE 11249064](https://xplorestaging.ieee.org/document/11249064)）；hotword retrieval+RL（[arXiv 2512.21828](https://arxiv.org/abs/2512.21828v1)）——sherpa 内已具 hotwords 机制，方向=覆盖面与排序策略 | **P1** |
| 词级时间戳 | 流式默认 None 省内存，近似按字符比例（wiki: 转写片段实体 101/118——需互证） | 对齐精度敏感场景（字幕融合/时间回跳）评估开启成本 | — | P2 |

### 3.4 第二遍 / 离线精修档（技术栈内外机会最集中处）

| 机会 | 现状与证据 | 技术栈内 | 技术栈外/前沿 | 优先级 |
|---|---|---|---|---|
| **会话级全量离线精修** | 实时=端点句 rescore（门限：编辑距离≤较短 40%、前缀扩展 max(8,流式长)、短句≤4 放宽——wiki: 重打分 146；代码证 asr_rescore）；导入=全窗 SenseVoice 30s+2s（代码证 import_transcribe） | 新命令：会话结束后用落盘 S4 音频全量 SenseVoice 第二遍 → 段级 diff → 预览采纳/回退（原料层不动、产物可逆——既有契约）；O4 登记项落地 | — | **P1** |
| 第二遍模型档升级 | 现 SenseVoice；同 crate 候选需核 sherpa-onnx 模型表 | SenseVoice 系变体/Paraformer-zh 220M（sherpa 生态支持，AISHELL-1 ~1.95% 参考口径不一）/zipformer 新 checkpoint | FireRedASR v2（中文基准第一，AED 1.1B 需 GPU、60s 窗、自带 VAD/标点/时间戳，Apache-2.0）；Qwen3-ASR（0.6B/1.7B、22 方言、流式）；Fun-ASR-Nano（800M、流式+7 方言+26 口音、ONNX 可导出）；Moonshine 中文出局（CER ~36%）——数据源附 B（口径不一仅量级参考） | P3 spike（门控见 §四） |
| 门限与代理置信 | "相似度代置信度"（wiki: 重打分 135/175）+ 权重 0.6/0.4 经验值 | 离线回放 A/B 标定（同 P0 语料） | — | P1 |

### 3.5 融合 / 对齐

| 机会 | 现状与证据 | 技术栈内 | 技术栈外/前沿 | 优先级 |
|---|---|---|---|---|
| **DTW 漂移校正未接线** | `dtw_align.rs`（estimate_drift_ms/correct_subtitles/alignment_accuracy）纯函数+测试齐备，**全仓无生产调用点**（代码证 grep）——wiki"spike 预留"属实 | 接线进字幕融合入口 + 真机漂移观测（字幕时间戳漂移是"字幕权威"路线错位主因） | — | **P1** |
| 融合参数族标定 | gap 1000ms / SIM 0.8 / LOW 0.6 / 概率加权 0.6-0.4 / 去重窗与编辑距离 ≤1/≤2——wiki 多处自注"需实测校准"（字幕融合 319-322、智能分析 240、去重净化 199） | corpus runner 端到端 A/B（融合输出 vs 人工，而非单阈值） | — | P1 |
| 融合性能 | DTW O(nm) 限带宽/预过滤（wiki: 字幕对齐 346） | 长会话触发后评估 | — | P3 |

### 3.6 文本后处理 / 纠错（感知质量主战场）

| 机会 | 现状与证据 | 技术栈内 | 技术栈外/前沿 | 优先级 |
|---|---|---|---|---|
| **ASR 同音混淆画像闭环** | OCR 侧已有完整机制：混淆画像→替换候选→先验兜底→JSON 原子持久化→确认入库（代码证 ocr_confusion/commands；wiki OCR 混淆矩阵页）——ASR 侧无 | 迁移同款：语音同音错对画像（以人工/字幕为参考对齐）→ 候选纠错表（JSON 校准、共现才替换——"保守替换"哲学 OCR 结果校正 198 先例）→ 反哺 hotwords | LLM 校对（见下） | **P1/P2** |
| 可选 LLM 文本校对 | 现有 AI 平台（本地 Ollama preset/云端 BYOK + content_gate 默认关 + 成本审计） | 逐句"建议制"纠错：仅文本上云（**语音不出本机**），建议确认才替换 | 前沿方向：LLM 系 ASR 纠错（如 FireRedASR2-LLM 等 audio-LLM 路线需 GPU/云端；文本级 correction 是其轻量近似） | P2（产品化纪律：默认关） |
| 净化阈值与复核 | asr_clean 幻觉过滤/asr_dedupe（重叠≥2 字+Jaccard）/语篇精确表零误杀哲学（note_filter_discourse 代码证） | 去重阈值语料标定防误删；边界段"人工/AI 复核"闭环核实（wiki: 去重净化 364 待互证） | — | P2 |
| bigram O(nm) | 两两比较（wiki: 去重净化 337 待互证） | 长会话索引化（低优） | — | P3 |

### 3.7 健康 / 资源 / 指标

| 机会 | 现状与证据 | 技术栈内 | 技术栈外/前沿 | 优先级 |
|---|---|---|---|---|
| 健康阈值标定 | 无产出 5s→离线重打分、15s→静音占位、恢复 3s（wiki: 健康监控 102-104——asr_health.rs 存在代码证） | 真实场景标定 + 事件落库分析 | — | P2 |
| 指标可视化 | 引擎计数入质量报告；wiki"延迟/CER/超时聚合"为建议层（流式 338-342） | 会话报告 UI 暴露 ASR 指标（降级次数/重打分率/CER 抽样） | — | P2 |
| GPU/CPU 口径 | **已定案：ASR 无 GPU 分支**（device_config 仅 OCR/structure_engine 引用，代码证）——wiki ASR"模型管理"页含 OCR 设备决策为生成混淆 | 不动作；仅修订 wiki 口径 | 若 ASR 上 GPU：sherpa-onnx 无 CUDA EP 流式档（其生态以 CPU 优化为要）——不具性价比，出局 | — |

### 3.8 评测 / 工具（横切，P0 一并建）

corpus runner（分档案桶）+ 错误聚类（借鉴 OCR 混淆矩阵以参考文本对齐建画像 [wiki: 混淆矩阵 91]）+ 盲测对比；所有 A/B 与模型裁决共用。

## 四、换芯评估框架（不被技术栈束缚，但要有裁决门）

| 档位 | 候选 | 优劣 | 裁决要点 |
|---|---|---|---|
| 同 crate 微调档 | sherpa-onnx 现模型（Zipformer 双语/SenseVoice）参数与链路优化 | 零架构风险 | §三 P0~P2 先行 |
| 同 crate 换模型档 | sherpa-onnx 生态内其他转换模型（Paraformer-zh 系/新版 zipformer/在线 CTC——sherpa 已支持 [online CTC 模型页](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-ctc/index.html)） | 低风险试验 | 同一 corpus runner：CER×延迟×分发体积×热词支持；替换仅影响引擎池加载 |
| 跨运行时档 | FunASR（fsmn-vad+paraformer-streaming+ct-punc+cam+++三代热词，Python/服务形态）；FireRedASR v2（GPU、基准第一）；Qwen3-ASR（方言）；Fun-ASR-Nano（方言/流式，ONNX 导出） | 更强精度/方言；但 = sidecar 服务或新推理栈（Python 运行时/GPU 依赖/体积），与 Rust 单机本地架构冲突 | **先出 ADR 草案**：产品场景（用户多为普通话网课）是否买单方言/多出的 3-5% CER；本地约束（TLS/离线/许可 Apache-2.0 可商，Moonshine-zh 例外） |
| 可选云端档 | 语音上云高精度/LLM 纠错 | 效果最好 | **隐私红线冲突**：语音=学习数据，默认不出本机；若要评估须独立用户授权决策 + 明示 + 独立 ADR；文本级后处理上云走既有 content_gate |

> 量级参考（[第三方汇总文，2026-03，口径不一仅作量级](https://cloud.tencent.com.cn/developer/article/2642961)）：普通话平均 CER FireRedASR2-LLM 2.89 / AED 3.05 / Qwen3-ASR 3.76；AISHELL-1：Paraformer-zh ~1.95、SenseVoice-Small ~3.0（各自口径）。**任何数字都不替代自测。**

## 五、分批路径（建议，供裁决）

| 批 | 内容 | 预估 | 退出标准 |
|---|---|---|---|
| P0 基线 | corpus runner（分档案桶）+ 首轮 CER/错误聚类；文档/实现落差三案留痕（Silero/GPU/DTW，改 ADR-003/AGENTS 口径） | 1-2d | 首轮基线报告（分桶 CER + top 错误类型） |
| P1 定案批 | 预处理默认定案；VAD/端点/融合/去重阈值族标定（同 runner A/B）；DTW 接线+漂移观测；重打分积压验证；热词过滤加固+注入源扩展 | 3-5d | 每项 1 页 A/B 结论；goldens 全绿；误删零回归 |
| P2 质量新档 | 会话全量离线精修（采纳/回退 UX）；ASR 混淆画像→纠错/热词闭环；可选 LLM 文本校对（建议制·默认关） | 3-5d | 盲测对比报告；默认关合规 |
| P3 换芯 spike | 同 crate 候选档评测；如需跨运行时 → ADR-029 式草案（服务形态/许可/方言需求） | 2-3d + | 评测矩阵；ADR 裁决 |

## 六、纪律与红线

- 原料层（session_segments 原文）永不可变，一切净化/重打分/纠错作用于产物层并保留来源标记（既有可逆契约）；
- 模型文件不入库；新依赖下载受本机 TLS 约束（本地归档先例）；换推理栈 = ADR；
- 语音数据不出本机；文本级 AI 调用走 content_gate 双闸门默认关 + 成本审计（v0.19 检索层同款纪律）；
- 全部参数改动可配置/可回退（JSON 校准先例），golden 语料防误删回归。

## 附 A：wiki 断言 vs 代码核查清单

**已定案（代码证）**
1. ~~wiki: ASR"模型管理"页称 GPU/CPU 自动选择~~ → **GPU 决策仅属 OCR**（device_config.rs/OcrBackend 只被 ocr/structure_engine 引用）；wiki 生成混淆，不改代码。
2. ~~wiki: 说话人分离"无实现仅建议"~~ → 弱化版已实现（speaker_engine.rs 离线懒加载 + speaker_change.rs 阈值 0.75 + commands_speaker.rs + SpeakerSwitchCard 下载 UI）。
3. ~~AGENTS.md 记"Silero VAD"~~ → **代码零引用**（能量自适应 VAD + sherpa 端点规则）；规范口径需修订或重开选型（P3 决策项）。
4. wiki"DTW 漂移校正 spike 预留" → 属实：dtw_align.rs 纯函数+测试齐备但**无生产调用点**。
5. rule1/2/3、hangover 3 块、rescore 3s、rule3 env 覆盖 → 与代码一致（代码证）。

**待核查（wiki 行号源，实施时逐条互证）**：重打分积压丢内容（流式 135/349）；热词表外字 abort 与下端点生效（模型管理 126/149/271）；健康阈值 5s/15s/3s（健康监控 102）；静音尾块丢弃（音频重采样 193）；边界段复核闭环（去重净化 364）；word_timestamps None 与字符近似（转写片段 101/118）；bigram O(nm)（去重净化 337）；噪声底仅静音块更新（音频捕获 185）；双声道取最大 RMS（音频重采样 300）。

## 附 B：外部参考（2026-09 检索，口径以各自出处为准）

- 中文开源 ASR 模型/工具生态与 CER 汇总：[腾讯云开发者社区（2026-03）](https://cloud.tencent.com.cn/developer/article/2642961)
- sherpa-onnx：模型生态（[在线 CTC 模型](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-ctc/index.html)）
- FunASR（VAD/标点/CAM++/热词工具链，[FunASR README](https://raw.githubusercontent.com/alibaba-damo-academy/FunASR/main/README_zh.md)）· [第三代热词方案](https://developer.aliyun.com/article/1587443)
- FireRedASR（[仓库](https://github.com/FireRedTeam/FireRedASR)）· Qwen3-ASR（[仓库](https://github.com/QwenLM/Qwen3-ASR)）· Fun-ASR-Nano（[Fun-ASR 仓库](https://github.com/FunAudioLLM/Fun-ASR)）· SenseVoice（[FunAudioLLM](https://developer.baidu.com/article/detail.html?id=7726618)）
- VAD：Silero（[silero-vad-rust](https://lib.rs/crates/silero-vad-rust)）· 标点：FireRedChat-punc（[HuggingFace](https://huggingface.co/FireRedTeam/FireRedChat-punc)）
- 前沿论文：zero-shot trie 上下文偏置（[IEEE](https://xplorestaging.ieee.org/document/11249064)）· LLM-ASR 热词检索+强化（[arXiv 2512.21828](https://arxiv.org/abs/2512.21828v1)）
