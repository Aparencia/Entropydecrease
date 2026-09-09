# 归档 2026-09-09

> 归档 SOP：见 [../README.md](../README.md)。归档当日：2026-09-09（批 1~8 同日连续交付收口 + 技术债滚动）。
> 当日无文档移入归档夹（versions/Foresight/需求池/豁免清单按机制常驻仍活跃）；本夹=技术债滚动权威快照。

## 归档清单

本日无符合归档判定（生命终态）的文档入夹——versions/v0.20.md（v0.20.6~13 交付记录）、requirements-pool、line-limit-exemptions、Foresight 均属「不归档（持续活跃）」类。

## 债务摘要

- **技术债滚动**：[tech-debt.md](./tech-debt.md) 为最新权威清单——自 2026-09-06 继承 carried 7 笔 + closed 3 笔（哈希不变）；TD-2026-09-09-A 正式补登（批 7 引用先行、当日夹缺失）；新增 open 2 笔（TD-2026-09-09-B/C——批 8 授权退路/范围裁剪）；TD-2026-08-31-A → closed（部分兑现，REQ-317 v0.20.13）
- **验证**：前端全量 vitest 绿 + tsc 0 错误（批 8 新增 37 例）；Rust 零改动无需回归
