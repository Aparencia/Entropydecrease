# 技术债清单（权威：2026-09-02 二轮）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-02（二轮：v0.18.2「AI 目标规划师」全链路交付 + 新增代码七维审查即修；
> 昨日（同日上午批）8 笔逐条核验：均未发生偿还条件 → 继承 carried）

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

无既有债务偿还；本日新增代码七维审查定位并**即修 7 项**（不立债，均在本批修复提交内）：
1. **审查-P1-4（P1）**：GoalPlanApprovalDialog 里程碑标题编辑被原题覆盖（`{...editingTitles, ...m}` 展开顺序）——编辑优先 + 3 项组件测试回归（c4e6d88）
2. **审查-P1-5（P1）**：InterviewDialog AI 路径重复建目标（失败后"确认创建"再建 / AI 成功后再建）——失败回滚 delete_goal / 确认成功 onCreated 收口（c4e6d88）
3. **审查-P1-6（P1）**：ai_goal_plan 无并发互斥（双击/多窗口重复扣费）——AppState `goal_plan_busy` Arc<AtomicBool> swap 占位 + BusyGuard Drop 释放（async Send 兼容）（c4e6d88）
4. **审查-P2-6（P2）**：goal_apply_plan 里程碑判据白名单/周界再校验（防任意请求直写 self_test M3 占位契约）（c4e6d88）
5. **审查-P2-7（P2）**：ai_goal_plan 状态守卫（仅 active/paused 可规划——毕业/放弃防误操作与无谓成本）（c4e6d88）
6. **审查-P3-3（P3）**：毕业档案单条坏快照导致整命令失败——跳过+日志（归档可读性优先）（c4e6d88）
7. **审查-P3-4（P3）**：goal_summary 历法换算无已知锚点回归——1700000000=2023-11-14 断言（c4e6d88）

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-09-01-1 | 对话页 `/refine`（TaskLaunchDialog）未接策略区——任务发起始于全局默认 | 登记后续（架构已通：命令参数/预览/meta 全就绪，仅 UI 未接） |
| 观察 2026-09-01-2 | 「再来一版·更/少干预」未独立成 UI（重生成已沿用策略档位；一键"更/少"需改档位 UI） | 登记后续 |
| 观察 2026-09-01-3 | 制作版本号（tauri.conf.json/package.json 0.13.9）与版本存档线（v0.14~v0.17.0）漂移 | 预存记录（semantic-release 管 main 线；dev 不升，发版前核） |
| 观察 2026-09-01-4 | note_filter 预存 2 例失败（TD-30-B 关联）与单跑测试 exe onnxruntime.dll 加载环境问题 | 预存环境/存量记录（v0.12.5 归档已记同类） |
| 观察 2026-09-01-5 | RefineLaunchDialog 预览防抖（250ms）与确认之间的展示延迟——实发参数始终用当前 draft（所见即所发成立），仅渲染略滞后 | 无问题（登记说明） |
| 观察 2026-09-02-1 | GoalDetail 组件级测试未覆盖（改名/里程碑编辑/弱项渲染）——核心命令契约已由后端单测覆盖，交互层登记后续 | 登记后续（随 v0.18.1 组件批补测） |
| 观察 2026-09-02-2 | 删除目标确认沿用 window.confirm（与 TD-31-B 存量一致）——不单独立债 | 并入 TD-2026-08-31-B 追踪 |
| 观察 2026-09-02-3 | GoalPage 常驻挂载（display:none）启动即 list_goals——与既有页面同模式（TD-004 保留挂载纪律） | 无问题（登记说明） |
| 观察 2026-09-02-4 | 前端 authorized=true 硬编码（"本次上传确认"弱化为设置页一次性授权——与 ai_refine_start 逐次确认契约差异；content_gate/独立开关仍在门禁） | 与设计 §六 一致（"未授权置灰"而非逐次弹窗），登记说明；逐次确认随授权 UX 增强批 |
| 观察 2026-09-02-5 | /goal 注入每调一次全量 list_goals（每卡进度聚合）——目标量级小，毫秒级；规模增长时改目标名索引 | 无问题（登记说明） |
| 观察 2026-09-02-6 | GoalPlanApprovalDialog 测试已补 3 项（标题不回弹/勾选排除/规则回退）；GoalAiSection 未单测 | 登记后续（设置段随授权 UX 批补测） |

## 验证记录

- 前端 vitest 66 文件 507 用例全绿（含审查新增断言）；`tsc --noEmit` 零错误
- Rust 全量 `cargo test`：1932 通过；仅 2 例 note_filter 预存失败（TD-30-B，与本批无关）；clippy 零警告
- docs-check：本批文档（spec 归档/ADR-027/REQ/versions/v0.18.0）链接同步，活跃区改指归档路径

## 关联

- 版本与需求：[v0.18.0 版本文档](../../versions/v0.18.0.md)（交付 7a369cf7~6eb28c67 + 审查修复 60f4d1e/57c4dd7，REQ-030/248~250）· [ADR-027](../../adr/ADR-027-goal-layer-modeling.md)（当前生效）
- 归档快照：[2026-09-02 README](./README.md)
