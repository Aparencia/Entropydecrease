# Docs Starter Kit — 可直接投入新项目的文档骨架

> 从熵减（Entropydecrease）项目文档体系提炼的**通用化**文档模板树：工程化（索引驱动 / 模板驱动 / ADR / 版本沉淀 / 归档机制 / 自动化检查）与个人开发化（轻量 / 低维护 / 按需裁剪）的平衡产物。
> 本目录**不含任何项目特有内容**（品牌名、具体功能、历史文档），复制即用。

---

## 🚀 快速启用（5 分钟）

```bash
# 1. 复制骨架到你的项目
cp -r docs-starter-kit/* <你的项目>/docs/
cp docs-starter-kit/.docscheckignore <你的项目>/docs/

# 2. 复制文档检查脚本（可选，推荐）
cp docs-starter-kit/scripts/docs-check.mjs <你的项目>/scripts/

# 3. 初始化
#    - 编辑 docs/README.md 顶部：项目名 + 一句话描述
#    - 建立 git 后把 docs/ 提交入库
```

**初始化 Checklist**（复制后逐项完成）：

- [ ] `docs/README.md`：填入项目名、简介、技术栈
- [ ] `docs/standards/README.md`：按团队规模勾选要执行的规范（个人项目可只保留 git-workflow / ai-coding / documentation / testing）
- [ ] `docs/adr/`：删除示例，从第一项真实决策开始
- [ ] `docs/knowledge/`：清空 bugs/ solutions/ learnings/ 示例，保留 index.md 骨架
- [ ] `docs/versions/`：创建当前版本的 v0.1.0.md
- [ ] `docs/archive/`：删除"基线归档"示例索引，从第一个归档日开始
- [ ] `package.json`：加入 `"docs:check": "node scripts/docs-check.mjs"`，可选接入 lint-staged/CI
- [ ] 根 README 加一行指向 `docs/` 的链接

---

## 📐 目录结构

```
docs/
├── README.md                  # 总导航：目录说明 + 维护节奏 + 写作规范速查（本文件）
├── standards/                 # 工程规范（20 个通用文档 + README 索引）
├── templates/                 # 文档模板（12 个 + README 索引 + 选择指南）
├── adr/                       # 架构决策记录（README + 编号规则）
├── knowledge/                 # 知识库（index + bugs/ + solutions/ + learnings/）
├── versions/                  # 版本迭代（README + 沉淀规则）
├── product/                   # 产品文档（按需裁剪：需求池/品牌/定价）
├── Foresight/                 # 前瞻规划（按需裁剪：路线图/头脑风暴）
├── archive/                   # 归档机制（README + 日快照 + tech-debt 滚动）
└── scripts/                   # 文档自动化（docs-check.mjs）
```

## 🧭 按需裁剪指南

| 项目类型 | 保留 | 可裁剪 |
|---------|------|--------|
| 个人工具/库 | standards 全部 + templates 全部 + adr + knowledge + versions | product/ Foresight/ archive/（或仅留 archive 目录占位） |
| 小团队产品 | 全部保留 | product/ 只留 requirements-pool.md |
| 中型产品 | 全部保留 + 按需扩展 product/ | — |

## 🔁 维护节奏（工程化承诺）

- **每次文档变更**：`node scripts/docs-check.mjs` 校验链接/索引/命名（可挂 lint-staged）
- **每次发版**：更新 CHANGELOG + `versions/vX.Y.Z.md`
- **每次技术决策**：新建 `adr/ADR-XXX-*.md`（模板复制）
- **每次踩坑**：新建 `knowledge/bugs/YYYY-MM-DD-*.md`（模板复制）并登记索引
- **日收工（<15 分钟）**：已实施文档移入 `archive/YYYY-MM-DD/`，滚动 tech-debt.md

---

## ⚠️ 使用注意

- 本骨架的 standards/templates 是**通用最佳实践沉淀**，随熵减项目演进同步更新；如你 fork 后大幅修改，建议独立维护
- `.docscheckignore` 声明历史快照豁免——新文档一律不得加入该清单
- 中文为主的项目文档约定：文件命名 kebab-case 或中文短描述，禁止临时后缀（"重制2"、"_tmp"）
