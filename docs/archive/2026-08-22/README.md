# 归档索引：2026-08-22（pain-points v2/v3 被 v4 统一卷取代归档 + v0.11.5 设计文档/实现计划归档 + v0.11.6 M1 实现计划归档 + v0.11.7 spec/plan 归档）

> 归档判定见 [archive README](../README.md)。本日归档夹为技术债滚动快照（唯一权威清单）。

## 归档清单

**本日归档 7 份**：

| 源路径 → 归档路径 | 归档原因/状态 |
|------|-----------|
| `docs/product/pain-points-v2.md` → `docs/archive/2026-08-22/pain-points-v2.md` | **[ ] 已归档**——v2.0 双卷认知地图，已被 v4.0 统一卷整合取代 |
| `docs/product/pain-points-v3.md` → `docs/archive/2026-08-22/pain-points-v3.md` | **[ ] 已归档**——v3.0 融合裁决卷，裁决内容已内化为 v4 正文 |
| `docs/superpowers/specs/2026-08-22-v0.11.x-capture-notes-polish-design.md` → `docs/archive/2026-08-22/2026-08-22-v0.11.x-capture-notes-polish-design.md` | **[ ] 已归档**——v0.11.5 设计 spec，11 项已全部实施交付 |
| `docs/superpowers/plans/2026-08-22-v0.11.5-capture-notes-polish.md` → `docs/archive/2026-08-22/2026-08-22-v0.11.5-capture-notes-polish.md` | **[ ] 已归档**——v0.11.5 实现计划，14 Task 全部执行完成 |
| `docs/superpowers/plans/2026-08-22-v0.11.6-m1-ai-provider.md` → `docs/archive/2026-08-22/2026-08-22-v0.11.6-m1-ai-provider.md` | **[ ] 已归档**——v0.11.6 M1 实现计划，7 Task 全部执行完成 + 两轮审查闭环（TDD/Subagent-Driven） |
| `docs/superpowers/specs/2026-08-22-v0.11.7-photo-session-design.md` → `docs/archive/2026-08-22/2026-08-22-v0.11.7-photo-session-design.md` | **[ ] 已归档**——v0.11.7 设计 spec，T1-T7 全链路实施交付 + 六维审查 8 项即修闭环（25386d9） |
| `docs/superpowers/plans/2026-08-22-v0.11.7-photo-session.md` → `docs/archive/2026-08-22/2026-08-22-v0.11.7-photo-session.md` | **[ ] 已归档**——v0.11.7 实现计划，7 Task 全部执行完成（T1~T6 五提交 + T7 文档收尾 172f490） |

**取代文档**：`docs/product/pain-points-v4.md`（统一卷：两地形、一产物、一循环）成为唯一主导规划文档。

## 工作摘要（v2+v3 → v4 整合）

- **整合动因**：用户指出 v2（双卷理论）与 v3（外挂裁决卷）并行生效造成阅读分裂——读者需在两份文档间手动合并理论
- **整合原则**：按主题组织而非按文档史组织；v2 上下卷的平行结构（指标/护城河/Pre-mortem/路线图各两份）合并为统一框架下的地形分叉表述；v3 三裁决内化为正文
- **v4 结构**（12 部分 + 4 附录）：底层哲学（成为隐喻/叙事熵/稳态瞬态）→ 地形定义（结构承载性判据）→ 统一理论（同步器广义模型 = 飞轮+离合器的两地形特例）→ N1–N25 统一清单 → 两地形状态对照表 → 公共底座/分叉管线/统一产物层（笔记组三契约）→ 统一指标（北极星：组学习循环完成）→ 统一护城河（指标异端）→ 统一 Pre-mortem（14 死法合并排序）→ 路线图（Phase 1-4 执行轴 + 理论节点远期映射）→ 版本线与功能开关 → 元理论
- **零信息丢失原则**：v2/v3 全部实质内容入 v4；头脑风暴过程细节（S/F 内部编号未收敛项、67→17 对账明细）以摘要形式入附录 D，全文保留于归档副本

## 技术债摘要

- **已偿 2 笔**：TD-2026-08-21-B（时间戳锚点断言过时，1521 全绿核验 closed）+ v0.11.5 六维审查 20+ 项（独立修复提交清偿）；M1 七维审查 11 项全部即修（464533d + 审查修复提交）
- **新登记 open 0 笔**（M1 审查无遗留 open；观察项 4 条登记见 tech-debt.md）
- **未偿 5 笔继承 + 1 笔补登**（TD-040 / TD-2026-08-19-D/F/G / TD-2026-08-21-B→closed / TD-2026-08-21-C 补登 carried）；详见本目录 tech-debt.md

### 六轮补充（v0.11.7 图文会话交付 + 六维审查 + 归档）

- **已偿 8 项**：v0.11.7 六维审查 P1-P8 全部即修（25386d9：store 失败回滚/像素上限/计数口径/互斥 TOCTOU 窗口/Esc+resize/裁剪越界/再来一组）；cargo test 1521 全绿 + tsc 零错误 + vitest 49 通过
- **新登记 open 1 笔**：TD-2026-08-22-A（clippy --all-targets -D warnings 20 项错误——存量 + v0.11.6 M1 引入，未随 M1 验收闭环）
- **未偿 6 笔**（TD-040 / TD-2026-08-19-D/F/G / TD-2026-08-21-C 保持 carried + TD-2026-08-22-A open）；详见本目录 tech-debt.md

## 备注

- 本日归档完成后即最新归档，下个归档日需先整理本日清单
