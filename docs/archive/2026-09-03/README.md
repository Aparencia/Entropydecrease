# 归档：2026-09-03

> 归档日期：2026-09-03（v0.19.0~1「检索与发现层」交付 + 三段并行新增代码审查即修）
> 关联：v0.19 交付 2 提交（2da0281b/970bea58）+ 审查修复 2 提交（402da10/bdd63383，本日）· [债务清单](./tech-debt.md)

## 归档清单

| 源路径 | 归档路径 | 状态 |
|--------|----------|------|
| [docs/superpowers/specs/2026-09-03-v0.19-rag-retrieval-discovery-design.md](../superpowers/specs/2026-09-03-v0.19-rag-retrieval-discovery-design.md) | [2026-09-03-v0.19-rag-retrieval-discovery-design.md](./2026-09-03-v0.19-rag-retrieval-discovery-design.md) | [ ] 已归档（检索与发现层设计：派生索引 + 双读路径 + 人工裁决闭环——v0.19.0（索引基建/REQ-258）与 v0.19.1（学习库问答/REQ-260、REQ-262 部分）已实施交付并经新增代码审查即修；v0.19.2（检索建议）/v0.19.3（语义增强）按批次实施时沿用归档 spec——v0.18 M1 同批先例；git mv 保留历史链） |

## 不归档说明

- **ADR-029**（rag-retrieval-discovery-layer，当前生效）与 **ADR-030**（asr-quality-batch，当日立项）——生效 ADR 不归档
- **v0.19.0/v0.19.1 版本文档**（versions/）与 **requirements-pool REQ-258~262 登记**——活跃登记区，不归档
- **docs/superpowers/specs/ 其余 spec**（screen-ocr/learning-loop/ai-platform 等）——部分实施/待验收/待裁决，保持活跃（08-23 候选判读登记先例）

## 活跃区链接更新

| 文件 | 变更 |
|------|------|
| docs/adr/ADR-029-rag-retrieval-discovery-layer.md | spec 链接改指归档路径 + `[ ] 已归档`（2 处：状态行 + 关联行） |
| docs/adr/ADR-030-asr-quality-batch.md | 同上（关联行 v0.19 设计链接，1 处） |
| docs/product/requirements-pool.md | 同上（v0.19 区段设计行，1 处） |
| docs/versions/v0.19.0.md | 同上（header 依据行，1 处） |
| docs/versions/v0.19.1.md | 同上（header 依据行，1 处） |

## 技术债摘要

- 昨日 8 笔校核：**均未发生偿还条件 → 继承 carried**（TD-040 / TD-19-D / TD-24-A / TD-30-A / TD-30-B / TD-31-A / TD-31-B / TD-31-C；TD-24-A/TD-30-A 行数实测刷新：lib.rs 867、ClassroomPage 643；TD-30-B 今日全量复现 2 例确认预存）
- **今日已偿 0 笔**（既有债务）；**预存红测试对齐 1 项**（budget pack_fragments 截断断言，402da10——v0.18.2 遗留，非登记债）
- **新增代码三段并行审查即修 13 项**（H×3/M×5/L×5，详见债务清单「今日已偿/即修」；核心：焦点陈旧重定向 / fts-only limit 8× 超发（并激活漏挂的 kb_search 测试模块，现红 4 例修复）/ 失败引用保留 / regenerate 流标志泄漏 / 引号 token 静默漏检 / 滑窗膨胀有界 / reindex 整清+元数据落点 / 编辑态注入守卫 / 轮询 active 门控）
- **新增 open 0 笔**；观察项 5 登记（保存钩子事务化候选/切块线性化候选/重建报告口径说明/FE 测试缺口/事件分发加固说明）

## 验证记录

- Rust 全量 `cargo test`：2048 通过 / 2 失败（note_filter 预存，TD-30-B）/ 6 ignored；`kb_` 域 67 用例全绿；clippy 零警告（预存 lib.rs 多 target 提示除外）
- 前端 vitest 525/525 全绿；`tsc --noEmit` 零错误
- 归档链路：spec 已跟踪确认 → git mv 保留历史 → 5 个活跃区文件改指归档路径
