# 2026-09-06 · v0.20.5 信息架构批：行动域页独立（行动中心从笔记页剥离）

> 状态：**设计批准（2026-09-06 用户逐项裁决）· 已实施（2026-09-06 本线：5a4a1f28/b78ddae7 + docs 提交）**
> 定位：意图分层——"做（行动裁决/SOP/练习/问题）"从笔记页剥离为顶层域页；笔记页回归"记/组织"单一职责。顶层 Tab = 稳定意图域，域内功能以页签承载（不再"一个功能一张页"线性堆 Tab）。
> 关联：TD-2026-09-06-G（NotesPage 649 行超硬限拆件义务）· v0.20.3 行动底座（REQ-292~302）· REQ-293 入口变更登记 · v0.13.1/0.18/2026-08-21 页面剥离先例 · [goal-execution-agent-design](./2026-09-05-goal-execution-agent-design.md)（v0.21 系列执行层预留，与本批域模型不冲突）
> 原则：不引入路由库（MVP 决策延续，display:none 保活挂载 TD-004 模式）；后端零数据模型改动；行动中心内部业务逻辑不改（🎴 转卡置灰、TD-A~H 其余项不在此批）。

## 1. 决策记录（2026-09-06 用户逐项裁决）

| # | 决策 | 裁决 |
|---|------|------|
| D1 | 驱动 | 意图分层（学/做/记各归其位），非单纯技术债清理 |
| D2 | 方案 | 意图域页（方案甲）：行动中心 → 顶层「行动」Tab；二期预留复习域页；收件箱留笔记域（碎片=记录原料动线，剥离破坏"升笔记"闭环） |
| D3 | 范围 | 本次仅行动中心独立；复习面/收件箱/笔记自身动作（AI 精修/模型卡/挂体系/颜色/归组）不动 |
| D4 | 入口 | **仅顶部 Tab「✅ 行动」**；组侧栏「✅ 行动 N」按钮与逾期徽标整体移除（无被动提醒，逾期感知在行动页内） |
| D5 | 行数红线 | NotesPage 本轮压回 ≤600（行动剥离 + 拆件双管齐下） |
| D6 | 版本归属 | v0.20.5（v0.20.md 追加小节；v0.21 系列留给执行型智能体） |
| D7 | 交互审计 | 审计发现 `commands_tasks.rs` 无 `DataDomain::Notes` 发射点——行动写回原依赖 Overlay `onChanged` 回调刷新笔记页；剥离后**必须后端补发事件**（见 §6），否则切回笔记页显示旧任务行状态 |

## 2. 现状盘点（全部复用，零重建）

| 资产 | 位置 | 本次处置 |
|---|---|---|
| 行动中心（三页签+四分区+周回顾批+完成史+SOP 库） | components/ActionCenterOverlay.tsx（550 行，豁免登记 509 过期） | 页面化迁入 components/action-center/ActionCenterPanel.tsx |
| SOP 执行器（嵌套全屏 Overlay） | components/SopRunOverlay.tsx | 原样保留，宿主换为面板 |
| 练习/问题轻量面（嵌套 Overlay） | components/PracticeQuestionsOverlays.tsx | 原样保留，宿主换为面板 |
| 组侧栏行动入口/徽标 | components/GroupSidebar.tsx（actionCount + ✅ 按钮） | 移除（D4） |
| NotesPage 行动宿主 | pages/NotesPage.tsx（actionOpen state + 渲染块） | 移除，回归纯笔记编排 |
| 导航壳 | App.tsx（Page 联合 + NAV_ITEMS + 保活挂载） | +1 Tab「action」 |
| 事件总线 | useDbRefresh.ts（notes/note-groups/goals/knowledge/sessions 五域）+ notify.rs | 无新域；需确认任务写回发射（D7） |
| 行动命令面 | commands_tasks.rs / commands_sop.rs / db_completion.rs 等 | 数据层零改；commands_tasks 补 4 个 emit |

触点全量核验结论：行动/SOP/练习/问题命令前端调用方仅存在于上述组件链；设置/目标/体系/会话/AI 对话页无行动命令与入口残留 → 入口唯一化不切断任何其他动线。

## 3. 目标与范围

**范围内**：① 行动中心整包独立成「行动」域页（顶部 Tab 唯一入口）；② NotesPage 压回 ≤600；③ GroupSidebar 移除行动入口与徽标；④ commands_tasks 写正文 4 命令补发 `DataDomain::Notes` + 回归断言；⑤ 测试/文档/豁免表同步。

**范围外**：复习面（二期预留方向见 §9）、收件箱碎片、笔记自身动作、行动中心内部业务逻辑、🎴 转卡、`action_badge_count` 命令（**保留不删**——API 面不缩小，防未来徽标回归/深链）、TD-A~H 其余开放项、v0.21 系列执行层。

## 4. 导航与外壳变更

- **App.tsx**：`Page` 联合 + NAV_ITEMS 插入 `{ key: "action", label: "✅ 行动" }`（位置：笔记之后；8 项：课堂/会话/笔记/行动/AI对话/体系/目标/设置）；主区新增 display:none 保活挂载块 `<ActionPage active={page === "action"} />`；无 focus 深链 state（行动中心为全局域，行内仅 `@笔记名` 标签无跳转）。
- **pages/ActionPage.tsx**（新建，编排壳 ≈90 行）：容器 `height: calc(100vh - 56px)` 挂 ActionCenterPanel；`active` 门控——从隐藏切回时重载四分区/完成史/SOP（对齐 SessionsPage active 模式，补偿常驻挂载隐藏期错过的变更）。
- **NotesPage.tsx**：删 ActionCenterOverlay import、actionOpen state、组侧栏 onOpenAction 透传、底部渲染块及其 onChanged 刷新回调。
- **GroupSidebar.tsx**：删 onOpenAction prop、actionCount state、load() 中 action_badge_count 调用、底部「✅ 行动 N」按钮（🎴 复习按钮保留，仍开 ReviewSessionOverlay——复习域二期前维持原位）。
- **入口矩阵**：行动 = 顶部 Tab 唯一入口；笔记 ↔ 行动互不深链（组/笔记上下文零耦合）。

## 5. 行动中心页面化（组件改造）

- 文件迁移：`components/ActionCenterOverlay.tsx` → `components/action-center/ActionCenterPanel.tsx`（TD-G 预留目录）；import 相对路径同步（SopRunOverlay/PracticeQuestionsOverlays → `../`）。
- 外观：删固定遮罩/居中卡片/「关闭」按钮 → 页面区自适应（头部工具栏：三页签计数 + 🎯练习/❓问题入口 + msg/err 条；下方内容滚动）。
- 逻辑原样：三页签（裁决队列/完成史/SOP 库）、四分区、周回顾批模式、行操作、数据加载函数。
- 嵌套层 UX 不变：SOP 执行器 = 全屏聚焦 Overlay；练习/问题 = 轻量弹层（后续深化再升页签）。
- Props：删 onClose / onChanged（刷新改由 §6 契约承担）。

## 6. 刷新契约（交互审计修订项）

| 通道 | 机制 | 处置 |
|---|---|---|
| 行动页自身 | active 门控切回重载 + 既有页内变更后局部重载 | 已含 §4/§5 |
| 笔记页被动刷新 | NotesPage 常驻 `useDbRefresh(["notes","note-groups"])`（v0.19.4 总线） | **commands_tasks 补发 3 命令**：`task_complete` / `task_abandon` / `task_refine_unrefined` 成功后 emit `DataDomain::Notes`（回写笔记正文行）；`batch_weekly_resolve` **已有**广播（commands_after.rs:87-93"直写路径跳过 update_note 事件面——补 notes 域广播"）；`task_set_plan_date` 正文零污染不发（队列自刷已够）；练习打点/问题作答/SOP run 只写 completion_history/questions 表，不发 |
| 补发落点 | commands_tasks.rs 命令包装层（state.app 可用处），复用 notify::emit_changed | + 回归断言（事件发射），全量 `cargo test --test app_lib_tests` |
| 徽标 | action_badge_count 保留命令无前端调用方 | 不动（见 §3） |

## 7. NotesPage 压线拆件（≤600）

行动剥离后 NotesPage ≈637，需再拆 ~40 行。候选（实施时按实测选 1-2 处，行为等价 + 现有测试绿）：
1. `hooks/useNotesSealedFilter.ts`：sealedVisible state + feature-flags effect + visibleNotes 过滤 memo（≈30 行）；
2. `hooks/useNotesPageEditing.ts`：Ctrl+E/ESC window keydown + editorRef/editingRef 同步族（≈40 行）。
最终以实测行数为准，压线后豁免表备注移除"超硬限"字样。

> 实施注记（2026-09-06）：实际执行未采用上列 hook 候选——行动剥离后 NotesPage 仍 641 行，改拆「阅读头动作组」NoteHeaderActions（色点/归组/挂体系/AI/模型卡下沉为独立组件，主题推导与色板开合自持）达 575 行；同批 GroupSidebar 455 行（✅ 行动按钮/徽标移除）。豁免表按纠偏风格补登记 ActionCenterPanel 521 / NotesPage 575 / GroupSidebar 455。

## 8. 测试与验收

- `npx tsc --noEmit` 0 错；`npx vitest run` 全绿；`cargo test --test app_lib_tests` 全量（含新增事件发射断言）
- 测试变更：GroupSidebar.test.tsx 移除 onOpenAction mock 与徽标断言；NotesPage.test.tsx 核验无行动断言后不动；ActionCenterPanel/ActionPage 新增关键路径渲染测试（mock invoke：三页签切换/练习问题弹层/active 重载触发）
- 行数豁免表：ActionCenterOverlay 行删除 → 新增 ActionCenterPanel 实测登记；NotesPage/GroupSidebar 行更新实测值
- 手工走查：8 Tab 渲染；行动页切回刷新；笔记页/组侧栏无行动残留；笔记任务行在行动页操作后切回笔记页列表与右栏即时一致

## 9. 二期预留（本次不做，域模型已容纳）

| 域页 | 意图 | 方向 |
|---|---|---|
| 复习（二期） | 练 | ReviewSessionOverlay 全页化：全量到期卡 + 组过滤器，替代组侧栏"🎴 复习"原地 Overlay；独立立项时再走一轮设计与裁决 |
| 收件箱 | 记（原料） | 留笔记页——碎片→升笔记闭环动线；将来若要独立仅新增一域 |

顶层 Tab >8 时再做导航分组收纳（本批不预做，登记观察项）。

## 10. 文档与提交

- 本设计文档：docs/superpowers/specs/2026-09-06-action-domain-page-design.md（本提交）
- docs/versions/v0.20.md：状态行追加 + 新小节「v0.20.5 · 信息架构：行动域页独立」（决策/变更/回归/开放项滚动）
- 需求池 REQ-293 备注追加：v0.20.5 入口迁顶层「✅ 行动」Tab、组侧栏徽标移除
- 提交（原子）：
  1. `refactor(app): 行动中心独立为行动域页 + 笔记页/组侧栏拆件`（代码+前端测试+豁免表）
  2. `docs(versions): v0.20.5 信息架构批——行动域页独立（spec 落档 + 需求池备注）`

## 11. 风险与回归

- 事件补发遗漏任一命令 → 切回笔记页旧任务行（验收含手工走查 + 单测断言覆盖 4 命令）
- active 门控漏接线 → 行动页隐藏期数据陈旧（ActionPage 单测覆盖切回重载）
- NotesPage 拆件行为不等价 → 依赖现有 NotesPage.test 全量绿 + 交互走查
- 导航 8 项宽度：13px 字号可容纳，无需改动 nav 布局
