# 技术债清单（权威：2026-09-02）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-02（v0.18.0「学习目标层 M1」交付 4 提交 + 新增代码七维审查即修；
> 昨日 8 笔逐条核验：均未发生偿还条件 → 继承 carried，TD-31-B 备注更新）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——lib.rs 仅 mod 声明，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs/live_session_frame.rs 超 600 硬限——lib.rs 仍 >600（generate_handler 单点展开不可拆）；拆分计划顺延；**备注：v0.18.0 目标层注册使 lib.rs 再增 ~30 行（824），拆分计划维持顺延** | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-30-A | ClassroomPage 607 行超 600 硬限——拆分计划（LiveCaptureCard）未启动 | 有意 | P1 | 2026-08-30 | carried |
| TD-2026-08-30-B | note_filter 预存失败 2 笔（session29_live_ui_excluded_from_points / ocr_points_exclude_watermark_junk_and_dupes）——2026-09-02 全量复现 2 例失败（独立 HEAD worktree 复核确认与本批零触及，独立排查） | 预存 | P2 | 2026-08-30 | carried |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable 右键无应用内文本菜单——当前应用无该编辑面 | 有意 | P3 | 2026-08-31 | carried |
| TD-2026-08-31-B | window.prompt/confirm/alert 替换为应用内对话框——**部分进展**：精修授权确认已改写（v0.17.0），**本批 GoalDetail 删除目标新增 1 处 window.confirm（存量一致）**，余 13 处未决（用户裁决后续批） | 有意 | P2 | 2026-08-31 | carried |
| TD-2026-08-31-C | App.css 从未被引入（死样式）——引入改全局暗色观感，需单独裁决 | 环境变化 | P3 | 2026-08-31 | carried |

## 今日已偿

无既有债务偿还；本日新增代码七维审查定位并**即修 8 项**（不立债，均在本批修复提交内）：
1. **审查-P1-1（P1）**：访谈模式第 3 问时限选择（a.horizon）创建时丢失——create_goal 收到面板默认值「3m」而非用户选择；改 effectiveHorizon 口径（前端 57c4dd7）＋测试断言 6m 透传
2. **审查-P1-2（P1）**：skipped 里程碑（废弃计划项）计入进度分母与毕业判据——跳过拖死整个目标（里程碑 2/4 永远差一条）；SQL 排除 skipped＋单测（60f4d1e）
3. **审查-P2-1（P2）**：重访谈（update_goal_interview）名称修改不落库——对话框允许改名但后端忽略；名称随对话窗口生效（空名回退旧名）＋单测（60f4d1e）
4. **审查-P2-2（P2）**：update_goal / update_goal_milestone 两命令无前端调用方（接入性缺口）；详情页改名＋里程碑标题行内编辑接线（57c4dd7）
5. **审查-P2-3（P2）**：horizon=none 宣言文案「用无期限学会…」病句——前后端对齐为「长期目标（无期限）：学会…」（60f4d1e/57c4dd7 golden 同步）
6. **审查-P2-4（P2）**：命令层 require 后 .unwrap() 防御缺口（检查-取数窗口并发删除会 panic）——ok_or_else 化（60f4d1e）
7. **审查-P2-5（P2）**：访谈答案文本无上限入库——bounded 200 字截断（intent/配方边界同口径）＋单测（60f4d1e）
8. **审查-P3-1（P3）**：InterviewDialog 编辑态 onCreated 伪 Goal 对象 + 空态热词不预填——无参回调清理＋initialName 预填（57c4dd7）

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-09-02-1 | GoalDetail 组件级测试未覆盖（改名/里程碑编辑/弱项渲染）——核心命令契约已由后端单测（commands_goals 13 项）覆盖，交互层登记后续 | 登记后续（随 v0.18.1 组件批补测） |
| 观察 2026-09-02-2 | 删除目标确认沿用 window.confirm（与 TD-31-B 存量一致，13 处余量含本处）——不单独立债 | 并入 TD-2026-08-31-B 追踪 |
| 观察 2026-09-02-3 | GoalPage 常驻挂载（display:none）启动即 list_goals——与既有页面同模式（TD-004 保留挂载纪律），无新增窗口期负担 | 无问题（登记说明） |

## 验证记录

- 前端 vitest 66 文件 507 用例全绿（含审查新增断言）；`tsc --noEmit` 零错误
- Rust 全量 `cargo test`：1932 通过；仅 2 例 note_filter 预存失败（TD-30-B，与本批无关）；clippy 零警告
- docs-check：本批文档（spec 归档/ADR-027/REQ/versions/v0.18.0）链接同步，活跃区改指归档路径

## 关联

- 版本与需求：[v0.18.0 版本文档](../../versions/v0.18.0.md)（交付 7a369cf7~6eb28c67 + 审查修复 60f4d1e/57c4dd7，REQ-030/248~250）· [ADR-027](../../adr/ADR-027-goal-layer-modeling.md)（当前生效）
- 归档快照：[2026-09-02 README](./README.md)
