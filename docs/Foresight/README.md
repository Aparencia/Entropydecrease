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
| [market-stack-asr-notes-research.md](./market-stack-asr-notes-research.md) | 市场技术栈/ASR 策略/笔记生成策略调研（2026-08，支持 Tauri 技术决策） |
| [brainstorming-no-cloud-ai-extraction-limit.md](./brainstorming-no-cloud-ai-extraction-limit.md) | 无云端 AI 的内容提取极限头脑风暴（2026-08-18：能力分层 + 挖掘方向 + 性能预算制） |
| [brainstorming-video-types.md](./brainstorming-video-types.md) | 视频类型 × 提取优化 × 图片配套 × 结构预处理 × 产物形态 × 补缝式 AI 头脑风暴（2026-08-18：六轮，已采纳进 v0.5.0） |
| [classroom-capture-technical-review.md（[ ] 已归档）](../archive/2026-08-18/classroom-capture-technical-review.md) | 课堂采集链路技术审查（2026-08-18：四链要点核查 + 缺陷与更佳方案 + 头脑风暴项筛选；A 档七项已实施，2026-08-18 归档） |
| roadmap.md | 有阶段性路线图时 |
| brainstorming-*.md | 功能创意发散时 |
| competitive-analysis.md | 竞品调研时 |

## 维护规则

- 每篇 Foresight 文档在 docs/README.md 总导航中登记
- 定期（如每季度）清理：已实施 → 归档；长期未排期 → 保留但标注日期
