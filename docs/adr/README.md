# 架构决策记录（ADR）索引

> 记录重要技术决策的背景、备选方案与权衡。规范见 [ADR 标准](../standards/adr.md)，
> 模板见 [ADR 模板](../templates/adr-template.md)。

| 编号 | 标题 | 状态 | 日期 |
|------|------|------|------|
| ADR-001 | [WASAPI 端点环回音频捕获方案](./ADR-001-wasapi-loopback-capture.md) | 已接受 | 2026-08-18 |
| ADR-002 | [DXGI 屏幕捕获与关键帧变化检测方案](./ADR-002-dxgi-screen-capture.md) | 已接受 | 2026-08-18 |
| ADR-003 | [流式 ASR 引擎与模型分发方案](./ADR-003-streaming-asr-architecture.md) | 已接受 | 2026-08-18 |
| ADR-004 | [会话管理数据模型方案](./ADR-004-session-data-model.md) | 已接受 | 2026-08-18 |
| ADR-005 | [字幕 OCR 与双源转写融合方案](./ADR-005-subtitle-ocr-fusion.md) | 已接受 | 2026-08-18 |
| ADR-006 | [会话段派生视图：原始段与融合轴分离](./ADR-006-session-segments-derived-view.md) | 提议 | 2026-08-18 |
| ADR-007 | [采集会话生命周期与窗口解耦（持续不间断运行）](./ADR-007-live-session-lifecycle.md) | 已接受 | 2026-08-18 |
| ADR-008 | [文件导入与字幕优先转写方案（含采集链路质量优化）](./ADR-008-file-import-subtitle-priority.md) | 已接受 | 2026-08-18 |
| ADR-009 | [OCR 推理 GPU 卸载（CUDA EP + 三层检测 + 回退链）](./ADR-009-ocr-gpu-offload.md) | 已接受 | 2026-08 |
| ADR-010 | [补缝式 AI（Gap-filling AI）：本地失败块定向云端增强](./ADR-010-gap-filling-ai.md) | 已废弃（2026-09-11 退役修订；本地优先/授权/降级条款仍生效） | 2026-08-18 |
| ADR-011 | [网格差异 OCR 触发重做（含 UI 面板抑制）](./ADR-011-grid-diff-ocr-trigger.md) | 提议 | 2026-08-19 |
| ADR-012 | [流式 ASR 质量修复批次（对齐/合并/重打分）](./ADR-012-streaming-asr-quality-fixes.md) | 已接受 | 2026-08-19 |
| ADR-013 | [实时会话引擎预热与播放暂停驱动](./ADR-013-live-session-preload-and-playback-pause.md) | 已接受 | 2026-08-19 |
| ADR-014 | [会话↔笔记关联与批量转化（notes.session_id 列 + SessionListItem 标记）](./ADR-014-session-note-association.md) | 已接受 | 2026-08-19 |
| ADR-015 | [画面要点屏卡体系（screen_id/bbox 落库 + 屏聚合纯函数 + 派生屏视图）](./ADR-015-screen-cards-ocr.md) | 已接受 | 2026-08-20 |
| ADR-016 | [AI 凭据存储方案（Windows DPAPI/keyring）](./ADR-016-ai-credentials-dpapi.md) | 已接受 | 2026-08-21 |
| ADR-017 | [安全加固批（CSP 基线与白名单、opener 移除、compose 强制配置、nginx 安全头、.env.production 去跟踪）](./ADR-017-security-hardening-batch.md) | 已接受 | 2026-08-21 |
| ADR-018 | [间隔重复调度器引入 fsrs crate（FSRS-6）](./ADR-018-fsrs-scheduler-adoption.md) | 已接受 | 2026-08-22 |
| ADR-020 | [会话类型字段（图文会话）](./ADR-020-session-kind-field.md) | 已接受 | 2026-08-22 |
| ADR-021 | [笔记正文源多态——`detect_body_source` 抽象层（图文会话 OCR 进笔记正文）](./ADR-021-note-body-source-polymorphism.md) | 已接受（v0.12.0 M1，已交付） | 2026-08-23 |
| ADR-022 | [WGC 窗口级捕获——三级降级链（WGC→DXGI→GDI）](./ADR-022-wgc-window-capture.md) | 已接受（v0.12.0 M2，已交付） | 2026-08-23 |
| ADR-023 | [视频会话 OCR 下线 + AI 精修图片理解（含隐私授权契约）](./ADR-023-video-ocr-offline-vision-extract.md) | 已接受（v0.12.0 M5，精修侧已交付） | 2026-08-23 |
| ADR-024 | [知识体系层（方案 B）——有界体系通过、自由双链/图谱仍出局](./ADR-024-knowledge-system-layer.md) | 已接受（v0.13 系列） | 2026-08-23 |
| ADR-025 | [浮窗锁定自解锁——全局快捷键方案（tauri-plugin-global-shortcut）](./ADR-025-float-global-shortcut.md) | 已接受（v0.12.6，已交付） | 2026-08-23 |
| ADR-026 | [AI 精修策略化与流式会话化](./ADR-026-ai-refine-strategy-flow.md) | 已接受（2026-09-01，用户批准） | 2026-09-01 |
| ADR-027 | [学习目标层建模——意图层对象（N:M / 判据配方 / 四态状态机 / 库即记忆）](./ADR-027-goal-layer-modeling.md) | 已接受（v0.18.0 M1） | 2026-09-02 |
| ADR-028 | [AI 目标规划师——建议制规划 + 体系深度联动](./ADR-028-ai-goal-planner.md) | 已接受（v0.18.2） | 2026-09-02 |
| ADR-029 | [检索与发现层（RAG 接层）——派生索引 + 双读路径 + 人工裁决闸门](./ADR-029-rag-retrieval-discovery-layer.md) | 已接受（v0.19 系列） | 2026-09-03 |
| ADR-030 | [ASR 质量增强批——自验证路线 + 参数治理 + 全量精修 + 混淆画像闭环](./ADR-030-asr-quality-batch.md) | 已接受（v0.20 系列） | 2026-09-03 |
| ADR-031 | [采集暂停来源状态机与前台自动暂停（修订 ADR-013 决策 2 边沿语义）](./ADR-031-capture-pause-source-state-machine.md) | 已接受（v0.20.7 批 2a/2b） | 2026-09-09 |
| ADR-032 | [前端设计系统与 token 层落地（`--ed-` 前缀单源生成 · 纸墨双档色阶 · 四档墨度的可及性裁决 · z-index 六档 · 自绘线性图标）](./ADR-032-frontend-design-system-tokens.md) | 已接受 | 2026-09-11 |
| ADR-033 | [L1 原语层与视图层契约（9 类原语落点 · 依赖方向 · CSS 类交互态 · `[data-phase]` 动效接缝 · 退场指针门控 · 弹层唯一实现 · 阴影定值与 `--due` 二次修正）](./ADR-033-l1-primitives-and-view-layer-contract.md) | 已接受（批 0-D 落地） | 2026-09-11 |
| ADR-034 | [L2 壳层契约（导航注册表 · 列契约 · 断点单一真源 · 窗口尺寸与 `--nav-h` · 溢出两级 · 六档 z-index）](./ADR-034-l2-shell-navigation-and-column-contract.md) | 已接受（批 4 开工前补写，决策本体是批 3 的 A1–A7） | 2026-09-12 |
| ADR-035 | [L4 动效纲领与引擎（GSAP 唯一入口 · token 真源 · 三档强度 · 双基调 · 位移上限）](./ADR-035-l4-motion-grammar-and-engine.md) | 已接受（批 6 **波 A 进行中**；**T35 收口时 18/18 判据已落**，决策本体是规格 §8 与批 6 的 R0–R12 裁决） | 2026-09-13 |

> **🔻 批 6 收口就地加注（T35，2026-09-13，**上表其余各行原文一字未改**）**：
> - **ADR-035 行的措辞更正（R14.7 #4）**：「波 A 落地」→「**波 A 进行中**」—— 该措辞在**写它时**是过强的（当时 18 条合规性判据里多数仍未建）；本行同时给出**收口口径**（T35 时 **18/18 判据已落**，见 `ADR-035` 的「合规性验证」收口加注），两半**合起来读**即「波 A 期间判据在建、波 D 收口全部落定」。
> - **例外节的**位置体例**（R14.7 #4 第 ② 条，**只加注、不移动**）**：`ADR-035` 的「后端契约例外」节位于**「决策」与「后果」之间**，而同族先例 `ADR-034` 把类似节放在「合规性验证」之后。⇒ **本节位置不做调整**（移动 = 改 T2 已冻结的正文结构），**体例差异在此登记**；读者按标题检索，不按位置推断。
> - **索引覆盖完整**：`docs-check` 的「索引覆盖完整 ✅」在 T34 收口实测为 **280 扫描 / 180 检查、五项全 ✅**；本批**新增 ADR 恰 1 条**（ADR-035，T2 的 `97295d64`）⇒ 本表 +1 行由 T2 落库，T35 只改措辞。
> - **`ADR-019` 缺号**：🔴 **不补、不复用，只登记**（见下方「编号规则」逐字「编号一经分配不再复用」）；批 6 收口时 `docs/adr/` 实盘最高 = **ADR-035**。

## 编号规则

按创建顺序递增，三位数字（ADR-001、ADR-002…），编号一经分配不再复用。
文件名格式：`ADR-XXX-kebab-case-title.md`。

## 状态说明

| 状态 | 含义 |
|------|------|
| 提议 | 尚在讨论，未开始实施 |
| 已接受 | 决策生效，代码/配置按此实施 |
| 已废弃 | 不再适用，但保留供历史追溯 |
| 已取代 | 被更新的 ADR 替代，需注明取代者编号 |

## 使用建议

- 决策 ≥ 30 分钟讨论或有多个备选方案时，就值得写 ADR
- 每个 ADR 独立文件，索引表按编号排序
- 被取代的 ADR 不删除，改为"已取代"并注明新编号（保留决策历史）
