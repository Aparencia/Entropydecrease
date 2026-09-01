# 技术债清单（权威：2026-09-01）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-09-01（v0.17.0 精修可到达度交付 5 提交 a96cbbd~3b4936a + 新增代码七维审查即修；
> 昨日 8 笔逐条核验：均未发生偿还条件 → 继承 carried，TD-31-A/B/C 由 open 转 carried）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）——lib.rs 仅 mod 声明，接线条件未发生 | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-24-A | lib.rs/live_session_frame.rs 超 600 硬限——lib.rs 仍 >600（generate_handler 单点展开不可拆）；拆分计划顺延 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-30-A | ClassroomPage 607 行超 600 硬限——拆分计划（LiveCaptureCard）未启动 | 有意 | P1 | 2026-08-30 | carried |
| TD-2026-08-30-B | note_filter 预存失败 2 笔（session29_live_ui_excluded_from_points / ocr_points_exclude_watermark_junk_and_dupes）——2026-09-01 全量复现 2 例失败（与本批零触及，独立排查） | 预存 | P2 | 2026-08-30 | carried |
| TD-2026-08-31-A | BrowserChrome 对 contenteditable 右键无应用内文本菜单——当前应用无该编辑面 | 有意 | P3 | 2026-08-31 | carried |
| TD-2026-08-31-B | 13 处 window.prompt/confirm/alert 替换为应用内对话框——**部分进展**：精修授权确认已由 v0.17.0 RefineLaunchDialog 内嵌授权卡改写，余 12 处未决（用户裁决后续批） | 有意 | P2 | 2026-08-31 | carried |
| TD-2026-08-31-C | App.css 从未被引入（死样式）——引入改全局暗色观感，需单独裁决 | 环境变化 | P3 | 2026-08-31 | carried |

## 今日已偿

无既有债务偿还；本日新增代码七维审查定位并**即修 6 项**（不立债，均在本批修复提交内）：
1. **审查-P0-1（P0）**：笔记级精修完成后无工作台/采纳入口（NoteAiDialog 发起即静默闭环缺失）——补齐任务轮询 + 完成自动打开工作台（noteMode）+ 采纳回调（本批修复提交）
2. **审查-P0-2（P0）**：完成双入口按 ref_id 语义错跳（会话级任务"查看笔记"跳到 #sessionId、笔记级任务"回到会话"跳到 #noteId）——ai_tasks 增 `target_kind` 列（session|note，ensure_column 幂等迁移）+ 前端按类别分发双入口与工作台深链（本批修复提交）
3. **审查-P1-1（P1）**：工作台「重新生成」不回传策略档位（回退全局默认，重生成与首版不一致）——result.strategy → StrategyOverride 透传（overrideFromInfo，本批修复提交）
4. **审查-P2-1（P2）**：useRefineStream listen 失败未容错（无事件系统环境抛未处理 rejection）——订阅失败降级为空流（呈现增强缺失不影响任务主链路，本批修复提交）
5. **审查-P2-2（P2）**：AiRefineCard consent/confirm 残留死分支（v0.17.0 授权/成本迁入对话框后不可达）——清理（本批修复提交）
6. **审查-P2-3（P2）**：RefineLaunchDialog/NoteAiDialog 等新组件无组件级测试——新增 RefineLaunchDialog 契约测试 2 项（策略透传 assertion + 未授权同意卡）+ overrideFromInfo 单测（本批修复提交）

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 2026-09-01-1 | 对话页 `/refine`（TaskLaunchDialog）未接策略区——任务发起始于全局默认 | 登记后续（架构已通：命令参数/预览/meta 全就绪，仅 UI 未接） |
| 观察 2026-09-01-2 | 「再来一版·更/少干预」未独立成 UI（重生成已沿用策略档位；一键"更/少"需改档位 UI） | 登记后续 |
| 观察 2026-09-01-3 | 制作版本号（tauri.conf.json/package.json 0.13.9）与版本存档线（v0.14~v0.17.0）漂移 | 预存记录（semantic-release 管 main 线；dev 不升，发版前核） |
| 观察 2026-09-01-4 | note_filter 预存 2 例失败（TD-30-B 关联）与单跑测试 exe onnxruntime.dll 加载环境问题 | 预存环境/存量记录（v0.12.5 归档已记同类） |
| 观察 2026-09-01-5 | RefineLaunchDialog 预览防抖（250ms）与确认之间的展示延迟——实发参数始终用当前 draft（所见即所发成立），仅渲染略滞后 | 无问题（登记说明） |

## 验证记录

- 前端 vitest 64 文件 496 用例全绿（含新增 RefineLaunchDialog 2 项 + refineStrategy 11 项）；`tsc --noEmit` 零错误
- Rust 全量 `cargo test`：核心改动测试全绿，仅 2 例 note_filter 预存失败（TD-30-B，与本批无关）；clippy 新代码零警告（存量 lib.rs:433 一项）
- docs-check：本批文档（spec/ADR/REQ/versions/v0.17.0）链接同步，归档后活跃区改指归档路径

## 关联

- 版本与需求：[v0.17.0 版本文档](../../versions/v0.17.0.md)（交付 a96cbbd~3b4936a，REQ-245~247）· [ADR-026](../../adr/ADR-026-ai-refine-strategy-flow.md)（当前生效）
- 归档快照：[2026-09-01 README](./README.md)
