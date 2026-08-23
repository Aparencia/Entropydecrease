# 技术债清单（权威：2026-08-23）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-23 清单滚动（v0.12.0 七里程碑交付 + 新增代码七维审查，4 项问题全部即修无新增 open）

## 未偿债务（逐笔保持 carried，仅留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn |
| TD-2026-08-22-A | clippy --all-targets -D warnings 未绿（存量 ~6 项：live_session_manager applied_profile / note_filter doc_lazy_continuation / watermark_filter ptr_arg / enrich_placement_tests unused import / refine_golden_tests schema_version；本批新增零警告） |

## 本批滚动（2026-08-23：v0.12.0 七里程碑交付 + 新增代码七维审查 + 归档）

- **未偿 6 笔保持 carried**：TD-040 / TD-2026-08-19-D/F/G / TD-2026-08-21-C / TD-2026-08-22-A——v0.12.0 各里程碑未涉及对应模块；TD-2026-08-22-A 经本批 clippy --lib 观察存量告警仍存在（applied_profile / doc_lazy_continuation / ptr_arg 等），未清偿
- **已偿 0 笔**：本批未触及旧债务模块
- **新登记 open 0 笔**：v0.12.0 新增代码七维审查发现的 4 项问题（HIGH webp 漏滤+无限装载 / MEDIUM last_full_ocr_at 冷却失效 / LOW WGC expect panic 风险 / LOW 键盘监听高频重注册）全部即修（c624f4c），无残留

## 观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 v0.12.0-1 | M4 仅 commands_ai_providers env 改 DEEPSEEK_API_KEY；ai_client / ai_balance / ai_refine_task / ai_text_filter 等 legacy 单 Provider 路径仍读 SILICONFLOW_API_KEY（昨日观察 M1-1/M1-4 延续） | 专项退役或后序范围 |
| 观察 v0.12.0-2 | commands_overlay 的 overlay-tmp/snapshot.jpg 覆盖式临时文件（单张有界） | 真机确定是否需清理 |
| 观察 v0.12.0-3 | WGC 失效后不回切（沿用 DXGI 周期重建自愈）——YAGNI 决策已在 ADR-022 注明 | 保持 |

## 关联

- 版本与需求：[v0.12.0 版本文档](../../versions/v0.12.0.md)
- 决策：ADR-021（正文源多态）/ ADR-022（WGC 三级链）/ ADR-023（视频 OCR 下线 + vision 精修）
- 验证：cargo build / clippy --lib / cargo test --no-run / tsc 全部 exit 0；Rust 测试二进制在本机因原生 DLL 入口点问题无法启动（既有环境问题），真机验收清单见版本文档交付验证记录
