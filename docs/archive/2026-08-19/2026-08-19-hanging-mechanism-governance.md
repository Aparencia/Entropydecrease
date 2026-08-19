# 悬空机制治理决策记录（REQ-099 X-O1）

> **状态**: 已决策（2026-08-19，v0.7.0 M1 实施）
> **关联**: [需求裁决表](../requirements-decision-table-classroom-assistant-deepening.md) §7.4 X-O1 · [三阶段管线深度优化](../analysis-classroom-assistant-pipeline-deep-optimization.md)（PRE/CORE/POST 缺陷源）· [v0.7.0 版本文档](../../versions/v0.7.0.md) REQ-099

## 背景

深度优化分析发现最大模式：**"机制代码+测试都在，生产链路没接或没数据"**——已交付但无效的信任损耗。四处悬空机制（PRE-D1 预处理链 / POST-D1 讲者 / POST-D2 音量骤变 / CORE-D5 DTW）逐个决策：接线 / 移除 / 诚实占位。

## 决策矩阵

| # | 悬空机制 | 现状（2026-08-19 核查） | 决策 | 实施路径 |
|---|---------|------------------------|------|---------|
| 1 | **PRE-D1 音频预处理链**（AGC/削波检测/动态静音阈值，`audio_preprocess.rs`） | 代码+单测完备；生产链路默认关，仅 env `ENTROPY_AUDIO_PREPROC=1` 可开；无默认值数据支撑 | **接线（闭环）** → REQ-101 | S4 落盘音频 CER 微基准 → 定 AGC/动态阈值默认值 → 设置 UI 开关。本版完成 REQ-101 全链路 |
| 2 | **POST-D1 讲者/说话人**（`speaker_change.rs` + `analysis.rs` speaker_detect 规则） | `analysis.rs` 调 `detect_speaker_changes(&[])` 恒返回空——**空转死代码**（embedding 模型分发留 V1.0） | **诚实降级** → REQ-102 | 移除空转调用，显式空列表 + 注释标注不可用（期望落差消除）；`speaker_detect` 规则开关保留（档案声明，V1.0 接线）；产物模板无恒空讲者字段 |
| 3 | **POST-D2 段级音量骤变**（`highlight_detect.rs` 音量骤变信号） | `analysis.rs` SegmentInput.volume 恒 `None`——信号永远不触发（三信号只剩二信号） | **接线** → REQ-103 | 实时链路按段聚合 RMS → `session_segments.volume` 新列（ensure_column 幂等迁移）→ analysis 读落库值 → 音量骤变信号激活（重点标注三信号全亮） |
| 4 | **CORE-D5 DTW 时序对齐**（`dtw_align.rs`，REQ-063） | 已接入融合链路（spike 实测有漂移收益）；CORE-O4 实测场景留待真机验收 | **机制先行（保持）** | 保持现状；CORE-O4 在 v0.6.0 M7 真机验收清单执行——无收益证据则裁剪（验收后决策） |

## 治理结果

- **无"已交付但无效"机制残留**：① 空转调用移除（讲者）；② 恒 None 输入接线（音量）；③ env 门控转正式开关（预处理链）；④ 机制先行挂验收（DTW）。
- 每项均有测试覆盖：REQ-101 CER 基准、REQ-102 空列表降级、REQ-103 合成样本三信号。

## 变更清单（v0.7.0 M1）

| 文件 | 变更 |
|------|------|
| `analysis.rs` | 讲者恒空调用移除（REQ-102）；SegmentInput.volume 接落库值（REQ-103） |
| `live_session_loop.rs` / `live_session_persist.rs` | 段 RMS 聚合 + volume 落库（REQ-103） |
| `db.rs` / `db_sessions.rs` / `db_sessions_rows.rs` / `types.rs` | `session_segments.volume` 列迁移 + 读写（REQ-103） |
| `fusion.rs` / `live_keyframes.rs` | FusedSegment.volume 透传（REQ-103） |
| `audio_preprocess.rs` + 设置面板 | 预处理链 CER 基准 + 默认值 + UI 开关（REQ-101） |
| `import.rs` / `asr.rs` / `note_filter.rs` | TranscriptSegment.volume 构造点补齐（None=未知） |
