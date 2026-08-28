# 技术债清单（权威：2026-08-28）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-28（纯文档归档日：v0.13 知识体系层系列 4 份 Foresight 文档生命周期终结移入归档夹；无代码改动，债务全量继承 2026-08-25）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 | 无意 | P3 | 2026-08-19 | carried |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 | 无意 | P2 | 2026-08-19 | carried |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn | 无意 | P3 | 2026-08-21 | carried |
| TD-2026-08-22-A | clippy --all-targets -D warnings 未绿（存量项；后续交付批均零新增） | 无意 | P3 | 2026-08-22 | carried |
| TD-2026-08-24-A | lib.rs（712 行）/ live_session_frame.rs（683 行）超 600 硬限——拆分计划顺延下一窗口 | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-24-B | RouteInfoPopover sysBrief 仅查 groupLinks[0] 体系——多体系组其余体系的概念失效不提示 | 无意 | P2 | 2026-08-24 | carried |
| TD-2026-08-24-C | KnowledgePage KnowledgeSampleView refreshGlobal={0} 恒传死参数 | 无意 | P3 | 2026-08-24 | carried |

## 今日已偿

无（本批为纯文档归档，未触及代码债务）。

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 v0.13.9-1 | smartEdges 拖拽每帧 O(边数×节点数) 重算（useMemo 内 find）——节点 <100 微秒级 | 保持（画布规模增长后改 Map 索引） |
| 观察 v0.13.9-2 | textarea 可视区定位在 soft-wrap 下按 scrollTop 比例近似（长行折行误差）——已校正到行首 | 保持（精确逐行测高成本高收益低） |
| 观察 v0.13.9-3 | 可视区定位对所有工具栏插入类操作统一生效（设计文档原述标题类）——一致性改进，注释已明确口径 | 保持（行为更优，文档已同步） |
| 观察 2026-08-28-1 | docs-check 存量失效链接 18 处（本批归档零新增）：v0.13.4/0.13.5 spec 相对路径笔误（`../superpowers/specs/` 应为 `./`）×4、v0.14 spec 代码片段 `path`/`src` 误检 ×3、v0.10.1/v0.12.0/v0.12.4 路径模板与 `[[ts:]]` 代码引用误检 ×11 | 待专项治理（与归档无关，避免本批范围蔓延） |

## 验证记录

- docs-check 链接校验通过（归档后活跃区引用全部改指归档路径）

## 关联

- 版本与需求：[v0.13 系列文档](../../versions/v0.13.md)（已交付 v0.13.1~9）
- 归档快照：[2026-08-28 README](./README.md) · [整合分析·方案 B（已归档 [ ] 已归档）](./personal-knowledge-system-layer-integration.md) · [竞品调研（赛道全景/品类深化，已归档）](./competitive-analysis-knowledge-system-layer.md)
