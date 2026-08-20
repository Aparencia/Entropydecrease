# 归档索引：2026-08-21（v0.8.0 M1~M4 + AI 精修非功能扩展 F0~F3 + 新增代码审查批次 ×2）

> 归档判定见 [archive README](../README.md)。本日归档夹为技术债滚动快照（唯一权威清单）。

## 归档清单

**本日归档 1 份**（首轮 0 份 + 二轮 1 份）：

| 源路径 → 归档路径 | 归档原因/状态 |
|------|-----------|
| `docs/archive/2026-08-21/brainstorming-ai-refine-nonfunctional-rebuild.md`（创建即入归档夹，提交 919b544） | **[ ] 已归档**——AI 精修非功能扩展设计文档：P0 契约断裂实证 + P1 修复 + 任务中心/协议 v2/评测框架；F0~F3 全部实施完成（提交 1845462~b75db82，1294 单测全绿），生命周期终结 |

**不归档候选**（持续活跃，规则明确排除）：

| 候选文档 | 不归档原因 |
|------|-----------|
| `docs/adr/ADR-016-ai-credentials-dpapi.md` | 当前生效 ADR（规则明确不归档） |
| `docs/versions/v0.8.0.md` | versions/ 内容（M0/M5 未完成，规划与实施记录持续活跃） |
| `docs/product/requirements-pool.md`（v0.8.0 区块） | 活跃需求池（REQ-138~147 持续更新） |
| `CHANGELOG.md` / `docs/standards/line-limit-exemptions.md` | 持续活跃（规则明确不归档） |
| `docs/Foresight/long-term-optimization-checklist.md` | **未被 git 跟踪**（非本次产出）——按前置条件排除，不补充提交 |

## 本批工作摘要（二轮：AI 精修全链路 F0~F3 + 新增代码审查）

- **AI 精修全链路代码建设四里程碑交付**（提交 1845462/897ee96/ba9e618/b6ad051/f06fd7f/6e72c5d/afca35f/7f575cd/790f964/b75db82，1294 单测全绿）：
  - F0 契约断裂修复（P0 根因实证：AiTaskState serde camelCase 与前端 PascalCase 失配 → 调用有记录但结果永不使用）——契约对齐 + 快照单测
  - F1 修复补齐：丢图（配图行缺括号 bug + 本地合并降级）、模型→单价映射 + 预估含输出、审计补齐、配额接入 + 任务去重
  - F2 任务中心：ai_tasks SQLite 表/启动恢复/全局任务面板/完成通知/切片并发 2-3 + 单片重试 + 部分成功
  - F3 协议 v2（image 块防丢图/片间上下文防结构错乱/schema_version 向后兼容）+ 成本硬拦截 + golden 结构回归评测（内置样本集 mock 全链路）
- **新增代码七维审查即修 9 项**（提交 564dfc5）：P0×2（去重粒度/拦截顺序）· P1×5（采纳幂等/落库成本模型感知/补充单片重试/任务表运行期裁剪/any 类型+契约同步）· P2×2（toast timer 清理/部分成功前端提示）；审查确认无问题项：接入性/性能/冗余/规范/安全（1294 单测全绿 + clippy 新代码清零 + 前端 tsc/build 通过）
- 验证：1294 单测全绿（基线 1271 + 新增 23）+ 前端构建通过

## 技术债摘要

- **未偿 5 笔**（全部 carried，核验保持）：TD-040（deliberate）+ TD-2026-08-19-D/F/G + TD-2026-08-21-A（存量 clippy 9 个）
- **今日已偿 15 笔**：首轮审查 C1~C6（354dd3d）+ 二轮审查 9 项（564dfc5：去重粒度/拦截顺序/采纳幂等/成本模型感知/补充重试/运行期裁剪/any 类型/toast timer/部分成功提示）
- **新登记 open 0 笔**：二轮审查无遗留；观察项 3 条保持（B6 宽松匹配/事件 deps/apply 两步落库）+ 昨日观察 8 条继承

## 关联

- 版本与需求：[v0.8.0 版本文档](../../versions/v0.8.0.md) · [需求池 REQ-138~147](../../product/requirements-pool.md)
- 设计文档：[AI 精修非功能扩展设计（[ ] 已归档）](./brainstorming-ai-refine-nonfunctional-rebuild.md)
- 技术债：[tech-debt.md](./tech-debt.md)（唯一权威清单）
