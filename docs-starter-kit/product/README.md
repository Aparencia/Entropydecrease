# 产品文档

> 熵减 (Entropydecrease) 重构项目 · 产品文档索引（按新项目视角建立）
> 产品名暂定"熵减"，名称裁决后统一替换。

## 文档清单

| 文档 | 回答的问题 | 状态 |
|------|-----------|------|
| [pain-points.md](./pain-points.md) | 为什么做？学习全链路痛点图谱（47 痛点 + 26 科学机制） | v1.0 草案 |
| [mvp-canvas.md](./mvp-canvas.md) | 做什么？MVP 验证画布：视频知识提取 + 持久化闭环 | 草案 |
| [prd.md](./prd.md) | 怎么细化？产品需求文档（课堂助手为核心，MoSCoW + 场景 + 验收） | 草稿 |
| [requirements-pool.md](./requirements-pool.md) | 怎么跟踪？需求 → 优先级 → 版本 → 实现 → 验收 | 维护中 |
| brand-story.md | 怎么说？品牌故事（名称裁决后建立） | 待建 |

## 产品方向（2026-08 确立）

- **目标用户**：技能自学者（不限于课本知识：化妆/编程/乐理/绘画等），以视频为主要学习载体
- **MVP 核心**：课堂助手（屏幕+音频捕获 → ASR 转写 → AI 结构化笔记）+ 笔记 + 闪卡间隔重复（知识持久化）
- **MVP 成功标准**：视频知识提取与持久化达到市场级（对标通义听悟/讯飞听见）
- **架构原则**：本地优先，数据不出本机，AI 为增强层
- **技术栈（已裁决）**：Tauri 2 + React + TS + Rust；本地 ASR（sherpa-onnx crate）；笔记生成用云端多模态（不用 Ollama）；依据见 [Foresight/market-stack-asr-notes-research.md](../Foresight/market-stack-asr-notes-research.md)

## 文档演进顺序（Lean Product）

1. 痛点图谱立论（pain-points.md）
2. MVP 画布定范围（mvp-canvas.md）
3. PRD 细化功能（prd.md）
4. 需求池跟踪排期（requirements-pool.md）
5. 品牌叙事收尾（brand-story.md）

## 暂不建立（按新项目视角裁剪）

- `positioning.md`：AI 时代生存定位，暂未裁决，后续补
- `theme.md` / `ui-ux-system.md`：UI/UX 阶段再建立
- beta 系列 / 支付 / 收入方案：运营期再建立
- `migration-spec.md`：重构完成后再沉淀

## 与 Foresight/ 的分工

- `product/`：已立项、需持续维护的产品文档（需求池、品牌、定价）
- `Foresight/`：未排期的构想、头脑风暴、竞品分析（立项后移入 product/ 或 versions/ 跟踪）

## 维护规则

- 新文档从 [prd-template.md](../templates/prd-template.md) / [mvp-canvas-template.md](../templates/mvp-canvas-template.md) / [brainstorm-template.md](../templates/brainstorm-template.md) 复制
- 每个产品文档在 docs/README.md 总导航中登记
