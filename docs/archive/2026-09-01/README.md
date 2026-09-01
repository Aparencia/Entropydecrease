# 归档：2026-09-01

> 归档日期：2026-09-01（v0.17.0「AI 精修可到达度」交付 + 新增代码七维审查即修）
> 关联：v0.17.0 交付 5 提交（a96cbbd~3b4936a）+ 审查即修（本日）· [债务清单](./tech-debt.md)

## 归档清单

| 源路径 | 归档路径 | 状态 |
|--------|----------|------|
| [docs/superpowers/specs/2026-09-01-ai-refine-strategy-flow-design.md](../superpowers/specs/2026-09-01-ai-refine-strategy-flow-design.md) | [2026-09-01-ai-refine-strategy-flow-design.md](./2026-09-01-ai-refine-strategy-flow-design.md) | [ ] 已归档（策略化提示词+笔记级+流式会话化设计，REQ-245~247 全部实施交付，生命周期终结；git mv 保留历史链） |

## 不归档说明

- **ADR-026**（ai-refine-strategy-flow）——当前生效 ADR，不归档（归档规则：生效 ADR 持续活跃）
- **v0.17.0 版本文档**（versions/）——versions/ 内容不归档（同 v0.15/v0.16.x 先例）
- **requirements-pool REQ-245~247 登记**——活跃登记区，不归档

## 活跃区链接更新

| 文件 | 变更 |
|------|------|
| docs/adr/ADR-026-ai-refine-strategy-flow.md | spec 链接改指归档路径 + `[ ] 已归档` |
| docs/product/requirements-pool.md | 同上（REQ-245~247 依据行） |
| docs/versions/v0.17.0.md | 同上（设计行） |

## 技术债摘要

- 昨日 8 笔校核：**均未发生偿还条件 → 继承 carried**（TD-040 / TD-19-D / TD-24-A / TD-30-A / TD-30-B / TD-31-A / TD-31-B / TD-31-C；其中 TD-30-B 于本日全量复现确认与 v0.17.0 零触及；TD-31-B 附部分进展注——精修授权确认已改写为应用内对话框，余 12 处未决）
- **今日已偿 0 笔**（无既有债务偿还）；**新增代码七维审查即修 6 项**（P0×2 / P1×1 / P2×3，详见债务清单「今日已偿」；核心：笔记级精修闭环缺失 / 双入口 ref_id 语义错跳 / 重生成不回传策略档位 / 流式订阅容错 / 死分支清理 / 组件级测试补强）
- **新增 open 0 笔**；观察项新增 5（v0.17.0-1~5：对话页策略区未接 / 再来一版 UI / 版本号漂移 / 预存红与环境问题 / 预览防抖说明）

## 验证记录

- 前端 vitest 64 文件 496 用例全绿（含审查新增 2 项）；tsc 零错误
- Rust 全量：核心改动测试全绿；仅 2 例 note_filter 预存失败（TD-30-B）；clippy 新代码零警告
