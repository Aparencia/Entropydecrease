# 2026-08-18 归档索引

> 首次基线归档：重构区建立首个提交（45faa07），文档体系（docs-starter-kit/）自此受 git 跟踪。

## 归档内容

- 本轮无文档移入归档：docs-starter-kit/ 下全部为持续活跃文档（standards/、templates/、product/、versions/、knowledge/index.md，按 archive/README.md 判定标准不归档）
- 本轮代码成果（课堂助手/笔记双页面、窗口/进程选择、本地 ASR/OCR 提取链路、ONNX 运行时修复）已随基线提交 45faa07 固化，无对应已实施完成的方案文档产出

## 技术债摘要

- 未偿 7 笔：TD-001 单图 OCR 错误静默（P1）、TD-005 command 入参未校验（P1）、TD-002 AGENTS.md 未同步（P2）、TD-003 搜索竞态（P2）、TD-004 重复窗口枚举（P2）、TD-006 build.rs 魔法索引（P3）、TD-007 窗口噪声（P3）；详见 tech-debt.md

## 备注

- 下个归档日需先整理本日清单（继承 carried 债务）
- 后续归档流程：git log --since= 筛选已实施文档 → 判定 → git mv 入本夹
