# 2026-08-24 归档索引

> 常规归档（按 SOP 6 步）：昨日（2026-08-23）清单已核对滚动；本日执行 v0.13.6 交付后的新增代码审查（三段并行 + 跨切面）与修复即修批，并归档 v0.13.6 设计规格。
> **二轮（v0.13.7 交付）**：v0.13.7 全量 13 任务完成 + 审查 Critical 修复合入后，归档 v0.13.7 设计规格与实施计划。
> **三轮（v0.13.8 画布交付）**：v0.13.8 全量 M1→M3 交付（4 提交：数据层与命令 / 前端 / 文档同步）+ 新增代码七维审查（高×1/中×1/低×1 即修 6464abd），归档 v0.13.8 设计规格。

## 归档内容

- 实施文档：[2026-08-23-v0.13.6-video-profile-classification-refinement-design.md](./2026-08-23-v0.13.6-video-profile-classification-refinement-design.md)（`[ ] 已归档`，标注于 [CHANGELOG](../../CHANGELOG.md) 与 [v0.13 系列文档](../../versions/v0.13.md)）——v0.13.6 已全量实施交付（M1 修复批 + M2 形态展平 + M3 领域两层 + M4 检测链），生命周期终结
- 设计规格：[2026-08-24-v0.13.7-knowledge-system-onboarding-design.md](./2026-08-24-v0.13.7-knowledge-system-onboarding-design.md)（`[ ] 已归档`，标注于 [CHANGELOG](../../CHANGELOG.md) 与 [v0.13 系列文档](../../versions/v0.13.md)）——v0.13.7 全量 13 任务已代码交付（触点①②③ + 示例体系 + 具象化 + 纪律裁决 + 跨页跳转），生命周期终结
- 实施计划：[2026-08-24-v0.13.7-knowledge-system-onboarding.md](./2026-08-24-v0.13.7-knowledge-system-onboarding.md)（`[ ] 已归档`）——全部 13 任务执行完成 + 审查 Critical 修复合入，计划已闭环
- 设计规格：[2026-08-24-v0.13.8-knowledge-canvas-design.md](./2026-08-24-v0.13.8-knowledge-canvas-design.md)（`[ ] 已归档`，标注于 [CHANGELOG](../../CHANGELOG.md) 与 [v0.13 系列文档](../../versions/v0.13.md)）——v0.13.8 全量 M1→M3 已代码交付（数据层 canvas_x/y + 视口表 / 4 命令 / 辐射布局 / 画布视图与双入口），生命周期终结

> 判定依据（archive README）：已执行/已实施的设计 spec → 终态归档；v0.13.1~5 规格仍被激活中的 v0.13.2~5（立项未实施）文档引用或系列未发布——持续活跃，排除本次归档。

## 技术债摘要

- 未偿 9 笔（6 carried + 3 open）：TD-040 / TD-2026-08-19-D/F/G（carried 4 笔）+ TD-2026-08-21-C（carried）+ TD-2026-08-22-A（clippy 存量，三轮复核本批零新增仍 carried）+ **TD-2026-08-24-A（open：lib.rs 712 / live_session_frame.rs 683 超 600 硬限预存债务，拆分计划 v0.13.7 未兑现——顺延下一窗口）** + TD-2026-08-24-B/C（open：v0.13.7 审查登记，三轮未触及）；详见 [tech-debt.md](./tech-debt.md)
- 三轮即修（v0.13.8 审查）：高×1（重挂载拖拽位置被辐射重算覆盖——onPositionsSaved 父页合并 + 回归测试）/ 中×1（框选批量移动未持久化——elementsSelectable=false）/ 低×1（测试死分支清理），提交 6464abd；观察 3 项登记不立债（浮点尾差 / update 无体系校验以规范为准 / 双枚举保留）
- 验证：cargo knowledge 151/151、全量 1721 passed（3 预存基线失败）/ 6 ignored；clippy 新文件零警告；tsc 零错误；vitest 34 文件 189 用例全绿；vite build 通过

## 备注

- 本日归档完成后即最新归档，下个归档日需先整理本日清单
- 审查观察项 12 笔（不立债）登记于 tech-debt.md 观察区：单字种子守卫已修复（其延伸项）、seed_words 每次调用分配、preheat 静默 vs remember 报错（设计选择）、前端静态选项双写（既有模式）、a21af26 混合修复提交（原子性观察）、docs-check 预存 15 处断链（治理轮）+ 三轮 3 项（浮点尾差 / update 无体系校验 / 双枚举）
