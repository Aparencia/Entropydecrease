# 2026-08-29 归档

> 归档日期：2026-08-29（v0.14.1 交付 + 新增代码审查即修）
> 归档对象：已实施完成的设计规格（生命终态）
> 当日权威债务清单见 [tech-debt.md](./tech-debt.md)

## 归档清单

| 源路径 | 归档路径 | 状态/原因 |
|--------|----------|-----------|
| [docs/superpowers/specs/2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md](../../superpowers/specs/2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md)（git mv 自） | [./2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md](./2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md) | **已实施完成**（交付 20da94e7 + 审查即修 313dd9ff），生命周期终结 [ ] 已归档 |

## 归档说明

- v0.14.1 设计规格（笔记组 CRUD + 画布连线/布局偏好）实施完成并入档——本批用户指令「任务二：文档归档」唯一匹配对象
- 版本文档 [docs/versions/v0.14.1.md](../../versions/v0.14.1.md) 属**不归档类**（versions/ 持续活跃），其中 spec 链接已改指归档路径并标 `[ ] 已归档`
- docs/standards/line-limit-exemptions.md 属 standards/ 不归档类（本次为登记内容更新，不随档移动）
- 未归档说明：无其他已实施完成文档（v0.14 A/B/C/D 规格已于昨日归档；今日无新 spec/ADR 产生）

## 技术债摘要

- **滚动**：昨日（2026-08-28）9 carried + 2 open → 全部核实为 **11 carried**（TD-2026-08-28-B 的修复前提 D4 接线在本版未发生，转入 carried；无 closed）
- **今日新增**：无残留 open——本次审查发现的问题（Rust 1 中 7 低，前端 2 高 5 中 12 低）全部即修（提交 313dd9ff）或登记观察项
- **观察项**：新增 2026-08-29-1/2/3（原子提交记录 / 会话暂停重连循环待确认实施 / 成环父引用防御低优先）；既有 2026-08-28-1/2/3 继承
- 权威清单：[tech-debt.md](./tech-debt.md)（11 carried + 6 观察项）

## 验证

- 前端 vitest 49 文件 409 用例全绿；`tsc --noEmit` 零错误
- Rust cargo test 1834 通过（3 预存失败与本次无关，clean HEAD 已复现）
- docs-check 链接校验通过（归档后活跃区引用全部改指归档路径）
