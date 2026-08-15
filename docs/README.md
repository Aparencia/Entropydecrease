# 熵减 (Entropydecrease) 项目文档

> 文档总导航。目录结构：开发规范 / 产品设计 / 前瞻构想 / 架构决策 / 版本规划 / 模板 / 知识库 / 归档，共 8 个区块（另有 `superpowers/` 为 AI 工作流产物，`archive/` 为已实施文档快照）。

## 📐 standards/ — 开发规范

| 文档 | 主题 |
|------|------|
| [git-workflow.md](./standards/git-workflow.md) | Git 分支策略（main/dev）、提交规范、Merge 策略、提交模板 |
| [ai-coding.md](./standards/ai-coding.md) | AI 协作方式 + 代码生成七维度硬性标准（§1-§7） |
| [code-review.md](./standards/code-review.md) | 代码审查流程与清单 |
| [debug-sop.md](./standards/debug-sop.md) | Debug 标准操作流程 |
| [refactoring.md](./standards/refactoring.md) | 重构规范（含熵减项目 §1/§6 衔接） |
| [testing.md](./standards/testing.md) | 测试策略 |
| [security.md](./standards/security.md) | 安全规范（事前预防 + 事中应急） |
| [performance.md](./standards/performance.md) | 性能优化 |
| [cicd-release.md](./standards/cicd-release.md) | CI/CD 流水线 + 发布回滚（含示例配置） |
| [server-ops.md](./standards/server-ops.md) | 服务器加固部署 + 备份灾备（含初始化脚本） |
| [env-and-config.md](./standards/env-and-config.md) | 环境与配置管理 |
| [api-design.md](./standards/api-design.md) | API 设计 + 数据库设计与迁移 |
| [adr.md](./standards/adr.md) | 架构决策记录（ADR）流程 |
| [documentation.md](./standards/documentation.md) | 文档编写规范 |
| [logging-observability.md](./standards/logging-observability.md) | 日志与可观测性 |
| [maintenance-iteration.md](./standards/maintenance-iteration.md) | 维护与迭代 |
| [tech-debt.md](./standards/tech-debt.md) | 技术债务管理 |
| [incident-postmortem.md](./standards/incident-postmortem.md) | 事故复盘 |
| [knowledge-management.md](./standards/knowledge-management.md) | 知识管理 |
| [dependency-management.md](./standards/dependency-management.md) | 依赖管理 |
| [third-party-integration.md](./standards/third-party-integration.md) | 第三方服务集成 |
| [data-governance.md](./standards/data-governance.md) | 数据治理与隐私 |
| [user-feedback-support.md](./standards/user-feedback-support.md) | 用户反馈与支持 |

## 🎨 product/ — 产品设计

| 文档 | 主题 |
|------|------|
| [brand-story.md](./product/brand-story.md) | 品牌故事 |
| [ui-ux-system.md](./product/ui-ux-system.md) | UI/UX 设计系统（权威版，含设计哲学与方法论附录） |
| [icon-design.md](./product/icon-design.md) | 应用图标说明 |
| [theme.md](./product/theme.md) | 软件主题 |
| [pain-points.md](./product/pain-points.md) | 网课学习全链路痛点图谱 |
| [requirements-pool.md](./product/requirements-pool.md) | 需求池（含立项规划精要附录） |
| [migration-spec.md](./product/migration-spec.md) | 项目迁移与重构规范（含各阶段收尾结论与豁免清单） |
| [entropy-visualization-constitution.md](./product/entropy-visualization-constitution.md) | 熵可视化设计宪法（单范式宣言，视觉/体验设计最高规范） |
| [mcp-learning-memory-interface.md](./product/mcp-learning-memory-interface.md) | MCP 学习记忆服务器接口清单草案（P2 战略项） |
| [ai-era-survival-positioning.md](./product/ai-era-survival-positioning.md) | 熵减 · AI 时代生存定位（三层防御纵深） |
| [revenue-plan-no-license.md](./product/revenue-plan-no-license.md) | 收入方案（无工商户版） |
| [beta-tester-intro.md](./product/beta-tester-intro.md) | 内测简介（面向内测用户） |
| [beta-recruitment-playbook.md](./product/beta-recruitment-playbook.md) | 内测招募与运营手册（招募→筛选→增长→运营→过渡全链路） |
| [beta-recruitment-announcement.md](./product/beta-recruitment-announcement.md) | 内测用户招募公告（含一分钟短版 + 完整版） |
| [beta-agreement.md](./product/beta-agreement.md) | 内测协议简版（双方权责、数据处理、风险告知、退出机制） |
| [beta-tier-management.md](./product/beta-tier-management.md) | 内测用户分层管理方案（三层标准、升降级、各层运营动作） |
| [beta-exclusive-system.md](./product/beta-exclusive-system.md) | 内测人员专属系统设计方案（身份权益体系） |
| [client-feature-checklist.md](./product/client-feature-checklist.md) | 客户端功能清单与验收标准（v0.35.2 基线） |
| [payment-system-spec.md](./product/payment-system-spec.md) | 付费系统规格说明（面包多验真 + tier 分级限额） |
| [pomodoro-promotion-plan.md](./product/pomodoro-promotion-plan.md) | 深潜（番茄钟）宣传推广方案 v1.0 |
| [temporary-revenue-implementation.md](./product/temporary-revenue-implementation.md) | 临时收入方案实施设计（已过时，仅历史参考） |
| [design-system.md](./product/design-system.md) | 设计系统速查（浓缩宪法+执行规范+令牌，供设计工具引用） |

## 🔭 Foresight/ — 前瞻构想

> 未排期的战略构想、设计文档与头脑风暴。已立项内容会移入 `product/` 或 `versions/` 跟踪。

### 战略与设计

| 文档 | 主题 |
|------|------|
| [ai-era-competitiveness-strategy.md](./Foresight/ai-era-competitiveness-strategy.md) | AI 时代竞争力战略分析：熵减如何避免被通用 AI 淘汰 |
| [ai-assistant-companion-design.md](./Foresight/ai-assistant-companion-design.md) | AI 深海学伴助手设计文档 |
| [ai-assistant-implementation-plan.md](./Foresight/ai-assistant-implementation-plan.md) | AI 深海学伴助手实现计划 |
| [ai-gateway-optimization-plan.md](./Foresight/ai-gateway-optimization-plan.md) | AI 网关与调用机制优化方案 |
| [innovation-features-catalog.md](./Foresight/innovation-features-catalog.md) | 产品创新功能全景目录 |
| [sop-custom-design.md](./Foresight/sop-custom-design.md) | 用户自定义 SOP 设计考虑 |
| [classroom-assistant-competitive-analysis.md](./Foresight/classroom-assistant-competitive-analysis.md) | 课堂助手竞品分析 |
| [classroom-assistant-optimization-roadmap.md](./Foresight/classroom-assistant-optimization-roadmap.md) | 课堂助手优化路线图 |
| [innovation-roadmap.md](./Foresight/innovation-roadmap.md) | 创新功能实施路线图（排期依据） |
| [2026-08-full-repo-optimization-plan.md](./Foresight/2026-08-full-repo-optimization-plan.md) | 全仓优化计划（全面体检版，2026-08） |

### 头脑风暴

| 文档 | 主题 |
|------|------|
| [course-preset-brainstorm.md](./Foresight/course-preset-brainstorm.md) | 课程预设（Course Preset）头脑风暴 |
| [first-dive-onboarding-brainstorm.md](./Foresight/first-dive-onboarding-brainstorm.md) | 「首潜」新手引导系统头脑风暴与系统设计 |
| [focus-guardian-nurture-brainstorm.md](./Foresight/focus-guardian-nurture-brainstorm.md) | 深潜守护与养成系统头脑风暴 |
| [pomodoro-customization-brainstorm.md](./Foresight/pomodoro-customization-brainstorm.md) | 番茄钟（深潜）自定义功能头脑风暴 |
| [sop-module-brainstorm.md](./Foresight/sop-module-brainstorm.md) | SOP（标准作业程序）功能模块头脑风暴 |
| [wiki-layout-brainstorm.md](./Foresight/wiki-layout-brainstorm.md) | Wiki 布局头脑风暴（已澄清并部分实施） |

## 🗺️ adr/ — 架构决策记录

> 重要技术决策的背景、备选方案与权衡。索引见 [adr/README.md](./adr/README.md)，规范见 [adr.md](./standards/adr.md)。

| 编号 | 标题 | 状态 |
|------|------|------|
| [ADR-001](./adr/ADR-001-audio-capture-process-loopback.md) | 音频采集采用进程环回与端点环回双源互补 | 已接受 |

## 🗓 versions/ — 版本规划

各版本深度文档（发版计划 / 需求追溯 / 总结报告），**扁平存储**：单文件版本与目录合集（`v0.23.0/`、`v0.34.0/`）并存。

| 版本 | 文档 |
|------|------|
| v0.34.0 | [功能审计与修复总结报告](./versions/v0.34.0/00-功能审计与修复总结报告.md) |
| v0.27.0 | [v0.27.0.md](./versions/v0.27.0.md) |
| v0.23.0 | [阶段性工作总结报告](./versions/v0.23.0/00-阶段性工作总结报告.md) |
| v0.10.0 ~ v0.11.0 | [v0.10.0.md](./versions/v0.10.0.md) / [v0.11.0.md](./versions/v0.11.0.md) |
| v0.3.0 ~ v0.9.0 | [v0.3.0.md](./versions/v0.3.0.md) ~ [v0.9.0.md](./versions/v0.9.0.md) |

> 中间缺失版本（v0.12.0 ~ v0.22.0、v0.24.0 ~ v0.26.0、v0.28.0 ~ v0.33.0）未沉淀深度文档，变更记录见根目录 [CHANGELOG.md](../CHANGELOG.md)。

## 📋 templates/ — 文档模板

ADR、头脑风暴、估算、数据库迁移、知识卡片、MVP 画布、复盘、PRD、发布清单、Sprint 回顾、第三方评估、归档共 12 个模板，直接见 [templates/](./templates/) 目录。

## 🗄️ archive/ — 文档归档

已实施完成的文档按日快照归档（`YYYY-MM-DD/`），技术债清单滚动维护（最新归档为唯一权威）。机制见 [archive/README.md](./archive/README.md) 与 [归档模板](./templates/archive-template.md)。

## 📚 knowledge/ — 知识库

踩坑记录 / 技术方案 / 学习笔记，按 [知识管理规范](./standards/knowledge-management.md) 组织。完整索引见 [knowledge/index.md](./knowledge/index.md)。

---

*重组记录：原 10 目录 78+ 文件 → 7 区块；合并去重与去向对照清单见 [migration-spec.md](./product/migration-spec.md) 附录。*
*整理记录（2026-08）：新增 Foresight/adr 导航区块，补全 product 索引缺失项；移除 3 个临时副本文件（beta-agreement_facetouser.md、beta-recruitment-announcement facetouese.md、软件简介重制2.docx）。*
