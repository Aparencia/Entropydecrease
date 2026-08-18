# Git 工作流与提交规范

## 目的

建立统一的版本控制操作规范，确保代码历史清晰可读、可追溯、可回滚，支持高效的开发节奏和安全的发布流程。

## 适用时机

- 项目初始化时配置 Git 规范
- 每次提交代码前
- 创建/合并分支时
- 发布新版本打 tag 时
- 需要回滚或查看历史时

## 流程步骤

### 第一部分：分支策略

**个人开发（精简模型）：**

```
main ─────────────────────────────────── 生产代码（始终可部署）
  │
  ├── dev ────────────────────────────── 开发主线（日常开发）
  │     │
  │     ├── feature/user-auth ────────── 大功能分支（可选）
  │     └── feature/payment ──────────── 大功能分支（可选）
  │
  └── hotfix/fix-login-bug ───────────── 紧急修复（从 main 拉出）
```

**规则：**
- `main`: 只接受来自 dev 的合并和 hotfix，始终保持可部署
- `dev`: 日常开发在此进行，小改动直接提交
- `feature/*`: 超过 2 天的大功能单独开分支
- `hotfix/*`: 生产紧急修复，修完合回 main 和 dev
- 分支命名：`feature/简短描述`、`fix/问题描述`、`hotfix/紧急问题`

### 第二部分：提交规范 (Conventional Commits)

**格式：**
```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Type 类型：**

| Type | 含义 | 示例 |
|------|------|------|
| feat | 新功能 | `feat(auth): 添加邮箱注册功能` |
| fix | 修复 Bug | `fix(cart): 修复数量为0时仍可提交的问题` |
| docs | 文档变更 | `docs: 更新 API 接口文档` |
| style | 格式调整（不影响逻辑） | `style: 格式化代码缩进` |
| refactor | 重构（非新功能/非修复） | `refactor(db): 抽取连接池为独立模块` |
| perf | 性能优化 | `perf(query): 添加复合索引优化列表查询` |
| test | 测试相关 | `test(auth): 补充登录边界测试` |
| chore | 构建/工具/依赖 | `chore: 升级 TypeScript 到 5.4` |
| ci | CI/CD 配置 | `ci: 添加 Docker 构建缓存` |
| revert | 回滚 | `revert: 回滚 feat(auth) 提交` |

**Subject 规则：**
- 使用中文或英文（项目内统一）
- 不超过 50 个字符
- 不以句号结尾
- 使用动词开头（添加/修复/更新/删除/重构）

**Body（可选，复杂变更时写）：**
- 说明为什么做这个改动
- 说明改动的上下文
- 每行不超过 72 字符

**Footer（可选）：**
- `BREAKING CHANGE: 描述破坏性变更`
- `Closes #123`（关联 Issue）

### 第三部分：提交频率与粒度

**原则：**
- 每个提交只做一件事（原子性）
- 提交应该能通过编译和测试
- 不要提交半成品代码到共享分支
- 频繁提交（每 30-60 分钟或完成一个逻辑单元）

**不好的提交：**
```
❌ "update code"
❌ "fix bug"
❌ "wip" (work in progress 到共享分支)
❌ 一个提交改了 10 个不相关的文件
```

**好的提交：**
```
✅ feat(user): 添加用户头像上传功能
✅ fix(order): 修复并发下订单号重复问题
✅ refactor(api): 统一错误响应格式
```

### 第四部分：Tag 与版本管理

**Tag 命名：**
- 格式：`v{MAJOR}.{MINOR}.{PATCH}`（SemVer）
- 示例：`v1.0.0`, `v1.2.3`, `v2.0.0-beta.1`

**何时打 Tag：**
- 每次正式发布
- 预发布版本（alpha/beta/rc）

**打 Tag 流程：**
```bash
git tag -a v1.2.0 -m "Release v1.2.0: 添加支付功能"
git push origin v1.2.0
```

### 第五部分：Merge 策略

| 场景 | 策略 | 说明 |
|------|------|------|
| feature → dev | Squash Merge | 多个提交压缩为一个清晰提交 |
| dev → main | Merge Commit | 保留完整合并记录 |
| hotfix → main | Merge Commit | 保留修复记录 |

**Squash Merge 的提交信息：**
- 使用 Conventional Commit 格式
- 概括整个功能/修复的内容

### 第六部分：.gitignore 标准

必须忽略的内容：
```gitignore
# 依赖
node_modules/
vendor/

# 环境变量（含密钥）
.env
.env.local
.env.production

# 构建产物
dist/
build/
.next/

# IDE
.idea/
.vscode/
*.swp

# 系统文件
.DS_Store
Thumbs.db

# 日志
*.log
logs/

# 测试覆盖
coverage/
```

### 第七部分：Git Hooks 配置

使用 husky + lint-staged：

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{css,scss}": ["prettier --write"],
    "*.{md,json}": ["prettier --write"]
  }
}
```

- `pre-commit`: lint-staged（格式化 + lint）
- `commit-msg`: commitlint（验证提交格式）

## 检查清单

- [ ] 分支策略已确定并记录
- [ ] 提交信息符合 Conventional Commits
- [ ] 每个提交是原子的（一件事）
- [ ] .gitignore 已配置（无敏感文件泄露）
- [ ] Git Hooks 已配置（lint-staged + commitlint）
- [ ] 版本号遵循 SemVer
- [ ] Tag 有注释信息
- [ ] 无密钥/密码提交到仓库
- [ ] 大文件使用 Git LFS 或排除

## 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| Git 规范文档 | Markdown | docs/git-workflow.md |
| .gitignore | 配置文件 | 项目根目录 |
| commitlint 配置 | JS/YAML | commitlint.config.js |
| husky hooks | 脚本 | .husky/ |

## 常见误区

| 误区 | 正确做法 |
|------|---------|
| 提交信息写 "update" / "fix" | 使用 Conventional Commits 格式 |
| 把 .env 提交到仓库 | .env 永远在 .gitignore 中 |
| 一个提交改几十个文件 | 拆分为多个原子提交 |
| 在 main 上直接开发 | main 只接受合并，开发在 dev |
| 不写 body 就合并大 PR | 复杂变更需要说明上下文 |
| force push 到共享分支 | 永远不要 force push main/dev |

## 相关文档

- [代码审查规范](code-review.md) — 合并前的审查
- [CI/CD 流水线](cicd-release.md) — 提交触发自动化
- [发布与回滚](cicd-release.md) — Tag 触发发布
- [环境与配置管理](env-and-config.md) — .env 管理

---

## 附录：提交信息模板（examples/gitmessage.example，重组并入）

启用方式：将以下内容存为 `.gitmessage` 并执行 `git config commit.template .gitmessage`

```text
# Conventional Commits 提交模板
# 配套文档：phase-3-development/09-git-workflow.md
# 启用：git config commit.template .gitmessage
#
# 格式：<type>(<scope>): <subject>
#   ↓ 在下面这行写标题（不超过 50 字，用祈使句，末尾不加句号）


# 空一行后写正文：解释「为什么」而非「怎么做」（可选，每行不超过 72 字）


# 脚注：关联 issue / 破坏性变更（可选）
# 例：Closes #123
# 例：BREAKING CHANGE: 配置项 xxx 已移除

# ---------- type 可选值 ----------
# feat:     新功能
# fix:      修复 bug
# docs:     文档变更
# style:    格式（不影响逻辑，如空格、分号）
# refactor: 重构（非新增功能也非修 bug）
# perf:     性能优化
# test:     测试相关
# build:    构建系统或依赖变更
# ci:       CI 配置变更
# chore:    杂项（不改源码或测试）
# revert:   回滚提交
```
