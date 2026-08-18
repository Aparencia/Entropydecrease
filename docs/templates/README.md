# 文档模板索引

> 新文档一律从模板复制，保持格式统一。选择指南见下表。

## 模板清单

| 模板 | 何时使用 | 产出位置 |
|------|---------|---------|
| [adr-template.md](./adr-template.md) | 做出重要技术/架构决策时 | `docs/adr/ADR-XXX-*.md` |
| [prd-template.md](./prd-template.md) | 新功能立项，需要完整需求规格 | `docs/product/` |
| [brainstorm-template.md](./brainstorm-template.md) | 需求发散、创意收集阶段 | `docs/Foresight/` |
| [mvp-canvas-template.md](./mvp-canvas-template.md) | 用一张画布快速验证产品构想（按需启用） | `docs/product/` |
| [estimation-template.md](./estimation-template.md) | 排期/工作量估算（按需启用） | `docs/Foresight/` |
| [knowledge-card-template.md](./knowledge-card-template.md) | 沉淀踩坑记录/技术方案/学习笔记/最佳实践 | `docs/knowledge/bugs|solutions|learnings/` |
| [postmortem-template.md](./postmortem-template.md) | 事故/问题复盘 | `docs/knowledge/bugs/` 或 `docs/archive/` |
| [release-checklist.md](./release-checklist.md) | 发版前逐项检查 | 发版流程随附 |
| [sprint-review-template.md](./sprint-review-template.md) | 迭代周期回顾 | `docs/versions/` |
| [third-party-eval-template.md](./third-party-eval-template.md) | 评估第三方服务/依赖选型 | `docs/Foresight/` |
| [db-migration-template.md](./db-migration-template.md) | 数据库迁移设计 | `docs/versions/` 或随迁移 PR |
| [archive-template.md](./archive-template.md) | 归档日索引与快照 | `docs/archive/YYYY-MM-DD/` |

## 选择指南（速查）

```
新功能立项         → prd-template
技术选型/设计决策  → adr-template
创意发散/方向探讨  → brainstorm-template
踩坑/方案沉淀      → knowledge-card-template
发版准备           → release-checklist
事故复盘           → postmortem-template
```

## 维护规则

- 模板与 [文档编写规范](../standards/documentation.md) 保持一致；规范变更时同步更新模板
- 模板文件保持通用性：禁止写入项目特有内容（品牌名、具体功能等）
- 新增模板时同步更新本索引
