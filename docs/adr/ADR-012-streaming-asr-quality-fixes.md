# ADR-012: 流式 ASR 质量修复（截断 / 短句 / 断句）

## 状态

已接受（2026-08-19；实施完成：F1-1/F1-2/F1-3/F2-1/F2-2/F2-3/F3-1/F3-2 全部落地，单测 691 通过 + 真实模型集成测试通过；真机验收（3 节课 CER 对比）待执行）

## 日期

2026-08-19

## 背景

用户实测反馈（2026-08-19）：实时课堂会话中，ASR 偶发**结尾识别不全**（如句末"结果"只输出"结"）、**短句不清晰**、**断句不准确**。要求先调研根因再规划修复方案（先零补丁排查，取证确认后放行补丁）。

### 取证调研（asr_forensic 诊断工具 + 原项目代码对照）

用 `src/bin/asr_forensic.rs`（开发期诊断 bin，离线 SenseVoice 复核会话原始音频）对 `session-audio/12.wav`、`13.wav` 取证，并对照原项目 `streamingAsr.ts` / `asrFilters.ts` / `sensevoiceRescore.ts`：

1. **截断根因（13.wav，正常电平 153s，16 段）**：离线 SenseVoice 整段转写与 DB 流式段逐字对应，但 4/16 段（25%）**真实尾字丢失**（介→介绍、从头→到尾、反→反本、一→一个人）——音频完整，流式链路丢字。机制：
   - **静音隔块喂入整块丢弃句尾弱音**：`SILENT_FEED_SKIP_COUNT=1` 时被判静音（200ms 块 RMS < 0.005）的块整块不喂入解码器；句尾降调弱音块恰落静音判定区间（13.wav 42% 块静音、3% 贴近阈值）。
   - **重打分门限移植回归**：原项目 `pickRescored` 用 **Jaccard ≥ 0.35**（"结果" vs "结" → 0.5 → 接受 → 能修截断）；Rust 移植改为**编辑距离 ≤ 较短文本 40%**（"结" vs "结果" → 距离 1 / 较短 1 字 = 100% → 拒绝）→ 截断场景重打分兜底完全失效。而 `sentence_pcm` 已完整累积（含被跳过的静音块），SenseVoice 输入完整——**只差门限放行**。
2. **断句根因（13.wav）**：8/16 段被 **rule3（5.0s 强制断句）句中硬切**（"那今天晚上我。" / "会用三个阶段…"被切两段）。且 Rust 版未移植原项目 `dedupeAcrossFinals`（跨 final 句尾重叠去重）——硬切后句尾词重复出现在下句开头的观感问题无防护。
3. **短句不清晰（12.wav，极低电平 425s）**：全文件峰值 RMS 仅 0.004 < 静音阈值 0.005 → 全部块判静音 → 流式输出大量错词（"总统一过去帮我们是做对诊断到两个钟的断挥单接"），离线转写正确。低电平是流式质量隐形杀手（AGC 场景，REQ-041 待微基准）。
4. **净化未移植**：原项目 `cleanAsrResult`（相邻重复压缩 + 幻觉过滤）未移植到 Rust 实时链路——partial/final 原样上屏（Zipformer 静音段"就是就是"式重复无防护）。

### 约束

本地优先、实时性（partial 延迟 < 1s）、静音期 CPU 优化（隔块喂入）保留、原项目已生产验证的净化/重打分经验补齐、全部改动可单测（AAA）。

## 决策

### F1-1：重打分"扩展接受"（截断核心修复，低风险）

`pick_rescored` 增加规则：**去标点/空白后，若流式文本是 SenseVoice 文本的前缀 → 接受 SenseVoice**（扩展部分 = 被链路丢弃的句尾）。前提：仅**尾静音端点**启用——引擎跟踪"自上次非静音 feed 以来的连续静音 feed 块数"（`trailing_silent_blocks`），端点时 ≥ 6 块（1.2s，与 rule2 对齐）判定为尾静音端点；rule3 强制端点（连续静音 < 1.2s）跳过扩展接受——防止"修复的尾字被下一段再次识别"造成重复。扩展长度设上限（≤ max(4, 流式文本长度)），防 SenseVoice 幻觉续写。

- 纯函数修改 + 单测（截断/短句/rule3 防重复/幻觉上限）
- 恢复原项目 Jaccard 门限的修复能力，同时比 Jaccard 更严格（前缀关系 = 无矛盾扩展，非字符集近似）

### F1-2：flush 补重打分（停止时尾句兜底）

`flush()` 时若 `sentence_pcm` 非空 → 走 `maybe_rescore`（与端点路径同机制）。当前 flush 直接取流内文本无兜底，与端点行为不一致。

### F1-3：VAD hangover（句尾预防层，中风险）

`feed()` 的静音跳过逻辑增加 hangover：自上次非静音 feed 起 ≤ 3 块（600ms）内的静音块**不跳过、正常喂入**（解码），之后才恢复隔块喂入。句尾弱音块不再被整块丢弃（预防层，与 F1-1 修复层双保险）。CPU 影响可忽略（仅语音结束瞬时多解码 3 块，静音期长段仍隔块喂入）。

### F2-1：短句重打分门限放宽（短句核心修复）

`pick_rescored` 对短句（去标点后 ≤ 4 字）单独放宽：**编辑距离 ≤ 1 或前后缀关系 → 接受 SenseVoice**。流式 transducer 短句上下文不足是模型固有，SenseVoice 整句上下文更准；40% 相对门限对短文本过于苛刻（1 字差异即 100%）。

### F2-2：移植 cleanAsrResult（净化）

移植原项目 `asrFilters.ts` 的 `collapseAdjacentDuplicates` + `isLikelyHallucination` 为 Rust 纯函数模块（可复用 `verbal_normalize::compress_repeats` 的重复压缩逻辑，幻觉过滤按原规则移植），应用于流式 partial/final 推送前（`streaming_asr.rs` 输出路径）。消除"就是就是"式重复与纯标点/灌水幻觉。

### F3-1：rule3 可配置 + 默认 5s → 8s（断句）

`rule3_min_utterance_length` 由常量 5.0 改为可配置（`StreamingAsrConfig`，默认 8.0；env `ENTROPY_ASR_RULE3_SECS` 覆盖）。8s 覆盖课堂句子典型时长（3-8s），减少句中硬切；仍保留"超长句兜底断句"语义（原 20s 过长、5s 过短）。

### F3-2：移植 dedupeAcrossFinals（跨 final 重叠去重）

移植原项目 `dedupeAcrossFinals`（后缀-前缀重叠 ≥ 2 字 → 截断后句重复前缀；上限 8 字防 O(n²)）到编排层（`live_session.rs` final 事件路径，跟踪上一 final 文本）。rule3 硬切/端点误断句的句尾词重复不再上屏。

### F2-3：低电平 AGC 仅 env 开关（本期不默认开）

12.wav 证实低电平场景存在且流式质量崩坏。本期实现 `AudioPreprocessConfig` 的 env 开关接入（`ENTROPY_AUDIO_PREPROC=1` 启用 AGC + 动态阈值链，已有模块 `audio_preprocess.rs` 只缺生产接入点），默认仍关——默认值决策留给 REQ-041 微基准（CER 对比），不背决策流程。设计文档记录 12.wav 证据与建议。

## 备选方案

### 方案 A：仅调参不补丁（先零补丁路线）
- 结论：端点参数（rule1/2/3）、`SILENCE_RMS_THRESHOLD`、`SILENT_FEED_SKIP_COUNT` 全部硬编码无 env/UI 开关；唯一可用旋钮 `VAD_ADAPTIVE=0` 与热词/音量操作——取证证明截断根因在链路内部（音频完整、流式丢字），调参无法修复移植回归（门限）与静音跳过丢块。**已取证否定，转方案 B**。

### 方案 B：最小补丁组合（选择）
- F1-1/F1-2/F2-1/F3-1/F3-2（纯函数 + 引擎局部改动，全部可单测）+ F1-3（hangover 预防）+ F2-2（净化移植）+ F2-3（env 开关）
- 优点：证据驱动、每项独立可测可回滚、不换模型不增内存、保留静音期 CPU 优化
- 缺点：需要代码改动（用户已确认放行）；短句中硬错误（如"无法医治"≠"无反的机制"）非截断型，重打分仍难兜底（模型层局限，留待热词/后续模型升级）

### 方案 C：双引擎字符级对齐融合
- 端点后 Zipformer 与 SenseVoice 逐字对齐取并集（补尾 + 替换错词）。优点：修复能力上限最高；缺点：复杂度高、回归风险大、对齐正确性难验证。**本期不做**，列为后续候选（F1-1 前缀接受已覆盖其大部分收益场景）。

## 影响

### 正面影响
- 截断：25% 段尾字丢失 → 尾静音端点场景归零（F1-1 修复 + F1-3 预防）
- 断句：rule3 硬切减半（5s→8s），跨 final 重复消除（F3-2）
- 短句：门限放宽 + 净化，SenseVoice 兜底恢复原项目能力（F2-1/F2-2）
- 低电平：env 开关先行实测（F2-3）

### 负面影响 / 代价
- rule3 8s：单段最长 8s 才出 final（实时字幕延迟上限 +3s，可接受；partial 实时性不受影响）
- 扩展接受：SenseVoice 幻觉续写风险（扩展上限 + 仅尾静音端点双约束）
- hangover：语音结束瞬时 CPU 略升（3 块解码，可忽略）

### 风险
- F1-1 的 rule3 判别依赖引擎内部连续静音计数——与 sherpa 端点状态机可能不同步（边界场景由扩展上限兜底）
- F2-1 短句放宽可能引入 SenseVoice 错误替换（短句 SenseVoice 整体更准，风险低；门限 ≤1 字保守）

## 合规性验证

- [x] 单测（AAA）：pick_rescored 扩展接受（截断/短句/rule3 防重复/幻觉上限）、hangover 喂入决策、clean/dedupe 移植（原项目用例）——691 通过
- [x] 集成测试（真实模型）：加载/喂入/flush 不崩溃（hangover/config/clean 路径）——通过
- [x] 回归：静音期 CPU（隔块喂入在 hangover 外仍生效——silence_feed_decision 单测覆盖）、partial 节流行为不变（代码路径未动）
- [ ] 真机验收：3 节课对比，句尾丢字率下降 ≥80%，短句错误率下降，无新增重复段
- [x] 取证工具 `asr_forensic` 保留（开发期诊断，不入产品包）

## 相关决策

- ADR-003: 流式 ASR 引擎与模型分发（本次为质量修复修订）
- REQ-041: 音频预处理（AGC/降噪，微基准后定默认——F2-3 遵循）
- 原项目参照：`client/electron/ai/local-asr/streamingAsr.ts`、`sensevoiceRescore.ts`、`client/src/lib/capture/asrFilters.ts`

## 参考

- 取证报告：`forensic-report-13.txt`（13.wav 离线复核与 RMS 统计）
- 诊断工具：`src/bin/asr_forensic.rs`
