# 2026-08-30 归档

> 归档日期：2026-08-30（v0.15 交付 + 新增代码七维审查即修）
> 归档对象：已实施完成的设计规格（生命终态）
> 当日权威债务清单见 [tech-debt.md](./tech-debt.md)

## 归档清单

| 源路径 | 归档路径 | 状态/原因 |
|--------|----------|-----------|
| [docs/superpowers/specs/2026-08-30-v0.15-notes-polish-design.md](../../superpowers/specs/2026-08-30-v0.15-notes-polish-design.md)（git mv 自） | [./2026-08-30-v0.15-notes-polish-design.md](./2026-08-30-v0.15-notes-polish-design.md) | **已实施完成**（交付 51896a7f~71640416 + 审查即修 aece95f），生命周期终结 [ ] 已归档 |

## 归档说明

- v0.15 设计规格（标题切换/全站自适应/分组树折叠/图片落盘三入口/剪贴板导入/换行一致六项）实施完成并入档
- 版本记录 [docs/versions/v0.15.md](../../versions/v0.15.md) 属**不归档类**（versions/ 持续活跃），其中 spec 链接已改指归档路径并标 `[ ] 已归档`
- 实现偏差 1 处（以归档快照为准并提示）：spec §4.4.1「save_image_bytes」实施时收敛命名为 `write_image_bytes`（+ 字节入口 `import_image_bytes` 嗅探定格式）——交付记录 [v0.15.md](../../versions/v0.15.md) 以实际命名记述
- docs/standards/line-limit-exemptions.md 属 standards/ 不归档类（本次为登记内容更新，不随档移动）
- 未归档说明：无其他已实施完成文档（CHANGELOG/归档 README/versions 属不归档类；无新 ADR 产生）

## 技术债摘要

- **状态**：昨日 3 笔 carried（TD-040 / TD-19-D / TD-24-A）核实均未偿还 → 继承；**新增 open 2 笔**——TD-2026-08-30-A（ClassroomPage 607 行超 600 硬限：预存债务 v0.15 实测纠偏，拆分计划 LiveCaptureCard 已登记豁免）+ TD-2026-08-30-B（note_filter 预存失败 2 笔：v0.12.x 行为漂移后夹具断言未同步，v0.16.0 全量回归复现）
- **观察项**：继承 5 项未决（28-1/2/3、29-1/3；29-2 已修复）+ 新增 2 项（30-1 绝对路径引用不改写保持边界 / 30-2 历史孤儿图垃圾回收后续）+ **追加 6 项**（v0.16.0 审查：30-3 聊天停止响应延迟上限 / 30-4 SSE usage 丢失边界 / 30-5 流式渲染全量解析 / 30-6 轨迹存储体积 / 30-7 模型列表校验 / 30-8 Done.content 保留理由）
- 权威清单：[tech-debt.md](./tech-debt.md)（3 carried + 2 open + 13 观察项）

## 后续批次说明（v0.16.0，本索引创建后追加）

- v0.16.0「内嵌 AI 对话」（纯聊天 + 精修轨迹对话视图）同日交付（6778114f + 审查修复 f3df9777）；[版本文档](../../versions/v0.16.0.md)属 versions/ 不归档类（同 v0.15.md 先例），设计即版本文档无独立 spec 可归档；未归档说明：本批无可归档文档

## 验证

- 前端 vitest 53 文件 431 用例全绿；`tsc --noEmit` 零错误；`vite build` 通过
- Rust cargo test 1840 通过（3 预存失败与本次无关，clean HEAD 已复现）；clippy 零新增警告
- docs-check 链接校验通过（归档后活跃区引用全部改指归档路径）
