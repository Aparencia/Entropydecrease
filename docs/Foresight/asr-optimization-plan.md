# 熵减 ASR 质量与链路优化方案（2026-09-03 · 技术栈不受限 · 自验证路线版）

> 状态：**决策稿**（待用户裁决 D0~D6，见 §七）
> 数据源与证据分级：
> - **【代码证】** 已核对 `app/src-tauri/src` 源码/单测；
> - **【wiki: 文件(行)】** 出自 `.qoder/repowiki/zh/content/`（2026-09-03 Qoder 依 dev 生成、AI 撰写）。wiki 与代码已发现多处背离（附 A 定案案例），**wiki 断言一律以代码互证为准**；
> - **【推断】** 未验证判断；**【前沿】** 2026-09 检索外部资料（附 B，口径以出处为准）。
> 用户裁决（2026-09-03）：① 实际人工验证几乎不可能——**验证必须代码自验证**（见 §二）；② 方案继续推进到决策。
> 关联：ADR-003（流式 ASR 架构）· ADR-012 · REQ-041/068/101 · v0.19 检索与发现层设计（同受转写文本质量影响）

## 一、一句话结论

ASR 感知质量提升空间按杠杆排序：**① 自验证基线（无人工语料也能测）；② 既定规则参数经验化 → 自动 A/B 标定；③ 实时会话缺"全量离线精修"档；④ 术语/专名错（热词与混淆画像闭环）；⑤ 换芯裁决（2026 年有更强中文模型，但过裁决门）**。真实人工验证不可行 → 全部改为**代码自验证**（内置参考信道 + 自动 A/B + golden 回归），凡是"需要人工转写/真机走查"才能验收的条目一律降级为"自验证可测项"或剔除。

## 二、自验证路线（核心修订）

### 2.1 参考（ground truth）从哪来——不依赖人工

| 参考源 | 质量 | 可得性（代码证） | 用途 |
|---|---|---|---|
| 外挂/内嵌字幕轨（.srt/.ass/.vtt） | ~100%（无损信道） | 导入链路已支持字幕探测与字幕优先（REQ-016/017） | **主参考**：对"强制 ASR"重跑结果做 CER |
| 字幕 OCR 多帧投票文本 | ~99% | subtitle_ocr 投票器（REQ-062）已交付 | 无字幕文件但有画面的素材参考 |
| 会话内字幕来源段 | 同上 | session_segments.source='subtitle'（融合链路） | 既有历史会话批量回测 |
| 无参考素材 | — | — | 不进 CER 评测；只产出稳定性/画像/回归基线 |

### 2.2 自验证 harness（新增 bin：`asr_eval`）

```
输入：样本目录（*.wav/*.mp4/*.srt 配对 或 视频+画面字幕）
→ 对每个样本：音频提取 → [被测路径] 转写（流式档/离线档/预处理开关/参数矩阵）
→ 参考获取：同名字幕文件 > 画面字幕 OCR > 跳过
→ 对齐（复用 dtw_align 纯函数）→ CER（复用 cer.rs）→ 混淆画像统计（同音错对 top-N）
→ 输出：单样本报告 + 汇总（分"档案桶"由调用方标注）+ A/B 参数矩阵对比表
退出码 = 回归门（相对基线 CER 退化 > 阈值 → 失败，供 CI/本地回归）
```

- 复用全部现成件（代码证）：`bin/cer_bench`（现成单样本范式，扩展为批量）、`src/cer.rs`、`dtw_align.rs`（对齐+漂移估计）、`bin/asr_forensic`（取证范式）、字幕导入/OCR 链路。
- **golden 固化**：首批有参考样本（字幕文件保留）沉淀为 `src-tauri/fixtures/asr/*` 测试夹具，`cargo test` 自动回归（模型文件不打入——夹具只存参考与音频特征？音频文件体积大——**方案：夹具存音频 + 参考 + 期望阈值**，音频放开发机 `fixtures` 并 gitignore/或脚本下载，与现模型分发同哲学）。
- **无人工依赖的 A/B**：同一批样本 × 参数矩阵（VAD/端点/重打分门限/融合权重/预处理开关）自动两两对比；输出"参数 → CER/画像"表。
- 局限（诚实）：无字幕素材无法测绝对 CER；参考误差（字幕 OCR 非 100%）会稀释精度——所有结论只做**相对对比与回归**，不宣称绝对指标。

### 2.3 既有"真机验收"类条目的处理

凡退出标准含"用户走查/人工转写/真机环境"的条目，一律改写为：**harness 回归 + golden + 可选用户抽样复核（不再作为验收依赖）**。

## 三、全链路机会清单（决策用，优先级见 §七 D2）

### 3.1 信号/前处理

| 机会 | 现状与证据 | 建议动作 | 优先级 |
|---|---|---|---|
| 预处理默认定案 | AGC+削波+噪声底链**默认关**，生产启用待 CER 微基准（代码证 audio_preprocess.rs；REQ-101 口径已立） | asr_eval 有参考子集 A/B：开/关 → 定默认并落 audio_preproc_config 持久化 | P1 |
| 噪声底陈旧 | 仅静音块更新（wiki: 音频捕获 185 待互证） | 互证后语音期低频更新 | P2 |
| 停录句尾丢失 | flush 静默尾块丢弃（wiki: 音频重采样 193 待互证） | 尾部缓冲入句音频 | P2 |

### 3.2 VAD / 端点

| 机会 | 现状与证据 | 建议动作 | 优先级 |
|---|---|---|---|
| 参数标定族 | 预热 50 块/窗口 400 块≈80s/±20%；rule1 2.4s/rule2 1.2s/rule3 8s(env)——代码证；wiki 自注需业务数据校准（自适应 VAD 304 等） | asr_eval 参数矩阵自动 A/B；**档案化**（口播/圆桌/实操桶） | P1 |
| Silero 落差 | AGENTS 记 Silero，**代码零引用**（能量自适应；ADR-003 原文待核） | 先修订规范口径；重开模型 VAD 选型 = 决策项 D5 | P3/决策 |
| rule3 入口 | 仅 env（代码证 ENTROPY_ASR_RULE3_SECS） | 配置 UI/JSON + 档案化 | P2 |

### 3.3 流式引擎

| 机会 | 现状与证据 | 建议动作 | 优先级 |
|---|---|---|---|
| 重打分积压 | 3s 超时（代码证）；慢机积压丢内容（wiki: 流式 135/349 待互证） | 积压计数+停止 drain；harness 慢速档回放 | P1 验证 |
| 热词加固/扩展 | modified_beam_search 耦合、表外字 abort（wiki: 模型管理 126/271 待互证）；领域细分已有（video_profile_domain_fine 代码证） | tokens 过滤+单测；注入源扩展（标题/章节/术语候选）；对标三代热词（附 B） | P1 |

### 3.4 第二遍 / 离线精修

| 机会 | 现状与证据 | 建议动作 | 优先级 |
|---|---|---|---|
| **会话级全量离线精修** | 实时=端点句 rescore（门限 40%/前缀扩展——wiki: 重打分 146 + asr_rescore 代码证）；导入=全窗 SenseVoice（代码证 import_transcribe）；S4 落盘已交付 | 新命令：会话结束全量第二遍 → 段级 diff → 采纳/回退（原料不动、产物可逆）；harness 可自动对比精修前后 CER | P1 |
| 第二遍模型档 | SenseVoice 现用；同 crate 候选（Paraformer-zh 220M 等，sherpa 生态） | P3 spike 同评测集裁决 | P3 |

### 3.5 融合 / 对齐

| 机会 | 现状与证据 | 建议动作 | 优先级 |
|---|---|---|---|
| **DTW 未接线** | dtw_align.rs 纯函数+测试齐备，无生产调用点（代码证） | 接线进字幕融合入口；asr_eval 对字幕样本输出漂移估计分布（无需人工） | P1 |
| 融合参数族 | gap 1000ms/SIM 0.8/LOW 0.6/0.6-0.4 权重——wiki 多处自注需实测校准 | asr_eval 端到端 A/B（融合输出 vs 字幕参考） | P1 |

### 3.6 后处理/纠错

| 机会 | 现状与证据 | 建议动作 | 优先级 |
|---|---|---|---|
| ASR 同音混淆画像 | OCR 侧完整闭环（ocr_confusion+JSON 校准+确认，代码证）；ASR 侧无 | asr_eval 内建画像统计 → 自动生成候选纠错表（共现才替换，OCR 哲学迁移）→ 人工一键确认 | P1/P2 |
| 可选 LLM 文本校对 | ai_platform 现成（本地 Ollama/云端 + content_gate 默认关） | 建议制逐句校对；仅文本上云，语音不出本机 | P2 |

### 3.7 健康/指标

| 机会 | 现状与证据 | 建议动作 | 优先级 |
|---|---|---|---|
| 健康阈值 | 5s/15s/3s（wiki: 健康监控 102；asr_health.rs 存在代码证） | 事件落库统计后标定 | P2 |
| ASR 指标可视化 | 引擎计数入质量报告（代码证注释） | 会话报告暴露（重打分率/降级/漂移分布） | P2 |
| GPU | **已定案：ASR 无 GPU 分支**（device_config 仅 OCR，代码证；wiki 混淆） | 不动作；sherpa-onnx 流式无 CUDA EP，上 GPU 不具性价比 | — |

### 3.8 评测基建（横切）

asr_eval harness + fixtures + CI 回归（§二）；错误画像与混淆闭环共用。

## 四、换芯评估框架（不被技术栈束缚，但过裁决门）

| 档 | 候选 | 裁决要点 |
|---|---|---|
| 同 crate 调参 | 现模型+链路 | 零风险，P0~P2 先行 |
| 同 crate 换模型 | sherpa 生态内（Paraformer-zh/新版 zipformer/在线 CTC，[官方模型表](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-ctc/index.html)） | asr_eval 同集裁决：CER×延迟×体积×热词支持 |
| 跨运行时 | FunASR 系（fsmn-vad/paraformer-streaming/ct-punc/cam++/三代热词）、FireRedASR v2（GPU 基准第一）、Qwen3-ASR（方言）、Fun-ASR-Nano（方言流式 ONNX） | **ADR 草案先行**：服务形态/GPU 依赖与本地单机架构冲突；产品场景是否买单 |
| 云端语音 | 语音上云 | **隐私红线**：默认不做；需独立授权决策 + ADR |

> 量级参考（[汇总文 2026-03，口径不一](https://cloud.tencent.com.cn/developer/article/2642961)）：普通话平均 CER FireRedASR2-LLM 2.89/AED 3.05、Qwen3-ASR 3.76；AISHELL-1 Paraformer-zh ~1.95、SenseVoice-Small ~3.0（各口径）。**不替代自测。**

## 五、分批路径（自验证门槛版）

| 批 | 内容 | 预估 | 退出标准（全部代码自验证） |
|---|---|---|---|
| P0 | asr_eval harness + fixtures 首批 + 首轮自测报告（有参考子集 CER/画像/漂移分布）；文档落差留痕（附 A 定案修订） | 1-2d | harness 交付；报告产出；cargo test 全绿 |
| P1 | DTW 接线；预处理默认定案；VAD/端点/融合/去重参数族 A/B 标定；热词加固+注入扩展；重打分积压验证 | 3-5d | 每项 asr_eval A/B 结论页；golden 回归零误删 |
| P2 | 会话全量离线精修（采纳/回退 UX）；混淆画像→纠错/热词闭环；可选 LLM 文本校对（默认关） | 3-5d | harness 前后 CER 对比；默认关合规；golden |
| P3 | 同 crate 换模型 spike；如需跨运行时 → ADR 草案；模型 VAD 重开评估（若 D5 通过） | 2-3d+ | 评测矩阵 + 裁决 |

## 六、纪律与红线

原料层永不可变（产物可逆+来源标记）；模型文件不入库、下载受限 TLS（本地归档先例）；**语音不出本机**，文本级 AI 走 content_gate 双闸门默认关+审计；参数改动可配置可回退（JSON 校准先例）+ golden 防误删；换推理栈 = ADR；**所有"需人工/真机"验收条目改为 harness/golden 自验证**（用户裁决 ①）。

## 七、决策稿（2026-09-03，待裁决）

| # | 决策点 | 选项 | 建议默认 |
|---|---|---|---|
| D0 | 验证路线 | 纯代码自验证（asr_eval+golden，本稿已按此改写） | ✅ 采纳（用户已定） |
| D1 | 首批立项范围 | A 仅 P0（harness+首轮报告+口径修订）｜B P0+P1｜C P0+P1+P2｜D 暂不立项只留文档 | A（先见尺子再调参） |
| D2 | 版本/需求归属 | 开 v0.20 系列（ASR 质量增强）｜并入 v0.19 系列尾批 | v0.20 系列；登记 REQ-263+（asr_eval/DTW 接线/参数标定/全量精修/画像闭环 依立项批登记） |
| D3 | Silero/GPU/DTW 口径修订 | 随 D1-A 一并修订规范文档（AGENTS 技术栈表/ADR-003 标注） | ✅ 随批修订（规范先行） |
| D4 | DTW 接线 | 随 P1 实施（低成本、确定性高） | ✅ |
| D5 | 重开模型 VAD 选型 | 暂缓（先标定能量 VAD 再量化差距）｜立项 spike | 暂缓 |
| D6 | 换芯（跨运行时/云端） | 全部暂缓至 P3 评测后｜仅同 crate 档立项 | 暂缓（附 B 模型情报保留备用） |

> 实施同步：需求池登记（依裁决批）＋ 版本文档（v0.20 或并入 v0.19）＋ AGENTS/ADR 口径修订提交。

## 附 A：wiki 断言 vs 代码核查清单

**已定案（代码证）**
1. wiki"ASR 模型管理页 GPU/CPU 自动选择" → GPU 决策仅属 OCR（device_config 引用面）。
2. wiki"说话人分离无实现" → 弱化版已实现（speaker_engine/speaker_change/commands_speaker）。
3. AGENTS 记"Silero VAD" → **代码零引用**（能量自适应 + sherpa 端点规则；ADR-003 原文待核）。
4. wiki"DTW spike 预留" → 属实：纯函数+测试齐备，**无生产调用点**。
5. rule1/2/3、hangover 3 块、rescore 3s、rule3 env → 与代码一致。

**待核查（实施时逐条互证）**：重打分积压（流式 135/349）；热词表外字 abort/下端点生效（模型管理 126/149/271）；健康阈值 5/15/3s（健康监控 102）；静音尾块丢弃（音频重采样 193）；边界段复核（去重净化 364）；word_timestamps None 近似（转写片段 101/118）；bigram O(nm)（去重净化 337）；噪声底静音块更新（音频捕获 185）；双声道取最大 RMS（音频重采样 300）。

## 附 B：外部参考（2026-09 检索）

- [中文开源 ASR 生态与 CER 汇总（2026-03）](https://cloud.tencent.com.cn/developer/article/2642961) · [sherpa-onnx 在线 CTC 模型](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-ctc/index.html)
- [FunASR README](https://raw.githubusercontent.com/alibaba-damo-academy/FunASR/main/README_zh.md) · [第三代热词方案](https://developer.aliyun.com/article/1587443)
- [FireRedASR](https://github.com/FireRedTeam/FireRedASR) · [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) · [Fun-ASR](https://github.com/FunAudioLLM/Fun-ASR) · [SenseVoice/FunAudioLLM 综述](https://developer.baidu.com/article/detail.html?id=7726618)
- [silero-vad-rust](https://lib.rs/crates/silero-vad-rust) · [FireRedChat-punc 标点](https://huggingface.co/FireRedTeam/FireRedChat-punc)
- 前沿：zero-shot trie 上下文偏置（[IEEE](https://xplorestaging.ieee.org/document/11249064)）· LLM-ASR 热词检索+RL（[arXiv 2512.21828](https://arxiv.org/abs/2512.21828v1)）
