# 统一信号事件表设计（REQ-108 M-存储·POST-O3 上调）

> **状态**: 设计定稿（2026-08-19，v0.7.0 M1.5 实施）
> **关联**: [v0.7.0 版本文档](../../versions/v0.7.0.md) REQ-108 · [三阶段管线深度优化](../analysis-classroom-assistant-pipeline-deep-optimization.md)（POST-D3 章节检测消费近似信号缺陷）· [需求裁决表](../requirements-decision-table-classroom-assistant-deepening.md)

## 一、问题

章节检测（`analysis.rs` build_chapter_signals）目前用**近似信号**：OCR 块文本出现（新文字=画面切换近似）与段间 gap（>2s=长静音近似）。实时链路中真实的帧切换/长静音事件**未落库**——课后分析拿不到真实信号，章节边界精度受限于近似（POST-D3）。

## 二、方案

新增 `session_events` 表：实时链路各类事件统一落库（一次 schema、消费端分批接线）。章节检测改为消费真实事件（frame_switch/long_silence），保留 OCR/gap 近似作为无事件数据的旧会话兜底。

## 三、Schema

```sql
-- 会话信号事件表（REQ-108：统一落库，章节检测/实践段标记/周报备数据消费）
CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    -- 事件类型：frame_switch | long_silence | volume_surge | vad_segment
    --           | clipboard | foreground_switch | player_behavior
    kind TEXT NOT NULL,
    -- 事件时刻（相对会话起点，ms）
    timestamp_ms INTEGER NOT NULL,
    -- 事件载荷（JSON；按类型：时长/窗口标题/播放器动作等）
    payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id, timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_events_kind ON session_events(session_id, kind);
```

### 事件类型与载荷

| kind | 产生方 | payload 字段 | 消费方 |
|------|--------|-------------|--------|
| `frame_switch` | 屏幕 worker（帧 diff 判定画面切换） | `{}`（时刻即信息） | 章节检测（REQ-108） |
| `long_silence` | 音频循环（VAD 连续静音 ≥ 阈值） | `{"duration_ms": N}` | 章节检测（REQ-108）、练习段（REQ-070） |
| `volume_surge` | 音频循环（段 RMS 骤变） | `{"delta": 0.3}` | 重点标注（REQ-103 已接线段级，事件为冗余备源） |
| `vad_segment` | 音频循环（VAD 段边界） | `{"start_ms":..,"end_ms":..}` | 讲者（V1.0）、语速统计（REQ-109） |
| `clipboard` | 剪贴板监听（REQ-104） | `{"preview": "前30字符"}` | 热词候选（已接线）、产物信号 |
| `foreground_switch` | 前台窗口监听（REQ-128） | `{"title": "窗口标题"}` | 实践段标记（REQ-128）、周报（V1.0） |
| `player_behavior` | 播放器行为检测（REQ-125） | `{"action": "seek|pause|speed", "value": 2.0}` | 难点信号（REQ-125） |

### 容量与写放大控制（分级落库）

实时链路高频事件（vad_segment 每段一次、frame_switch 每切换一次）直接写库有写放大风险。分级：

1. **高频信号**（frame_switch/long_silence/volume_surge）：**实时写入**——频率本身低（秒级），且是章节检测主信号，落库换取"章节检测真实化"的核心收益。
2. **中频**（vad_segment）：仅**段落级**写入（不写块级），单会话典型 ≤ 数百条，可接受。
3. **低频**（clipboard/foreground_switch/player_behavior）：用户行为，天然低频，实时写入。

预算：典型 2h 会话 ≈ 100-300 事件（<1MB），无写放大风险。预留：若实测超标（真机验收），vad_segment 降级为聚合摘要写入。

## 四、模块设计

- `session_events.rs`：`EventKind` 枚举（kebab-case serde）+ `SessionEvent`/`NewSessionEvent` 类型 + `db.add_event/batch_add_events/list_events`（db_sessions.rs 增补）。
- 写入方：
  - `live_session_loop.rs`：long_silence（静音连续计数达阈值 3s 时写）、volume_surge（段 RMS 与上段差 ≥0.3 时写，复用 REQ-103 聚合值）、vad_segment（Final 落库时顺带）。
  - `live_session_frame.rs`/`live_frame_process.rs`：frame_switch（帧 diff 判定切换时写）。
  - `clipboard_signal.rs`：clipboard（record_copy 时顺带写）。
  - 新增前台监听（REQ-128）与播放器检测（REQ-125）：M2 实施。
- 消费方：`analysis.rs` build_chapter_signals 优先读 `session_events`（frame_switch/long_silence），无事件数据的旧会话回退 OCR/gap 近似（零回归）。

## 五、兼容性

- 新表 CREATE IF NOT EXISTS——旧库自动建表（无需迁移列）。
- 旧会话（v0.7.0 前）无事件数据 → 近似信号路径保持（消费端 fallback，注释标注来源）。
- 章节检测 API 不变（ChapterSignal 输出不变）。

## 六、验收

- 事件表 roundtrip 单测（各类型写入/读取/按会话按类型过滤）；
- 章节检测消费真实事件（合成事件序列 → 章节边界）单测；
- 旧会话零回归（无事件 → 近似路径行为不变）；
- 真机会话事件量统计（容量验证，写放大核查）。
