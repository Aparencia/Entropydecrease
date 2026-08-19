# 前瞻构想（Foresight）

> 未排期的战略构想、设计文档与头脑风暴。**已立项内容移入 `product/` 或 `versions/` 跟踪**。

## 使用规则

- 状态标注：每篇文档头部必须标注 `**状态**: 前瞻构想（未排期）` 或具体状态（已立项/已实现/已归档）
- 头脑风暴产物用 [brainstorm-template.md](../templates/brainstorm-template.md)
- 竞品/调研分析用 [third-party-eval-template.md](../templates/third-party-eval-template.md)
- 落地完成后：文档移入 `archive/YYYY-MM-DD/` 快照，索引标 `[ ] 已归档`

## 建议文件

| 文档 | 何时需要 |
|------|---------|
| [market-stack-asr-notes-research.md（[ ] 已归档）](../archive/2026-08-19/market-stack-asr-notes-research.md) | 市场技术栈/ASR 策略/笔记生成策略调研（2026-08，支持 Tauri 技术决策；2026-08-19 技术栈裁决完成归档） |
| [brainstorming-no-cloud-ai-extraction-limit.md](./brainstorming-no-cloud-ai-extraction-limit.md) | 无云端 AI 的内容提取极限头脑风暴（2026-08-18：能力分层 + 挖掘方向 + 性能预算制） |
| [brainstorming-classroom-assistant-mechanisms.md](./brainstorming-classroom-assistant-mechanisms.md) | 课堂助手机制摘要：系统快照 + 已实现/已排期/已否决清单 + A–G 机制候选 + ROI 排序（供其他 AI 模型头脑风暴输入） |
| [brainstorming-classroom-assistant-mechanisms-fed-guide.md](./brainstorming-classroom-assistant-mechanisms-fed-guide.md) | 机制摘要投喂指南：文档结构与使用方法说明（配套 mechanisms 文档） |
| [brainstorming-video-profile-detection.md](./brainstorming-video-profile-detection.md) | 档案自动检测准确度头脑风暴（2026-08：根因代码级定位（仅标题信号在生效/关键词重叠/无负证据/无反馈闭环）+ 20 项候选 + 三批落地建议） |
| [video-data-extraction-inventory.md](./video-data-extraction-inventory.md) | 视频可提取数据清单（2026-08：音/字/图/构/行/产六层 30 项，逐项标注已投入/未接线/未实现） |
| [brainstorming-classroom-assistant-gaps.md（[ ] 已归档）](../archive/2026-08-19/brainstorming-classroom-assistant-gaps.md) | 课堂助手缺口评估：提取 / 性能 / 算法 / 体验 四维头脑风暴（2026-08：50 项机制评估；§9 裁决 22 项已排期 v0.6.0 → REQ-059~080；未选与远期项保留于归档副本待议） |
| [brainstorming-video-types.md（[ ] 已归档）](../archive/2026-08-19/brainstorming-video-types.md) | 视频类型 × 提取优化 × 图片配套 × 结构预处理 × 产物形态 × 补缝式 AI 头脑风暴（2026-08-18：六轮，已采纳进 v0.5.0；2026-08-19 归档） |
| [2026-08-19-ocr-trigger-redesign.md（[ ] 已归档）](../archive/2026-08-19/2026-08-19-ocr-trigger-redesign.md) | OCR 触发重做与 UI 面板抑制设计规格（2026-08-19：ADR-011/REQ-086/087 已实施 M1-M3，659 单测全绿，M4 真机验收待执行；2026-08-19 归档） |
| [classroom-capture-technical-review.md（[ ] 已归档）](../archive/2026-08-18/classroom-capture-technical-review.md) | 课堂采集链路技术审查（2026-08-18：四链要点核查 + 缺陷与更佳方案 + 头脑风暴项筛选；A 档七项已实施，2026-08-18 归档） |
| [analysis-classroom-assistant-pipeline-deep-optimization.md（[ ] 已归档）](../archive/2026-08-19/analysis-classroom-assistant-pipeline-deep-optimization.md) | 课堂助手三阶段管线深度优化空间（2026-08-19：预处理/核心/后处理逐环节代码级缺陷定位 + 深度优化空间 30 项；2026-08-19 裁决完成——PRE/CORE/POST/X-O 流转 v0.7.0 REQ-098~120，归档） |
| [requirements-decision-table-classroom-assistant-deepening.md（[ ] 已归档）](../archive/2026-08-19/requirements-decision-table-classroom-assistant-deepening.md) | 课堂助手深化需求裁决表（2026-08-19：三源合并 143 条目 + 六轴逐项裁决 + 二轮架构探讨（M-存储/三通道模型）；2026-08-19 裁决完成——v0.7.0 登记 REQ-088/098~134，归档） |
| roadmap.md | 有阶段性路线图时 |
| brainstorming-*.md | 功能创意发散时 |
| competitive-analysis.md | 竞品调研时 |

## 维护规则

- 每篇 Foresight 文档在 docs/README.md 总导航中登记
- 定期（如每季度）清理：已实施 → 归档；长期未排期 → 保留但标注日期
