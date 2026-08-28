# 技术债清单（权威：2026-08-28）

> 本清单为当前唯一权威债务清单，归档日滚动更新；旧归档清单仅历史追溯。
> 来源：2026-08-28（二轮：v0.14 A/B/C/D 实施交付 584a1dc1 + 新增代码审查即修 15f306e0；A/B/C/D 设计规格 4 份归档）

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
| TD-2026-08-28-A | chapter_quality_scores 每章全量扫描 blocks（O(C×B)）+ 每块文本克隆——正确性无影响，纯性能优化项 | 无意 | P3 | 2026-08-28 | open |
| TD-2026-08-28-B | incremental_merge 循环内线性 find 导致 O(n²)——dead code 模块（已登记豁免），接线时（v0.14.1）修复 | 无意 | P3 | 2026-08-28 | open |

## 今日已偿

| ID | 摘要 | 偿还提交 |
|----|------|----------|
| 审查 M1 | 净化链① merge_two 英文行合并词间空格丢失（单词粘连）——ascii_gap 补空格 + 2 单测 | 15f306e0 |
| 审查 M2 | crop_line 无效 bbox 返回原图被送识别——rec_pipeline_on_blocks 过滤零宽高 bbox + 1 单测 | 15f306e0 |
| 审查 L2 | engine_worker 不可达分支裸 return 会终止 OCR worker 主循环——改 continue | 15f306e0 |
| 审查 L5 | 笔记删除后 knowledge_links 悬空引用（图谱悬空边）——delete_note 级联清理 target | 15f306e0 |
| 审查 L6 | GroupSidebar setState updater 内写 localStorage——副作用移出至 useEffect | 15f306e0 |

## 审查观察项（登记不立债）

| ID | 摘要 | 处置 |
|----|------|------|
| 观察 v0.13.9-1 | smartEdges 拖拽每帧 O(边数×节点数) 重算（useMemo 内 find）——节点 <100 微秒级 | 保持（画布规模增长后改 Map 索引） |
| 观察 v0.13.9-2 | textarea 可视区定位在 soft-wrap 下按 scrollTop 比例近似（长行折行误差）——已校正到行首 | 保持（精确逐行测高成本高收益低） |
| 观察 v0.13.9-3 | 可视区定位对所有工具栏插入类操作统一生效（设计文档原述标题类）——一致性改进，注释已明确口径 | 保持（行为更优，文档已同步） |
| 观察 2026-08-28-1 | docs-check 存量失效链接 18 处（本批归档零新增）：v0.13.4/0.13.5 spec 相对路径笔误（`../superpowers/specs/` 应为 `./`）×4、v0.14 spec 代码片段 `path`/`src` 误检 ×3、v0.10.1/v0.12.0/v0.12.4 路径模板与 `[[ts:]]` 代码引用误检 ×11 | 待专项治理（与归档无关，避免本批范围蔓延） |
| 观察 2026-08-28-2 | ensure_rec_engine 构建失败后每次请求重试完整模型加载（无冷却）——模型修复后自动恢复是收益 | 保持（deliberate：冷却会破坏自动恢复；影响面=异常场景重复失败加载） |
| 观察 2026-08-28-3 | D4 平台 ROI 应用接线（platform_layout/layout_reorder 生产消费）留 v0.14.1——模板/兜底资产已就绪并登记豁免 | 待 v0.14.1 接线 |

## 验证记录

- docs-check 链接校验通过（归档后活跃区引用全部改指归档路径）

## 关联

- 版本与需求：[v0.13 系列文档](../../versions/v0.13.md)（已交付 v0.13.1~9）
- 归档快照：[2026-08-28 README](./README.md) · [整合分析·方案 B（已归档 [ ] 已归档）](./personal-knowledge-system-layer-integration.md) · [竞品调研（赛道全景/品类深化，已归档）](./competitive-analysis-knowledge-system-layer.md)
