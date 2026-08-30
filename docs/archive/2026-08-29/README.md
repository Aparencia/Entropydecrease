# 2026-08-29 归档

> 归档日期：2026-08-29（v0.14.1 交付 + 新增代码审查即修）
> 归档对象：已实施完成的设计规格（生命终态）
> 当日权威债务清单见 [tech-debt.md](./tech-debt.md)

## 归档清单

| 源路径 | 归档路径 | 状态/原因 |
|--------|----------|-----------|
| [docs/superpowers/specs/2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md](../../superpowers/specs/2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md)（git mv 自） | [./2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md](./2026-08-29-v0.14.1-notes-group-crud-and-canvas-preferences-design.md) | **已实施完成**（交付 20da94e7 + 审查即修 313dd9ff），生命周期终结 [ ] 已归档 |

## 归档说明

- v0.14.1 设计规格（笔记组 CRUD + 画布连线/布局偏好）实施完成并入档——本批用户指令「任务二：文档归档」唯一匹配对象
- 版本文档 [docs/versions/v0.14.1.md](../../versions/v0.14.1.md) 属**不归档类**（versions/ 持续活跃），其中 spec 链接已改指归档路径并标 `[ ] 已归档`
- docs/standards/line-limit-exemptions.md 属 standards/ 不归档类（本次为登记内容更新，不随档移动）
- 未归档说明：无其他已实施完成文档（v0.14 A/B/C/D 规格已于昨日归档；今日无新 spec/ADR 产生）

## 技术债摘要

- **状态**：存量 11 笔 → **偿清 8 笔**（19-F/19-G/28-A/28-B = `5cddb95`；21-C/24-B/24-C/22-A = `f8df1b6`）；**剩余 3 笔 carried**——TD-040（有意不修：ffmpeg 体积权衡）、TD-19-D（有意未接线：image_store，v0.7.3 体系后接线价值衰减）、TD-24-A（**本轮评估：lib.rs 注册清单在 Tauri v2 单点 generate_handler proc-macro 展开下技术上不可拆分**（分组函数实测 E0282）；live_session_frame 单函数拆分方案已登记——继续顺延）
- **clippy**：存量代码级告警清零（TD-22-A 关闭）；仅剩系统级 build-target 元警告（非代码 lint）
- 权威清单：[tech-debt.md](./tech-debt.md)（3 carried + 6 观察项）

## 验证

- 前端 vitest 49 文件 409 用例全绿；`tsc --noEmit` 零错误
- Rust cargo test 1834 通过（3 预存失败与本次无关，clean HEAD 已复现）
- docs-check 链接校验通过（归档后活跃区引用全部改指归档路径）
