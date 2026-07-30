# 熵减 (Entropydecrease) 项目文档

> 重组版（4 目录结构）：开发规范 / 产品设计 / 版本规划 / 模板。

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

## 🗓 versions/ — 版本规划（扁平化）

v0.3.0 ~ v1.1.0 各版本一个文件；v0.3.0/v0.4.0 为多文档合集（含发版计划/需求追溯/开发文档/测试标准）。

## 📋 templates/ — 文档模板

ADR、头脑风暴、估算、数据库迁移、知识卡片、MVP 画布、复盘、PRD、发布清单、Sprint 回顾、第三方评估共 11 个模板。

## 📚 knowledge/ — 知识库

踩坑记录 / 技术方案 / 学习笔记，按 [知识管理规范](./standards/knowledge-management.md) 组织。索引见 [knowledge/index.md](./knowledge/index.md)。

---

*重组记录：原 10 目录 78+ 文件 → 4 目录；合并去重与去向对照清单见 [migration-spec.md](./product/migration-spec.md) 附录。*
