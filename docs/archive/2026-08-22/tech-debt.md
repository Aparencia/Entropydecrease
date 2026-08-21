# 技术债清单（权威：2026-08-22 归档滚动——pain-points v4 统一卷整合批）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-21 十轮清单继承 + 本批（v2/v3 → v4 整合，纯文档变更，无代码改动）。

## 未偿债务（逐笔核验，carried 仅留 ID + 一行摘要）

| ID | 摘要 |
|----|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡，开发期脚本+PATH 覆盖）；本批未涉及，保持 |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088）；本批未涉及，保持 |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停；本批未涉及，保持 |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性；本批未涉及，保持 |
| TD-2026-08-21-B | v0.10.0 时间戳锚点断言过时（全量 16 项）；本批未涉及，保持 open |
| TD-2026-08-21-C | db_sessions.rs / db_ai_tasks.rs 等文件的 `lock().expect` 锁点尚未迁移至 db.rs::with_conn（毒锁恢复 + ROLLBACK 孤儿事务兜底口径）；随七轮安全加固代码批待提交，保持 |

## 今日已偿 / 新登记（open）

- 已偿 0 笔（纯文档变更，无 Rust/前端代码改动）
- 新登记 open 0 笔

## 观察项（继承 2026-08-21 十轮，保持跟踪）

| ID | 摘要 | 处置 |
|----|------|------|
| （观察 A1~A3 继承） | B6 宽松匹配 / 事件 deps / apply 两步落库 | 保持跟踪 |
| （观察 0.10.1-1 继承） | 卸载自动保存与在飞保存乱序（低概率） | 保持跟踪 |
| （观察 v0.10.2-1~3 继承） | O(n²) 窗口扫描 / budgetExhausted 无提示 / _frame_w 冗余参数 | 保持跟踪 |

## 关联

- 取代文档：[pain-points-v4.md](../../product/pain-points-v4.md)（统一卷，唯一主导规划文档）
- 归档文档：[pain-points-v2.md](./pain-points-v2.md) · [pain-points-v3.md](./pain-points-v3.md)（[ ] 已归档）
- 前瞻分析：[v3-roadmap-build-order-analysis.md](../../Foresight/v3-roadmap-build-order-analysis.md)（建设顺序分析，依据的 Phase 1-4 已并入 v4 §11，待裁决立项）
