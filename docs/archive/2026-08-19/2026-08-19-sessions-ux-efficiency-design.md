# 会话页交互与效率增强设计（v0.7.1）

> 状态：已获用户批准（设计评审 2026-08-19，第 1/2 节均确认）
> 对应代码：`app/src-tauri/src/commands_session.rs`、`app/src-tauri/src/db_sessions.rs`、`app/src-tauri/src/db.rs`、`app/src-tauri/src/db_notes.rs`、`app/src-tauri/src/types.rs`、`app/src/pages/SessionsPage.tsx`、`app/src/pages/NotesPage.tsx`、`app/src/App.tsx`、`app/src/types.ts`

## 1. 背景与目标

会话页（`SessionsPage.tsx`）当前是"档案浏览"式双栏布局：左侧 300px 列表（标题搜索 + 课程分组 + 段搜索三个功能堆叠），右侧详情（时间轴/OCR/三视图）。v0.6.0 M6 密集叠加了质量报告/大纲/课程分组/段搜索/降级横幅/笔记预览，但交互仍是内联样式 + 原生控件，无空态/加载态/批量/筛选/状态实时性。

用户确认的核心场景：**会话库是"视频→笔记"的生产流水线**（课堂助手产出会话 → 会话库管理并转化为笔记）。头脑风暴确认的五个痛点：

| # | 痛点 | 根因 |
|---|------|------|
| P1 | 转化状态不可见 | 列表无"已转/未转"标记；数据模型根本没有会话↔笔记关联 |
| P2 | 转化流程繁琐无批量 | 必须进详情 → 切预览视图 → 点转笔记（4 步）；逐个操作 |
| P3 | 会话↔笔记关联弱 | `notes.source='classroom'` 无 session_id，无法互跳 |
| P4 | 列表不可筛不可批 | 无状态/转化筛选、无排序、无批量删除 |
| P5 | 会话状态更新缓慢（已完成仍显示"采集中"） | 页面 `display:none` 保持挂载（TD-004），列表只在挂载时加载一次，应用生命周期内几乎不刷新 |

### 用户已确认的决策

- 方向：**交互与效率增强**（不做视觉设计系统重做；详情页阅读体验 L3 层本次不做，留后续）。
- 方案：**A+B 合并**（管理控制台 + 转化流水线），即 L1 数据层 + L2 列表层。
- 边界：前端 + 少量后端配合（允许改 Rust 命令/数据查询）。
- 版本：登记为小版本 **v0.7.1**（会话体验批次），独立版本文档与需求条目。

## 2. 核心设计

| 痛点 | 对策 |
|------|------|
| 转化状态不可见 | 列表直接显示已转/未转徽标 + 转化状态筛选 |
| 转化流程繁琐无批量 | 列表内联「转笔记」按钮（4 步→1 步）+ 批量转笔记 |
| 会话↔笔记关联弱 | 双向互跳：会话→笔记、笔记→来源会话 |
| 列表不可筛不可批 | 状态/转化筛选 + 排序 + 批量删除 |
| 状态更新缓慢 | 事件驱动刷新 + 页面激活刷新 |

## 3. L1 数据层（Rust）

### 3.1 `notes` 表加 `session_id` 列（数据模型变更，AGENTS §10 审查项）

- `db.rs`：`ensure_column` 迁移（沿用 profile/region_kind/volume 既有模式）+ `idx_notes_session` 索引。
- `types.rs`：`NewNote` 加 `session_id: Option<i64>`；`Note` 加 `session_id: Option<i64>`（serde 可选，旧行 NULL）。
- `db_notes.rs`：`create_note` 写入 session_id；新增 `find_note_by_session(id) -> Option<Note>`（按 created_at 取最新）。
- **外键语义：`ON DELETE SET NULL`**——删除会话只断开关联、**不删笔记**（笔记是用户资产，级联删除笔记不可接受）。
- **旧数据诚实处理**：历史 `source='classroom'` 笔记无关联信息 → 保持 NULL，老会话显示"未转"，不猜不填；用户可在详情页重新转换建立关联。

### 3.2 新契约 `SessionListItem`（不动既有 `Session` 结构，隔离风险）

```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListItem {
    pub session: Session,
    pub has_note: bool,          // 存在关联笔记（find_note_by_session 非空）
    pub note_id: Option<i64>,    // 最新关联笔记
    pub note_title: Option<String>,
    pub has_content: bool,       // 有转写段或 OCR 块 → "待转化"判定依据
}
```

- `list_sessions` / `list_session_courses` 均返回带标记条目（课程分组模式同样显示转化状态）。
- 实现：SQL 子查询（`EXISTS` segments/ocr_blocks + 最新笔记子查询），列表 ≤200 条量级，开销可忽略。
- `CourseGroup.sessions` 类型同步为 `Vec<SessionListItem>`。

### 3.3 批量转笔记 `batch_session_to_note(ids: Vec<i64>)`

- 校验：去重、≤50、逐条 id>0。
- 从 `session_to_note` 提取内部 helper `convert_to_note(...)` 共用（延续 REQ-081/082"单一管线"原则：批量与单条输出一致）。
- **部分成功语义**：单条失败不阻塞其他；返回 `BatchNoteResult { converted: Vec<{id, note_id}>, skipped: Vec<{id, reason}> }`，原因含"进行中的会话不能生成笔记 / 已转笔记 / 会话不存在"。
- 批量转**跳过已有笔记**的会话（防重复笔记）；详情页「转为笔记」保留 = 有意的重新生成（新笔记 + 新关联，历史保留）。
- `lib.rs` 注册新命令。

## 4. L2 列表层（前端）

### 4.1 列表项重设计（两行式）

```
[☐] 眼影晕染手法（B站教程）               [✓已转] / [●录制中]
    #12 · 08-19 14:30 · 42分钟 · 浏览器     [转笔记] / [查看笔记→]
```

- 状态徽标：录制中（红点脉冲）/ 已完成 / 异常 / 已转笔记（绿 ✓）。
- **内联「转笔记」**：仅 finished/failed + 有内容 + 未转显示；点击直接调 `session_to_note`（快速路径，与详情页按钮同管线）；转完行内变「查看笔记 →」。
- 时长显示：finished 用 `ended_at - started_at`（mm:ss / h:mm:ss）；录制中显示"进行中"。
- 复选框 hover 显现 → 批量选择模式。

### 4.2 筛选、排序、搜索整合

- 工具条一行：状态筛选（全部/录制中/已完成/异常）+ 转化筛选（全部/未转/已转）+ 排序（时间↓/时间↑/时长）+ 课程分组开关。
- 筛选全部**前端本地过滤**（数据已在 SessionListItem）→ 即时响应、零后端改动；与课程分组叠加生效。
- 两个搜索框合并为一个 + 模式切换（`标题 | 转写内容`）：标题模式本地过滤，内容模式调 `search_session_segments`。

### 4.3 批量操作

- 勾选后底部浮动操作栏：批量转笔记（跳过已转/进行中，结果计数提示）+ 批量删除（确认框说明"删除转写/OCR/图集，关联笔记保留"）。
- 全选当前筛选结果。

### 4.4 状态实时性

- `SessionsPage` 加 `active: boolean` prop（App 层传，仿 focusSessionId 模式）→ 切到会话页时刷新列表，根治 display:none 挂载不刷新。
- 事件监听增强：`live:status`（payload 非 recording → 刷新）、`session:fused`（刷新 + 详情联动，已有逻辑保留）。
- 新完成提示条：刷新前后对比出新 finished 会话 → "📬 N 个会话已完成采集"（点击直达，一次性）。
- 操作反馈升级为右上角 toast（3s 自动消失，自绘不引库），替代现有蓝色小字 status。

### 4.5 空态/加载态

- 无会话 → 引导去课堂助手；筛选无结果 → 「清除筛选」按钮；首次加载骨架提示。

### 4.6 会话 ↔ 笔记双向互跳

- 会话页「查看笔记 →」：`App.setPage("notes")` + `focusNoteId`（复用 focusSessionId 模式）。
- 笔记页：`NotesPage` 支持 `focusNoteId` 定位；笔记行显示「来源会话 →」（有 session_id 时），点击 `onOpenSessions(id)` 跳回会话页 + `focusSessionId`（机制已存在，对称复用）。
- `App.tsx`：新增 `focusNoteId` 状态与 `onOpenSessions` 透传。

## 5. 文件改动清单

**Rust 侧（`app/src-tauri/src/`）**

| 文件 | 改动 |
|------|------|
| `db.rs` | notes 表 session_id 列迁移（`ensure_column` + 索引） |
| `types.rs` | `NewNote`/`Note` 加 session_id；新增 `SessionListItem`、`BatchNoteResult` |
| `db_notes.rs` | `create_note` 写 session_id；新增 `find_note_by_session` |
| `db_sessions.rs` | `list_sessions` 返回 `Vec<SessionListItem>`（子查询） |
| `commands_session.rs` | 提取 `convert_to_note` helper；`session_to_note` 带 session_id；新增 `batch_session_to_note`；`list_session_courses` 返回标记条目 |
| `lib.rs` | 注册 `batch_session_to_note` |

**前端（`app/src/`）**

| 文件 | 改动 |
|------|------|
| `types.ts` | `SessionListItem`、`BatchNoteResult`；`Note` 加 `session_id?`；`CourseGroup.sessions` 同步 |
| `SessionsPage.tsx` | 列表层重构：徽标/内联转化/筛选排序/批量/toast/空态；`active` prop + 事件刷新 |
| `App.tsx` | `active` prop 传递；`focusNoteId` 状态；`onOpenSessions` 透传 |
| `NotesPage.tsx` | `focusNoteId` 定位 + 「来源会话 →」跳转 |

## 6. 测试计划

**Rust 单测**（AAA，`:memory:` 隔离库）：
1. 迁移：无 session_id 列的旧库 open 后列补齐、旧笔记 NULL。
2. `list_sessions` 标记四象限：有笔记无内容 / 有内容无笔记 / 都有 / 都没有。
3. 删除会话 → 笔记保留、关联断开（SET NULL 生效）。
4. `find_note_by_session`：无 / 单 / 多次转换取最新。
5. `batch_session_to_note`：全成功 / 部分失败不阻塞 / 重复 id 去重 / >50 拒绝 / 录制中跳过 / 已转跳过 / 失败原因回传。
6. `session_to_note` 落库带 session_id（与 preview 输出一致性回归）。
7. 全量 `cargo test` + `cargo clippy` 回归。

**前端**：无 Vitest 基建 → 手动验证清单（见验收标准）。

## 7. 验收标准

- [ ] 会话完成采集后，会话页列表无需任何操作自动变"已完成"（≤2s），不再残留"录制中"。
- [ ] 行内「转笔记」→ ≤1s 显示「查看笔记 →」；点击跳笔记页并定位该笔记；笔记页可见「来源会话 →」可跳回。
- [ ] 批量转：已转/录制中/失败会话被正确跳过并计数提示；批量删除后笔记仍在（确认框已说明）。
- [ ] 筛选（状态/转化）+ 排序 + 课程分组叠加正确；两个搜索模式切换正确。
- [ ] 空态引导 / 无结果"清除筛选" / toast 反馈可见。
- [ ] 详情页「转为笔记」仍可用（有意重新生成 → 新笔记、关联指向最新）。
- [ ] `cargo test` 全绿、clippy 无新增告警、新增/改动文件 ≤300 行。

## 8. 文档与规范动作

- 本设计文档（`docs/archive/2026-08-19/2026-08-19-sessions-ux-efficiency-design.md`，[ ] 已归档）。
- **ADR**：notes↔sessions 关联数据模型（AGENTS §10 硬性要求）。
- 需求池登记：新增 REQ 条目（转化状态可视化 + 批量转化 + 双向关联），目标版本 **v0.7.1**。
- 版本沉淀：`docs/versions/v0.7.1.md`（小版本发版文档）。
- CHANGELOG 同步。

## 9. 边界与诚实声明

- 历史 `classroom` 笔记无法追溯归属会话 → 显示未转（不猜不填）；用户可在详情页重新转换建立关联。
- 一个会话多次转换 → has_note 指向最新一篇；历史笔记保留可手动删。
- 批量转只对"有内容 + 未转 + 已结束"生效，其余跳过并说明原因（不静默）。
- L3 详情层（段搜索命中滚动修复、大纲↔时间轴联动高亮）本次不做，留后续批次。
