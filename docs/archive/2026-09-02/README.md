# 归档：2026-09-02

> 归档日期：2026-09-02（v0.18.0「学习目标层 M1」交付 + 新增代码七维审查即修）
> 关联：v0.18.0 交付 4 提交（7a369cf7~6eb28c67）+ 审查修复 2 提交（60f4d1e/57c4dd7，本日）· [债务清单](./tech-debt.md)

## 归档清单

| 源路径 | 归档路径 | 状态 |
|--------|----------|------|
| [docs/superpowers/specs/2026-09-02-v0.18-learning-goals-design.md](../superpowers/specs/2026-09-02-v0.18-learning-goals-design.md) | [2026-09-02-v0.18-learning-goals-design.md](./2026-09-02-v0.18-learning-goals-design.md) | [ ] 已归档（学习目标层意图式设计：M1 目标对象+访谈式设定+聚合视图已实施交付；M2/M3（毕业仪式/回顾流/AI 教练默认关）按批次实施时沿用归档 spec——v0.13.6~9 同批先例；git mv 保留历史链） |

## 不归档说明

- **ADR-027**（goal-layer-modeling）——当前生效 ADR，不归档（归档规则：生效 ADR 持续活跃）
- **v0.18.0 版本文档**（versions/）——versions/ 内容不归档（同 v0.15/v0.16.x 先例）
- **requirements-pool REQ-030/REQ-248~250 登记**——活跃登记区，不归档
- **v0.18.1/v0.18.2 系列规划引用**——归档后 3 个活跃区链接已改指归档路径并标 `[ ] 已归档`

## 活跃区链接更新

| 文件 | 变更 |
|------|------|
| docs/adr/ADR-027-goal-layer-modeling.md | spec 链接改指归档路径 + `[ ] 已归档`（2 处） |
| docs/product/requirements-pool.md | 同上（v0.18 区段设计行） |
| docs/versions/v0.18.0.md | 同上（header 依据行 + 关联行，2 处） |

## 技术债摘要

- 昨日 8 笔校核：**均未发生偿还条件 → 继承 carried**（TD-040 / TD-19-D / TD-24-A / TD-30-A / TD-30-B / TD-31-A / TD-31-B / TD-31-C；其中 **TD-30-B note_filter 预存 2 例于本日全量复现并经独立 HEAD worktree 复核确认为预存**；TD-31-B 备注更新——本批新增 1 处 window.confirm，余 13 处未决）
- **今日已偿 0 笔**（无既有债务偿还）；**新增代码七维审查即修 8 项**（P1×2 / P2×4 / P3×2，详见债务清单「今日已偿」；核心：访谈时限 chips 创建丢失 / skipped 里程碑拖死判据 / 重访谈改名不落地 / 两命令未接线 / 无期限宣言病句 / 防御取数 / 文本上限 / 热词预填）
- **新增 open 0 笔**；观察项新增 2（2026-09-02-1/2：GoalDetail 组件级测试未覆盖（核心命令契约已由后端单测覆盖，登记后续）；删除确认 window.confirm 与 TD-31-B 合并追踪）

## 验证记录

- 前端 vitest 66 文件 507 用例全绿（含审查新增断言）；`tsc --noEmit` 零错误
- Rust 全量 `cargo test`：1932 通过；仅 2 例 note_filter 预存失败（TD-30-B，与本批无关）；clippy 零警告
- 归档链路：spec 已跟踪确认 → git mv 保留历史 → 3 个活跃区文件改指归档路径
