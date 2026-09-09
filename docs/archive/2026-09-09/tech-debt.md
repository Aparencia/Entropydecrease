# 技术债清单（权威：2026-09-09）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-09（批 1~8 同日连续交付——v0.20.6~0.20.13 与 REQ-306~317；自 2026-09-06 权威清单滚动核验：carried 7 笔逐条核对 + TD-2026-09-09-A 补登（批 7 既已引用但当日未建夹）+ 批 8 新登记 B/C + TD-2026-08-31-A 状态更新）。

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——lib.rs 仅 mod 声明，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs 超 600 硬限——实测 872（v0.19.3 模块/命令再 +5）；generate_handler 单点展开不可拆，拆分计划维持顺延 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-30-A | ClassroomPage 超 600 硬限——实测 745；拆分计划（LiveCaptureCard）未启动 | 有意 | P1 | 2026-08-30 | carried |
| TD-2026-08-30-B | note_filter 预存失败 2 笔——已 closed（3f6413e），哈希不变 | 预存 | P2 | 2026-08-30 | closed（3f6413e） |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable 右键无应用内文本菜单——**2026-09-09 批 8 状态更新：closed（部分兑现）**——CM（contenteditable）编辑态选区右键菜单与正文阅读态选区右键菜单随 REQ-317（v0.20.13）落地；残留面=「非 CM 的 contenteditable + 无选区时右键」仍静默（应用内唯一 contenteditable 即 CM，已覆盖；阅读态无选区右键=有意维持基线），若未来出现其他 contenteditable 编辑面需另立债 | 有意 | P3 | 2026-08-31 | closed（部分兑现，REQ-317 v0.20.13） |
| TD-2026-08-31-B | window.prompt/confirm/alert 替换为应用内对话框——余 13 处未决（本批未触及） | 有意 | P2 | 2026-08-31 | carried |
| TD-2026-08-31-C | App.css 从未被引入（死样式）——引入改全局暗色观感，需单独裁决 | 环境变化 | P3 | 2026-08-31 | carried |
| TD-2026-09-05-A | 挂体系空体系「去建体系」引导按钮未交付——已 closed（6b8f365），哈希不变 | 有意 | P3 | 2026-09-05 | closed（6b8f365） |
| TD-2026-09-05-B | 模型 disciplines 入参三形态契约漂移——已 closed（14e3988），哈希不变 | 无意 | P3 | 2026-09-05 | closed（14e3988） |
| TD-2026-09-06-A | 有效轴窗边裁剪：跨采纳窗段覆盖 ≥60% 整段让位致窗外 ≤40% 文本在产物缺位（asr_pass2 二值取舍，clip 未实现） | 无意 | P2 | 2026-09-06 | open |
| TD-2026-09-06-B | proofread_run async 内同步分块请求阻塞 worker（长会话）；重复 run 未清上次 pending | 无意 | P2 | 2026-09-06 | open |
| TD-2026-09-06-C | SOP 保鲜 diff 仅比首步（2..N 步改动不提示）；start 时段漂移 stale 提示未实现 | 无意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-D | SOP 执行器 READ-DO/CONFIRM 渲染无实质差异；证据图片三入口上传流未接（现为相对路径文本输入） | 有意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-E | SE 封存过滤仅 NotesPage 默认列表（复习面/检索/组视图未覆盖；tag 子串匹配含“树洞XX”） | 无意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-F | kind=web 预览后端未统一路由（preview_session_note 走转写链）；渲染型整页快照与截图兜底未实现；扩展商店发布未做 | 有意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-G | web_inbox token 非 CSPRNG 且 ACL 注释漂移；行数豁免登记批量过期（commands_proofread/commands_web_inbox/commands_session_note 及前端 ActionCenterOverlay/SessionDetailPanel）——批 8 已按实测纠偏 RichEditorView/NoteReadingView 并拆件承接 NotesPage 压线（useNoteSelectionActions/ModelCardDialogSlot），其余过期登记项待批量纠偏窗口 | 有意 | P3 | 2026-09-06 | open |
| TD-2026-09-06-H | 完成史 reverted 事件无来源；GoalsPage 回顾流未接 completion_history；set_task_disposition/练习暂停归档 UI/工具栏「生成 SOP」选区入口未接线 | 有意 | P3 | 2026-09-06 | open |
| TD-2026-09-09-A | NoteListView 超 600 硬限——实测 646（v0.20.12 批 7 接线后；HEAD 基线 633 即越线，批 7 登记值 591 过期）——**正式登记**（批 7 起以本 ID 引用但 2026-09-09 夹当日未建，本夹补登为权威行） | 有意 | P1 | 2026-09-09 | open |
| TD-2026-09-09-B | 「以对话处理」选区动作未接线（批 8 REQ-317 授权退路）：AiConversationDock 会话视图 v1 只读、无面板内发送通道（REQ-274 同源承诺：对话在 ChatPage 继续，防双实例流控冲突）；向 ChatPage composer 注入种子草稿需 App→ChatPage→NotesPage 三层 >3 组件深改——批 8 判为超面改动，菜单不显此项不伪实现；候选最小面=ChatPage 增 draft 种子 prop（App 持有种子态经跨页回调注入，不自动发送仅预填） | 有意 | P3 | 2026-09-09 | open |
| TD-2026-09-09-C | 「加入行动」阅读态未接线（批 8 REQ-317 V1 仅编辑态）：阅读态渲染 DOM ↔ 源码行映射缺失——选中文本定位到 Markdown 源码行并插入任务行需建立映射层（阅读容器内 Range → 行号 → 源正文偏移），V1 隐藏菜单项并注释；候选=复刻 NoteMarkdown 既有任务行索引（taskLineIndices 渲染序）思路的选区行映射 | 有意 | P3 | 2026-09-09 | open |

## 2026-09-09 节（批 1~8 交付 + 债务核验，同日连续线）

- **未偿表滚动**：自 2026-09-06 权威清单——closed 3 笔哈希不变；carried 7 笔逐条核对无新偿还条件；TD-2026-09-09-A 补登为正式行（批 7 引用先行）；新增 open 2 笔（TD-2026-09-09-B/C，批 8 REQ-317 授权退路/范围裁剪登记）
- **状态更新**：TD-2026-08-31-A → closed（部分兑现：REQ-317 v0.20.13 批 8——CM 编辑态选区右键菜单 + 正文阅读态选区右键菜单落地；残留面=非 CM contenteditable 与无选区右键静默为有意基线）
- **批 8 拆件承接（TD-2026-09-06-G 义务延续）**：NotesPage 599 压线（模型卡对话框渲染拆 ModelCardDialogSlot.tsx 33 行 + 行动类编排拆 useNoteSelectionActions.ts 70 行）；选区纯逻辑/共享菜单独立文件（utils/noteSelectionMenu.ts 165 行 + components/note-selection/SelectionActionMenu.tsx 187 行）
- **验证记录**：前端全量 vitest（批 8 新增 37 例）+ `tsc --noEmit` 0 错误；Rust 零改动（纯前端批，无需 cargo 回归——批 5 同口径）；行数豁免实测登记见 [line-limit-exemptions.md](../../standards/line-limit-exemptions.md)（NoteReadingView 316 / RichEditorView 399 新增登记；RichEditorView 前置 323 超限为 v0.20.8 偏差未登记债务，本次纠偏）

## 关联

- 版本与需求：[v0.20 版本文档](../../versions/v0.20.md)（v0.20.6~0.20.13 批 1~8 交付记录）· [需求池 REQ-306~317](../../product/requirements-pool.md)
- 归档快照：[2026-09-06 README](./README.md)（同日快照位于 [2026-09-06](../2026-09-06/README.md)）
