# 2026-08-24 归档索引

> 常规归档（按 SOP 6 步）：昨日（2026-08-23）清单已核对滚动；本日执行 v0.13.6 交付后的新增代码审查（三段并行 + 跨切面）与修复即修批，并归档 v0.13.6 设计规格。
> **二轮（v0.13.7 交付）**：v0.13.7 全量 13 任务完成 + 审查 Critical 修复合入后，归档 v0.13.7 设计规格与实施计划。

## 归档内容

- 实施文档：[2026-08-23-v0.13.6-video-profile-classification-refinement-design.md](./2026-08-23-v0.13.6-video-profile-classification-refinement-design.md)（`[ ] 已归档`，标注于 [CHANGELOG](../../CHANGELOG.md) 与 [v0.13 系列文档](../../versions/v0.13.md)）——v0.13.6 已全量实施交付（M1 修复批 + M2 形态展平 + M3 领域两层 + M4 检测链），生命周期终结
- 设计规格：[2026-08-24-v0.13.7-knowledge-system-onboarding-design.md](./2026-08-24-v0.13.7-knowledge-system-onboarding-design.md)（`[ ] 已归档`，标注于 [CHANGELOG](../../CHANGELOG.md) 与 [v0.13 系列文档](../../versions/v0.13.md)）——v0.13.7 全量 13 任务已代码交付（触点①②③ + 示例体系 + 具象化 + 纪律裁决 + 跨页跳转），生命周期终结
- 实施计划：[2026-08-24-v0.13.7-knowledge-system-onboarding.md](./2026-08-24-v0.13.7-knowledge-system-onboarding.md)（`[ ] 已归档`）——全部 13 任务执行完成 + 审查 Critical 修复合入，计划已闭环

> 判定依据（archive README）：已执行/已实施的设计 spec → 终态归档；v0.13.1~5 规格仍被激活中的 v0.13.2~5（立项未实施）文档引用或系列未发布——持续活跃，排除本次归档。

## 技术债摘要

- 未偿 7 笔（6 carried + 1 open）：TD-040 / TD-2026-08-19-D/F/G（carried 4 笔）+ TD-2026-08-21-C（carried）+ TD-2026-08-22-A（clippy 存量，本批复核零新增仍 carried）+ **TD-2026-08-24-A（open：lib.rs 703 / live_session_frame.rs 683 超 600 硬限预存债务，已登记豁免并承接 v0.13.7 拆分计划）**；详见 [tech-debt.md](./tech-debt.md)
- 本日二轮（v0.13.7 审查）新登记：**TD-2026-08-24-B（open：sysBrief 仅查 groupLinks[0] 体系，多体系组 stale 判定不全）+ TD-2026-08-24-C（open：KnowledgePage refreshGlobal={0} 未接线死参数）**
- 本日即修：新增代码审查（七维）——高×2（领域记忆兜底死代码 / ESC 出口刷新竞态重演 P0）、中×6（烘焙双表 / 多分区找 coarse / 直播语义 legacy 双轨 / 单字种子误命中 / 细目空数组语义 / 领域自动回退报错）、低×8 全部即修（提交 8464f99，共 16 项）

## 备注

- 本日归档完成后即最新归档，下个归档日需先整理本日清单
- 审查观察项 12 笔（不立债）登记于 tech-debt.md 观察区：单字种子守卫已修复（其延伸项）、seed_words 每次调用分配、preheat 静默 vs remember 报错（设计选择）、前端静态选项双写（既有模式）、a21af26 混合修复提交（原子性观察）、docs-check 预存 15 处断链（治理轮）
