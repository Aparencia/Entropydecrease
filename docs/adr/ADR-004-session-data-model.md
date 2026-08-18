# ADR-004: 会话管理数据模型方案

## 状态

已接受（Accepted，2026-08-18）

## 日期

2026-08-18

## 背景

v0.2.0（REQ-010）需要会话管理：每次学习 = 一个会话，可列表/详情/检索。v0.1.0 的数据层只有 notes 表，转写段（TranscriptSegment）与 OCR 块（OcrBlock）只存在于内存，会话结束后即丢失——无法追溯"这节课讲了什么、字幕在什么时间出现"。

需求约束：

- 会话是"课堂助手实时捕获"的主产物，转写段与 OCR 块需要与时间轴对齐存储（REQ-012 融合结果也需落库）
- 会话产物可一键转为笔记（复用 v0.1.0 的 `save_draft_as_note` / 拼接逻辑），但会话本身独立存在（可多次转笔记、可删除会话不影响已有笔记）
- 检索维度：标题 / 创建时间 / 关键词（转写内容）
- SQLite（rusqlite bundled）已定，本地优先，数据不出本机

## 决策

我们将扩展 SQLite schema，新增三张表（在 `db.rs` 的 `open` 中同批次建表，遵守迁移约定）：

```sql
-- 会话主表
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    source_window TEXT,          -- 目标窗口标题（可空：文件导入会话）
    started_at INTEGER NOT NULL, -- Unix 秒
    ended_at INTEGER,            -- 可空：进行中会话
    status TEXT NOT NULL DEFAULT 'recording'  -- recording | finished | failed
);

-- 会话转写段（ASR final 段 + 融合段统一落此表）
CREATE TABLE IF NOT EXISTS session_segments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'asr',  -- asr | subtitle | fused
    confidence REAL
);
CREATE INDEX IF NOT EXISTS idx_segments_session ON session_segments(session_id, start_ms);

-- 会话 OCR 块（关键帧画面文字 + 字幕区文字）
CREATE TABLE IF NOT EXISTS session_ocr_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    score REAL NOT NULL,
    region TEXT NOT NULL DEFAULT 'full'  -- subtitle | full（字幕区/全帧）
);
CREATE INDEX IF NOT EXISTS idx_ocr_blocks_session ON session_ocr_blocks(session_id, timestamp_ms);
```

配套设计：

1. **数据契约**：types.rs 新增 `Session` / `NewSession` / `SessionSegment` / `SessionOcrBlock` 类型；`TranscriptSegment`/`OcrBlock` 保持为内存态（引擎层产物），落库时映射为带 session_id 的行
2. **Db 扩展**：`create_session` / `finish_session` / `list_sessions`（分页+关键词）/ `get_session` / `delete_session`（级联删除子表）/ `add_segment` / `add_ocr_block` / `list_segment_by_session` / `list_ocr_blocks_by_session`
3. **command 层**：`create_session` / `finish_session` / `list_sessions(keyword?)` / `get_session_detail(id)` / `delete_session(id)` / `session_to_note(id, title?)`（复用 concat::build_note_draft 生成笔记）
4. **写入策略**：转写段与 OCR 块**实时落库**（每 final 段/每去重后字幕块即 insert），应用崩溃不丢已识别内容；批量插入用事务（100 段/批）控制写入频率
5. **外键约束**：rusqlite 默认外键关闭，`open` 时执行 `PRAGMA foreign_keys = ON`；删除会话级联清理子表

## 备选方案

### 方案 A：三表 + 实时落库（选择）
- 优点：时间轴对齐查询直观；崩溃不丢数据；与 v0.1.0 笔记数据解耦清晰
- 缺点：写入频率高（需事务批处理）；表数量增加
- 适用场景：实时捕获会话（本阶段主场景）

### 方案 B：会话主表 + 转写/OCR 存 JSON 列（单表 blob）
- 优点：schema 简单；写入快（整体覆盖）
- 缺点：无法按时间轴查询单段（详情页需全量加载 JSON 解析）；增量更新需整表重写；检索（REQ-010 按内容检索）需 LIKE 全表扫
- 适用场景：轻量记录场景

### 方案 C：复用 notes 表 + source 标记
- 优点：零新表
- 缺点：笔记是"可编辑产物"而会话是"原始记录"，语义混淆；会话的段级检索/时间轴对齐无处安放；删除会话会污染笔记历史
- 适用场景：无追溯需求的最小实现

## 选择理由

- **时间轴对齐是会话详情页的核心能力**（转写段 ↔ OCR 块按 start_ms 对齐展示，REQ-012 融合依赖），行级存储是唯一支撑方案
- **崩溃安全**符合本地优先架构的可靠性预期（录制中杀进程 → 重开应用仍可见已识别内容）
- 与 v0.1.0 数据层风格一致（db.rs 的 CRUD + 单测模式直接扩展）

## 影响

### 正面影响
- 会话可追溯、可检索（标题/时间/内容关键词）
- 为 V1.0 的"转写时间轴回放与可编辑"（REQ-023）铺好数据基础
- 会话 ↔ 笔记一键转换（复用拼接），闭环完整

### 负面影响 / 代价
- 实时落库的写入吞吐：需事务批处理（每批 ≤100 段），索引维护开销可控（会话粒度数据量小）
- schema 变更需迁移管理：v0.2.0 为新增表（`CREATE TABLE IF NOT EXISTS` 幂等），无破坏性变更

### 风险
- 会话进行中崩溃 → status 停留 recording：启动时扫描 `status='recording'` 的会话标记为 `failed`（恢复策略）
- 长会话（>2h）段数过多：分页查询（LIMIT/OFFSET）保证详情页流畅

## 合规性验证

- [ ] `cargo test`：会话 CRUD + 级联删除 + 分页/关键词检索单测全绿
- [ ] 模拟 1000 段批量写入 < 500ms（事务批处理生效）
- [ ] 删除会话 → 子表行级联清除（外键生效，`PRAGMA foreign_keys=ON` 验证）
- [ ] 会话转笔记：session_segments + session_ocr_blocks → `build_note_draft` 输出与手工输入一致
- [ ] 启动时 recording 残留会话被标记 failed（单测覆盖）

## 相关决策

- ADR-005: 字幕 OCR 与双源转写融合方案（融合段以 `source='fused'` 落入 session_segments）
- 关联：v0.1.0 db.rs schema（notes 表保持不变，向后兼容）

## 参考

- v0.1.0 `app/src-tauri/src/db.rs`（现有数据层模式）
- [rusqlite 外键文档](https://docs.rs/rusqlite/latest/rusqlite/struct.Connection.html)
