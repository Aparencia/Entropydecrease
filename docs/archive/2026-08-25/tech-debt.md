# 技术债清单（权威：2026-08-25）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-25（v0.13.9 笔记编辑修复 + 问题树层级 + 画布链接与接线交付后新增代码七维审查——接入/牵连/性能/冗余/规范/安全六维通过；逻辑性 P1×1（typeColor 双处重复）/P2×2（树视图表单缩进错位/定位作用范围注释口径）全部即修；P4/P5 低风险项登记观察不立债）

## 未偿债务

| ID | 摘要 | 类型 | 优先级 | 来源归档 | 状态 |
|----|------|------|--------|----------|------|
| TD-040 | bundle.resources 未含 ffmpeg（deliberate 有意不修：体积权衡） | 有意 | P2 | 2026-08-18 | carried |
| TD-2026-08-19-D | image_stream_store 已交付未接线（REQ-110/123/088） | 有意 | P2 | 2026-08-19 | carried |
| TD-2026-08-19-F | detect_pause_icon 暗底+中央亮内容可能误报暂停 | 无意 | P3 | 2026-08-19 | carried |
| TD-2026-08-19-G | db_ocr_search 500 会话静默截断 + 图路径不校验存在性 | 无意 | P2 | 2026-08-19 | carried |
| TD-2026-08-21-C | db_sessions/db_ai_tasks 的 lock().expect 未迁移 with_conn | 无意 | P3 | 2026-08-21 | carried |
| TD-2026-08-22-A | clippy --all-targets -D warnings 未绿（存量项；v0.13.6/7/8/9 交付批均零新增——本批纯前端无 Rust 改动） | 无意 | P3 | 2026-08-22 | carried |
| TD-2026-08-24-A | lib.rs（712 行）/ live_session_frame.rs（683 行）超 600 硬限——拆分计划顺延下一窗口（本批纯前端无 Rust 改动） | 有意 | P1 | 2026-08-24 | carried |
| TD-2026-08-24-B | RouteInfoPopover sysBrief 仅查 groupLinks[0] 体系——多体系组其余体系的概念失效不提示 | 无意 | P2 | 2026-08-24 | carried |
| TD-2026-08-24-C | KnowledgePage KnowledgeSampleView refreshGlobal={0} 恒传死参数 | 无意 | P3 | 2026-08-24 | carried |

## 今日已偿

无（本批为纯前端修复 + 审查，未触及 Rust/命令层债务）。

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 v0.13.9-1 | smartEdges 拖拽每帧 O(边数×节点数) 重算（useMemo 内 find）——节点 <100 微秒级 | 保持（画布规模增长后改 Map 索引） |
| 观察 v0.13.9-2 | textarea 可视区定位在 soft-wrap 下按 scrollTop 比例近似（长行折行误差）——已校正到行首 | 保持（精确逐行测高成本高收益低） |
| 观察 v0.13.9-3 | 可视区定位对所有工具栏插入类操作统一生效（设计文档原述标题类）——一致性改进，注释已明确口径 | 保持（行为更优，文档已同步） |

## 验证记录

- 前端：vitest 34 文件 **209 通过**（新增 headingLines 7 + 问题树层级 2 + 根卡/虚边/nodeType 4 + resolveEdgeHandles 5 + 类型 chip 2 + 画布接线 2）；`tsc --noEmit` 零错误；vite build 通过
- 审查修复后回归：209 全绿 + tsc 零错误（P1 typeColor 提取 nodeTypeColor 共享、P2 表单缩进随 depth、P2 注释口径）

## 关联

- 版本与需求：[v0.13 系列文档](../../versions/v0.13.md)（v0.13.9 行）
- 规格：[v0.13.9 设计规格（已归档 [ ] 已归档）](./2026-08-25-v0.13.9-note-editing-tree-canvas-fixes-design.md)
