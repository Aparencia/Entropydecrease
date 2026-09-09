# 归档 2026-09-09

> 归档 SOP：见 [../README.md](../README.md)。归档当日：2026-09-09（批 1~8 同日连续交付收口 + 七维新增代码审查与修复轮 1~4 + spec 归档 + 技术债滚动）。

## 归档清单

| 源 | 目的 | 说明 |
|----|------|------|
| docs/superpowers/specs/2026-09-09-capture-pause-autopause-design.md | [2026-09-09-capture-pause-autopause-design.md](./2026-09-09-capture-pause-autopause-design.md) | 采集暂停批设计（REQ-308~310 + ADR-031）实施完成（v0.20.7），生命周期终结——[ ] 已归档 |
| docs/superpowers/specs/2026-09-09-review-page-design.md | [2026-09-09-review-page-design.md](./2026-09-09-review-page-design.md) | 复习域页设计（REQ-314）实施完成（v0.20.10），生命周期终结——[ ] 已归档 |
|（滚动） | [tech-debt.md](./tech-debt.md) | 当日权威债务清单（26 行：carried 6 + closed 4 + open 16） |

活跃区候选判读（不入夹）：versions/v0.20.md、requirements-pool、line-limit-exemptions、ADR-031 均属「不归档（持续活跃）」类；docs/Foresight 两份文档未跟踪（排除本次归档）。

## 审查修复批摘要（同日轮 1~4，dev 68bf43a1..7b432c1e）

- **轮 1（暂停域）**：4f8a7102 + 68bf43a1——P2-2 上升沿吸收 own_pending / P2-3 丢采样恢复沿补发 / P2-4 fg 暂停期媒体检测。
- **轮 2（AI 任务 + diff）**：f99b90e7 + 02aba9a2——P2-1 proofread 认领并入统一单调分配 / P2-6 diff_markdown_ops async + 2M 字符护栏（Err 降级，前端兼容）。
- **轮 3（会话页 + 空组清理）**：23b0eeb5 / 7dfe3734 / aa7add53 / 4fe09e08——P2-7 用户编排痕迹接管（写侧置位 + 谓词存量双闸）/ P3-3/4 transaction() 与常量单源 / P2-8 toast 清理 / P3-1/2 全选基准与 pending + P2-9 组件测试。
- **轮 4（复习/排序/选区 + 前端遗留）**：35f1d18c / 2ab400ca / b0ee5578 / 177947c1 / 7b432c1e——P2-10 refreshToken / P2-11 ESC 门控 / P2-12 selMenu 失效清理 / P2-13 快照锚点 / P3 多项即修 / 死分支删除 / 措辞注释。
- **验证**：Rust 全量隔离 2337 通过 / 0 失败；前端 vitest 738/738、tsc 0 错误；clippy 触碰文件零新增告警。
- **新增债务**：TD-2026-09-09-D~H（open 5，见 tech-debt.md）；行数豁免实测纠偏与节序/REQ 行序修正已同步活跃区文档。

## 债务摘要

- **滚动核验**：自 2026-09-06 权威清单——carried 7 笔逐条核对无新偿还；closed 3 笔哈希不变；TD-2026-08-31-A → closed（部分兑现，REQ-317 v0.20.13）。
- **当日新增**：TD-2026-09-09-A（补登正式行）~C（批 8 授权退路/范围裁剪）+ 审查修复批 D~H（open 5）——共 8 笔 09-09 行。
- **统计口径（权威，与 archive/README 索引一致）**：carried 6 + closed 4 + open 16 = 26 行。

## 关联

- 版本与需求：[v0.20 版本文档](../../versions/v0.20.md)（v0.20.6~0.20.13 交付记录，含审查纠偏注记）· [需求池 REQ-306~317](../../product/requirements-pool.md)
- 决策：[ADR-031](../../adr/ADR-031-capture-pause-source-state-machine.md)（spec 归档后链接已指本夹）
- 归档索引：[2026-09-09 索引行](../README.md)（archive README）
