# 归档索引：2026-08-21（v0.8.0 M1~M4 代码建设 + 新增代码审查批次）

> 归档判定见 [archive README](../README.md)。本日归档夹为技术债滚动快照（唯一权威清单）。

## 归档清单

**本日归档 0 份**（无生命终态文档——全部产出为实施中/活跃态）：

| 候选文档 | 不归档原因 |
|------|-----------|
| `docs/adr/ADR-016-ai-credentials-dpapi.md` | 当前生效 ADR（规则明确不归档——密钥凭据存储决策持续引用） |
| `docs/versions/v0.8.0.md` | versions/ 内容（规则明确不归档——M0 验收总清/M5 契约测试未完成，规划与实施记录持续活跃） |
| `docs/product/requirements-pool.md`（v0.8.0 区块） | 活跃需求池（REQ-138~147 已排期/实施状态持续更新） |
| `CHANGELOG.md` / `docs/standards/line-limit-exemptions.md` | 持续活跃（规则明确不归档） |
| `docs/Foresight/long-term-optimization-checklist.md` | **未被 git 跟踪**（会话开始前已存在、非本次产出）——按前置条件排除本次归档，不补充提交 |

## 本批工作摘要（v0.8.0 M1~M4 + 新增代码审查）

- **v0.8.0 代码建设四里程碑交付**（提交 7818e90/12c5a13/fcd09c4/b4e7e79/4c44297）：M1 AI 使能层（密钥 DPAPI/余额/授权审计/共享 client）· M2 AI 精修（双模式/diff/异步任务/成本确认基础版）· M3 知识补充（九子项/混合落位/B6 无链接）· M4 版本管理+成本完整（快照链/回滚/时间线/note_ai_usage）
- **新增代码七维审查即修 6 项**（提交 354dd3d）：C1 URL 丢失 /v1 404（高，波及既有复核）· C2 前端轮询泄漏 · C3 双跑分析 · C4 过期 dead_code 豁免 · C5 trim_tasks 边界 · C6 动态 import 不一致；审查确认无问题项：接入性/安全性/牵连性回归（1265 单测全绿 + clippy 新代码清零 + 前端构建通过）
- 验证：1265 单测全绿 + 前端构建通过

## 技术债摘要

- **未偿 4 笔**（全部 carried，核验保持）：TD-040（deliberate）+ TD-2026-08-19-D/F/G
- **今日已偿 6 笔**：审查 C1~C6（提交 354dd3d）
- **新登记 open 1 笔**：TD-2026-08-21-A（存量 clippy 告警 9 个——未改动文件、clippy 版本漂移）+ 观察项 3 条新增（B6 宽松匹配/事件 deps/apply 两步落库）+ 昨日观察 8 条继承

## 关联

- 版本与需求：[v0.8.0 版本文档](../../versions/v0.8.0.md) · [需求池 REQ-138~147](../../product/requirements-pool.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）
