# ADR-014: 会话↔笔记关联与批量转化（notes.session_id 列 + SessionListItem 标记）

## 状态

已接受（2026-08-19 用户评审：会话页交互与效率增强——管理控制台 + 转化流水线）

## 日期

2026-08-19

## 背景

会话页被用户定位为"视频→笔记"的生产流水线（课堂助手产出会话 → 会话库管理并转化为笔记）。头脑风暴确认五个痛点，其中三个根因指向数据模型缺口：

1. **转化状态不可见**：`notes.source='classroom'` 不记录来源会话——数据模型无法回答"该会话转没转过笔记"，列表无法显示已转/未转。
2. **会话↔笔记关联弱**：无关联链路，双向互跳（会话→笔记、笔记→来源会话）不可实现。
3. **转化流程繁琐无批量**：必须进详情 → 切预览视图 → 点转笔记（4 步）；无批量转化命令。

另有列表管理类痛点（不可筛不可批、状态过期不刷新）为纯前端/事件层问题，不涉及数据模型。

约束：`Session` 结构被 `list_sessions`/`get_session_detail`/`list_session_courses`/前端多处消费，直接加字段需改全部构造点与 serde 契约，风险高；删除会话的既有语义是级联删除子表（转写/OCR/产物），但**笔记是用户资产，不应随会话级联删除**。

## 决策

1. **notes 表加 `session_id` 列**（`ensure_column` 幂等迁移，`ON DELETE SET NULL` + `idx_notes_session` 索引）：
   - 删除会话只断开关联、不删笔记（SET NULL 语义——与级联删除转写/OCR/图集的既有行为刻意区分）。
   - 旧数据诚实处理：历史 `classroom` 笔记无关联信息 → 保持 NULL（不猜不填）；用户可在详情页重新转换建立关联。
   - 一个会话可多次转换（详情页"转为笔记"= 有意的重新生成）：`find_note_by_session` 按 `created_at DESC, id DESC` 取最新，历史笔记保留可手动删。
   - 手写笔记（create_note/save_draft_as_note/process_to_note）不写 session_id（手动路径无来源会话）；`artifact_to_note` 写 session_id（产物→笔记同样是会话转化，has_note 口径统一）。

2. **新契约 `SessionListItem`**（包装而非扩展 `Session`，隔离风险）：
   - `{ session, has_note, note_id, note_title, has_content }`，camelCase 序列化（与 CourseGroup/SegmentHit 同口径）。
   - `list_sessions` / `list_session_courses` 均返回带标记条目（课程分组模式同样显示转化状态）。
   - `has_content`（有转写段或 OCR 块）为"待转化"判定依据——空会话不进入待转。
   - 实现：SQL 子查询（EXISTS + 最新笔记子查询），列表 ≤200 条量级，零额外往返。

3. **批量转笔记 `batch_session_to_note(ids)`**（≤50 条）：
   - 从 `session_to_note` 提取 `convert_to_note` 核心（注入 `Db + UiJunkList`，纯编排可单测），单条与批量共用同一过滤管线（延续 REQ-081/082"单一管线双出口一致性"原则）。
   - **部分成功语义**：单条失败不阻塞其他；跳过规则显式回传原因（无效 id/进行中/已转/会话不存在），不静默。
   - 重复 id 静默去重；批量转**跳过已有笔记**的会话（防重复笔记）；DB 读错误视为硬失败中止（库损坏时继续处理无意义）。

4. **前端列表层**（纯前端，无后端改动）：状态/转化筛选 + 排序（本地过滤）、行内一键转笔记、批量操作栏（转笔记/删除）、会话↔笔记双向互跳（`focusNoteId` / `onOpenSessions`，复用 A4 的 focusSessionId 模式）、`active` prop + `live:status`/`session:fused` 事件驱动刷新（根治 display:none 挂载不刷新导致的"采集中"残留）。

## 备选方案

### 方案 A：notes 加 session_id 列（选定）
- 优点：最小 schema 变更（1 列 + 索引，`ensure_column` 幂等）；SET NULL 天然表达"断关联不删数据"；子查询实现零往返。
- 缺点：旧数据无法追溯归属（诚实降级为 NULL）；多次转换需"取最新"语义。

### 方案 B：独立关联表 session_notes(session_id, note_id)
- 优点：1:N 关系显式化，可携带转换时间/次数等元数据。
- 缺点：多一张表 + 双写事务；当前需求（最新一篇 + has_note）用不上关系元数据；YAGNI。

### 方案 C：Session 结构直接加 has_note 字段
- 优点：无需新类型。
- 缺点：所有构造点（create/list/get/测试）与 serde 契约全改，破坏面大；列表标记与详情标记语义不同（详情不需要），污染核心类型。

## 选择理由

- 方案 A 以最小变更覆盖三个痛点的数据根因；SET NULL 与"笔记是用户资产"的产品原则一致（删除会话不丢笔记，与级联删除原料的既有语义形成明确分工）。
- 方案 B 的关系元数据当前无消费方，等"转换历史/覆盖管理"真实出现再升级不迟（列迁移向后兼容，届时可平滑加表）。
- 方案 C 破坏面与收益不成比例；`SessionListItem` 包装保持 `Session` 契约稳定（前端/后端其余消费方零改动）。

## 影响

### 正面影响
- 列表转化状态可见（已转/待转/录制中/异常），筛选与批量操作落地。
- 行内转化 4 步→1 步；批量转化部分成功语义（失败原因显式）。
- 会话↔笔记双向互跳闭环；删除会话不再误删笔记。
- 列表状态实时（事件驱动 + 切页刷新），"采集中"残留根治。

### 负面影响
- 旧 `classroom` 笔记显示未关联（诚实 NULL）——可经详情页重新转换建立关联。
- `list_sessions` 返回类型变更：前端消费方需同步 `SessionListItem` 形状（本批次一并更新）；`db_ocr_search`/`search_session_segments` 等内部消费方适配包装结构（已更新）。
- 批量转跳过已转会话（防重复）——用户如需"重新生成"走详情页单条路径（行为有意的区分）。

## 关联

- 设计文档：[sessions-ux-efficiency-design](../superpowers/specs/2026-08-19-sessions-ux-efficiency-design.md)
- 数据模型起点：[ADR-004](./ADR-004-session-data-model.md)（sessions 三表）；[ADR-006](./ADR-006-session-segments-derived-view.md)（原料/派生分离原则——本决策不改原料层）
- 验收：v0.7.1 版本文档（[versions/v0.7.1](../versions/v0.7.1.md)）
