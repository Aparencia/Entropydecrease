# 工程规范索引

> 新项目从本目录的规范文档中按需启用。**个人开发化原则**：规范是护栏不是枷锁——只保留你真正会执行的。

## 规范清单

| 规范 | 主题 | 个人项目 | 小团队 |
|------|------|:---:|:---:|
| [git-workflow.md](./git-workflow.md) | Git 分支/提交规范（Conventional Commits） | ✅ 必用 | ✅ 必用 |
| [ai-coding.md](./ai-coding.md) | AI 协作方式 + 代码生成七维度硬性标准 | ✅ 必用 | ✅ 必用 |
| [documentation.md](./documentation.md) | 文档编写规范（含归档机制） | ✅ 必用 | ✅ 必用 |
| [testing.md](./testing.md) | 测试策略与规范 | ✅ 必用 | ✅ 必用 |
| [code-review.md](./code-review.md) | 代码审查流程 | ⬜ 可选 | ✅ |
| [debug-sop.md](./debug-sop.md) | Debug 标准操作流程 | ✅ 必用 | ✅ |
| [refactoring.md](./refactoring.md) | 重构规范 | ✅ | ✅ |
| [security.md](./security.md) | 安全规范 | ✅ 必用 | ✅ 必用 |
| [env-and-config.md](./env-and-config.md) | 环境与配置管理 | ✅ | ✅ |
| [tech-debt.md](./tech-debt.md) | 技术债务管理（配合 archive 滚动） | ✅ | ✅ |
| [knowledge-management.md](./knowledge-management.md) | 知识管理与经验沉淀 | ✅ | ✅ |
| [adr.md](./adr.md) | 架构决策记录（ADR）流程 | ✅ | ✅ |
| [api-design.md](./api-design.md) | API 与数据层设计规范 | ⬜ 有后端时 | ✅ |
| [cicd-release.md](./cicd-release.md) | CI/CD 与发布规范 | ⬜ 有 CI 时 | ✅ |
| [performance.md](./performance.md) | 性能优化工作流 | ⬜ 可选 | ⬜ |
| [logging-observability.md](./logging-observability.md) | 日志与可观测性 | ⬜ 可选 | ✅ |
| [maintenance-iteration.md](./maintenance-iteration.md) | 维护与迭代规范 | ⬜ 可选 | ⬜ |
| [incident-postmortem.md](./incident-postmortem.md) | 事故复盘流程 | ⬜ 可选 | ⬜ |
| [dependency-management.md](./dependency-management.md) | 依赖与供应链管理 | ⬜ 有依赖时 | ✅ |
| [third-party-integration.md](./third-party-integration.md) | 第三方服务集成规范 | ⬜ 可选 | ✅ |
| [data-governance.md](./data-governance.md) | 数据治理与隐私 | ⬜ 有用户数据时 | ✅ |
| [server-ops.md](./server-ops.md) | 服务器运维规范 | ⬜ 有服务器时 | ✅ |
| [user-feedback-support.md](./user-feedback-support.md) | 用户反馈与支持 | ⬜ 可选 | ✅ |

## 最小必用集（个人项目 5 件套）

`git-workflow` + `ai-coding` + `documentation` + `testing` + `debug-sop` —— 其余按需启用。

## 维护规则

- 规范变更必须同步更新本索引表
- 规范与代码冲突时以规范为准；规范过时时先改规范再改代码
- 新规范加入前先问：**这真的会被执行吗？**（不执行的规范是负担）
