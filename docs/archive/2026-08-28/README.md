# 归档索引：2026-08-28

> 当日归档快照——不可变、仅可阅读；债务权威见 [tech-debt.md](./tech-debt.md)。

## 归档清单

| 源路径 | 归档路径 | 归档原因/状态 |
|--------|---------|--------------|
| docs/Foresight/competitive-analysis-knowledge-system-layer.md | [./competitive-analysis-knowledge-system-layer.md](./competitive-analysis-knowledge-system-layer.md) | v0.13 系列立项依据——v0.13.1~9 代码已交付，立项使命完成（[ ] 已归档） |
| docs/Foresight/competitive-analysis-knowledge-system-software.md | [./competitive-analysis-knowledge-system-software.md](./competitive-analysis-knowledge-system-software.md) | v0.13 体系层 spec 输入——v0.13 系列已交付，调研使命完成（[ ] 已归档） |
| docs/Foresight/personal-knowledge-system-layer-integration.md | [./personal-knowledge-system-layer-integration.md](./personal-knowledge-system-layer-integration.md) | 整合分析·方案 B——已批准并落位 v0.13 系列（v0.13.1~9 交付），生命周期终结（[ ] 已归档） |
| docs/Foresight/source-personal-knowledge-system-guide-v2.md | [./source-personal-knowledge-system-guide-v2.md](./source-personal-knowledge-system-guide-v2.md) | 指南源文档——整合分析的对象原文，随整合分析一并归档（[ ] 已归档） |
| docs/superpowers/specs/2026-08-27-v0.14-editor-experience-design.md | [./2026-08-27-v0.14-editor-experience-design.md](./2026-08-27-v0.14-editor-experience-design.md) | v0.14 A 编辑器 spec——已实施交付（7b01da58），生命周期终结（[ ] 已归档） |
| docs/superpowers/specs/2026-08-28-v0.14-visual-system-design.md | [./2026-08-28-v0.14-visual-system-design.md](./2026-08-28-v0.14-visual-system-design.md) | v0.14 B 视觉系统 spec——已实施交付（584a1dc1），生命周期终结（[ ] 已归档） |
| docs/superpowers/specs/2026-08-28-v0.14-knowledge-system-design.md | [./2026-08-28-v0.14-knowledge-system-design.md](./2026-08-28-v0.14-knowledge-system-design.md) | v0.14 C 知识体系 spec——已实施交付（584a1dc1），生命周期终结（[ ] 已归档） |
| docs/superpowers/specs/2026-08-28-v0.14-capture-quality-design.md | [./2026-08-28-v0.14-capture-quality-design.md](./2026-08-28-v0.14-capture-quality-design.md) | v0.14 D 采集质量 spec——已实施交付（584a1dc1，D4 ROI 接线登记 v0.14.1），生命周期终结（[ ] 已归档） |

## 当日交付摘要

- **v0.14 A/B/C/D 设计规格归档 4 份**（代码已交付，生命周期终结）：编辑器体验（A，7b01da58）+ 视觉系统（B）/知识体系（C）/采集质量（D，584a1dc1，D4 ROI 接线留 v0.14.1）；git mv 保留历史
- **活跃区索引同步**：versions/v0.14.md 子项目 A 设计规格链接与 B/C/D 状态表 spec 链接改指归档路径并标 `[ ] 已归档`
- 上午批（v0.13 系列 4 份 Foresight）：Foresight/README.md、versions/v0.13.md、requirements-pool、设计理念、ADR-024、v0.13.1~4 specs 引用同步（见本 README 既有记录）

## 技术债摘要

- 继承昨日 9 笔未偿（TD-040 + TD-2026-08-19-D/F/G + TD-21-C + TD-22-A + TD-24-A/B/C）→ 全部 carried（本批代码未触及这些区域；新增代码审查即修 5 项见 tech-debt.md 已偿）
- 今日新增：TD-2026-08-28-A（chapter_quality_scores 每章全量扫描 + 文本克隆）/ TD-2026-08-28-B（incremental_merge O(n²) 线性 find，dead code 接线时修）→ open 2 笔
- 今日已偿：5 笔（审查即修，提交 15f306e0）
- 观察项：继承 3 条（v0.13.9-1/2/3）+ 新增 2 条（引擎重试无冷却 deliberate / D4 接线留 v0.14.1）
