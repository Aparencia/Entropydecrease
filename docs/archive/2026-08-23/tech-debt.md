# 技术债清单（权威：2026-08-23 · 二轮）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-23 一轮（v0.12.0 七里程碑交付 + 新增代码七维审查，4 项即修 c624f4c）
>        → 二轮（v0.12.3 浮窗死锁修复 + 交互/架构升级 + 精修工作台契约修复，新增代码七维审查，3 处问题全部即修 f8db9e2）

## 未偿债务（逐笔保持 carried，仅留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn |
| TD-2026-08-22-A | clippy --all-targets -D warnings 未绿（存量 lib 5 项：live_session_manager applied_profile / commands_ai_enrich redundant closure / db_settlements i64 cast / note_filter doc list / watermark_filter ptr_arg，tests 类另有 ~14 项；**v0.12.3 批新增零警告**） |

## 本批滚动（2026-08-23 二轮：v0.12.3 交付 + 新增代码七维审查 + 归档）

- **未偿 6 笔保持 carried**：全部未触及对应模块；TD-2026-08-22-A 经本批 `cargo clippy --all-targets` 复核——存量告警仍在（含 v0.12.0 清单已列的 applied_profile / ptr_arg / schema_version 及新暴露的 commands_ai_enrich / db_settlements / note_filter 存量项），本批新增文件**零告警**，未清偿
- **已偿 0 笔**：本批未触及旧债务模块
- **新登记 open 0 笔**：v0.12.3 新增代码七维审查发现 3 处问题（HIGH ACL 授权缺口 / HIGH open 存在性判定失效 / MED 监听清理缺陷）全部即修（f8db9e2），无残留

## 观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 v0.12.0-1 | M4 仅 commands_ai_providers env 改 DEEPSEEK_API_KEY；ai_client / ai_balance / ai_refine_task / ai_text_filter 等 legacy 单 Provider 路径仍读 SILICONFLOW_API_KEY（昨日观察 M1-1/M1-4 延续） | 专项退役或后序范围 |
| 观察 v0.12.0-2 | commands_overlay 的 overlay-tmp/snapshot.jpg 覆盖式临时文件（单张有界） | 真机确定是否需清理 |
| 观察 v0.12.0-3 | WGC 失效后不回切（沿用 DXGI 周期重建自愈）——YAGNI 决策已在 ADR-022 注明 | 保持 |
| 观察 v0.12.3-1 | 透明度滑杆拖动连续写 localStorage（微秒级；浮窗 1s tick 渲染已惰性化，收益递减） | 后续可节流（按反馈门控） |
| 观察 v0.12.3-2 | 独占全屏（DXGI exclusive）下 alwaysOnTop 不可见（系统级限制）——提示文案未做 | 真机验收后按反馈门控 |

## 关联

- 版本与需求：[v0.12.0 版本文档](../../versions/v0.12.0.md) / [v0.12.3 版本文档](../../versions/v0.12.3.md)
- 决策：ADR-021（正文源多态）/ ADR-022（WGC 三级链）/ ADR-023（视频 OCR 下线 + vision 精修）
- 验证：cargo check / cargo clippy（本批零新增告警）/ cargo test（编译通过；测试二进制本机因原生 DLL 入口点问题无法启动——既有环境问题，且 17:xx 时应用运行中占用 onnxruntime.dll）/ tsc 零错误 / vitest 83 通过
