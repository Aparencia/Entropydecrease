# CI/CD 与发布规范（流水线 + 发布回滚）

> **来源**：本文档由重组合并生成 —— `20-cicd-pipeline.md` + `21-release-and-rollback.md`（CI/CD 与发布属同一交付流程）+ examples 精选示例。冲突处以更具体/更新版本为准，双方独有内容均保留。

---

# 第一部分：CI/CD 流水线


### 目的

建立自动化的持续集成/持续部署流水线，确保每次代码变更都经过自动验证，每次发布都经过标准化流程，减少人为失误和重复劳动。

### 适用时机

- 项目初始化时搭建 CI/CD
- 新增自动化检查环节
- 部署流程需要标准化
- 流水线失败需要排查
- 优化构建速度

### 流程步骤

#### 第一部分：流水线阶段设计

**标准流水线阶段：**

```
代码提交 → Lint → 类型检查 → 单元测试 → 构建 → 集成测试 → 部署 → 健康检查
```

| 阶段 | 内容 | 失败处理 | 耗时目标 |
|------|------|---------|---------|
| Lint | ESLint/Biome 代码检查 | 阻断 | < 30s |
| Type Check | tsc --noEmit | 阻断 | < 30s |
| Unit Test | 单元测试 + 覆盖率 | 阻断 | < 2min |
| Build | 编译/打包 | 阻断 | < 3min |
| Integration Test | API/数据库测试 | 阻断 | < 5min |
| Security Scan | 依赖漏洞扫描 | 警告/阻断 | < 1min |
| Deploy (staging) | 部署到预发布 | 阻断 | < 3min |
| E2E Test | 关键路径测试 | 阻断 | < 5min |
| Deploy (prod) | 部署到生产 | 手动确认 | < 3min |
| Health Check | 验证服务正常 | 自动回滚 | < 1min |

#### 第二部分：触发策略

| 事件 | 触发的阶段 | 说明 |
|------|-----------|------|
| Push to dev | Lint → Test → Build | 快速反馈 |
| Pull Request | 全部检查（不部署） | 合并门禁 |
| Push to main | 全部 + 部署 staging | 预发布验证 |
| Tag (v*) | 全部 + 部署 production | 正式发布 |
| 手动触发 | 可选阶段 | 特殊场景 |
| 定时（每日） | 依赖扫描 + E2E | 定期巡检 |

#### 第三部分：GitHub Actions 配置示例

```yaml
## .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - run: pnpm build

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm audit --audit-level=high
```

#### 第四部分：缓存优化

**加速构建的缓存策略：**
- 依赖缓存：`node_modules` / pnpm store
- 构建缓存：`.next/cache` / `dist/`
- 测试缓存：Jest/Vitest 缓存
- Docker 层缓存：多阶段构建

**缓存失效条件：**
- lock 文件变更 → 重新安装依赖
- 源代码变更 → 重新构建
- 配置变更 → 清除相关缓存

#### 第五部分：失败处理与通知

**失败处理策略：**
- Lint/Test 失败：阻断合并，通知提交者
- Build 失败：阻断部署，通知团队
- Deploy 失败：自动回滚到上一版本
- E2E 失败：阻断生产部署，允许人工判断

**通知规则：**
- PR 检查失败 → 通知 PR 作者
- main 分支构建失败 → 通知团队
- 生产部署失败 → 立即通知 + 自动回滚
- 依赖发现高危漏洞 → 创建 Issue

#### 第六部分：制品管理

**构建制品：**
- Docker 镜像：推送到 Container Registry（GHCR）
- 标签策略：`latest`（最新）+ `v1.2.3`（版本）+ `sha-abc123`（提交）
- 保留策略：最近 30 个版本 + 所有 release 标签

**制品不可变原则：**
- 同一版本号的制品不可覆盖
- 生产部署使用确定版本（非 latest）
- 回滚 = 部署上一个确定版本

#### 第七部分：环境管理

```yaml
## 部署环境配置
environments:
  staging:
    url: https://staging.example.com
    auto_deploy: true  # main 分支自动部署
    
  production:
    url: https://example.com
    auto_deploy: false  # 需要手动确认或 tag 触发
    reviewers: [admin]  # 需要审批
```

### 检查清单

- [ ] CI 流水线已配置（lint + test + build）
- [ ] PR 合并有自动化门禁
- [ ] 部署流程自动化（至少 staging）
- [ ] 生产部署有确认机制
- [ ] 构建使用了缓存（速度可接受）
- [ ] 失败有通知机制
- [ ] 部署失败有回滚方案
- [ ] 密钥通过 Secrets 注入（非明文）
- [ ] 制品有版本标签
- [ ] 流水线总耗时 < 10 分钟

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| CI 配置 | YAML | .github/workflows/ci.yml |
| CD 配置 | YAML | .github/workflows/deploy.yml |
| Dockerfile | Docker | docker/Dockerfile |
| 流水线文档 | Markdown | docs/ci-cd.md |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| CI 太慢（>15min） | 使用缓存、并行、只跑受影响的测试 |
| 生产部署用 latest 标签 | 使用确定版本号 |
| 密钥写在配置文件中 | 使用 GitHub Secrets |
| 部署失败无回滚 | 自动回滚或一键回滚 |
| 所有分支都跑完整流水线 | 按分支/事件分级触发 |
| 流水线失败忽略继续 | 失败必须阻断，不允许带病合并 |

### 相关文档

- [Git 工作流](git-workflow.md) — 触发条件
- [测试策略](testing.md) — CI 中的测试
- [发布与回滚](cicd-release.md) — 部署后续流程
- [环境与配置管理](env-and-config.md) — 环境注入


---

# 第二部分：发布与回滚


### 目的

规范版本发布的完整流程，确保每次发布可控、可追溯、可回滚，降低发布风险，保障线上服务稳定。

### 适用时机

- 准备发布新版本到生产环境
- 发布后发现问题需要回滚
- 紧急热修复（Hotfix）
- 制定发布计划和检查清单

### 流程步骤

#### 第一部分：版本号规范 (SemVer)

**格式：`MAJOR.MINOR.PATCH`**

| 部分 | 何时递增 | 示例 |
|------|---------|------|
| MAJOR | 不兼容的 API 变更 | 1.0.0 → 2.0.0 |
| MINOR | 向后兼容的新功能 | 1.0.0 → 1.1.0 |
| PATCH | 向后兼容的 Bug 修复 | 1.0.0 → 1.0.1 |

**预发布标签：**
- `v1.2.0-alpha.1` — 内部测试
- `v1.2.0-beta.1` — 公开测试
- `v1.2.0-rc.1` — 发布候选

#### 第二部分：发布前检查清单

**代码就绪：**
- [ ] 所有计划功能已合并到 main
- [ ] CI 全部通过（lint/test/build）
- [ ] 代码审查已完成
- [ ] 无已知的阻断性 Bug

**质量就绪：**
- [ ] 测试覆盖率达标
- [ ] E2E 关键路径通过
- [ ] 安全审查通过
- [ ] 性能无退化

**运维就绪：**
- [ ] 数据库迁移已准备（且可回滚）
- [ ] 环境变量/配置已更新
- [ ] 依赖服务已确认兼容
- [ ] 回滚方案已确认
- [ ] 监控/告警正常

**文档就绪：**
- [ ] CHANGELOG 已更新
- [ ] API 文档已更新（如有变更）
- [ ] 部署文档已更新（如流程变化）

#### 第三部分：标准发布流程

```
1. 确认发布范围（包含哪些变更）
2. 更新 CHANGELOG
3. 更新版本号（package.json / 版本文件）
4. 创建 Release PR → 审查 → 合并到 main
5. 打 Tag：git tag -a v1.2.0 -m "Release v1.2.0"
6. 推送 Tag → 触发 CI/CD 部署
7. 验证生产环境（健康检查 + 冒烟测试）
8. 确认发布成功
9. 通知相关方
```

#### 第四部分：热修复流程 (Hotfix)

当生产环境出现紧急 Bug：

```
1. 从 main 创建 hotfix 分支：hotfix/fix-xxx
2. 修复 Bug（最小改动）
3. 补充回归测试
4. 快速审查（可简化，但不能跳过）
5. 合并到 main + 打 patch tag（v1.0.1）
6. 部署
7. 验证
8. 将修复同步回 dev 分支
```

**Hotfix 原则：**
- 只修复紧急问题，不夹带其他改动
- 改动尽可能小
- 修复后必须补测试
- 事后复盘（为什么会到生产才被发现？）

#### 第五部分：回滚流程

**回滚触发条件：**
- 发布后错误率显著上升（> 5%）
- 核心功能不可用
- 数据异常/损坏
- 性能严重退化（P95 > 正常值 3 倍）

**回滚步骤：**
```
1. 确认需要回滚（判断影响面）
2. 决策：回滚代码 or 回滚数据 or 两者
3. 执行回滚：
   - 代码回滚：部署上一个稳定版本的镜像
   - 数据回滚：执行 down 迁移（如适用）
4. 验证回滚成功
5. 通知相关方
6. 排查问题根因
7. 修复后重新走发布流程
```

**回滚注意事项：**
- 数据库迁移如果有破坏性变更（删列/删表），回滚前评估数据影响
- 回滚后确认缓存是否需要清理
- 如果新旧版本 API 不兼容，考虑是否需要前端同步回滚

#### 第六部分：CHANGELOG 编写

**每次发布必须更新 CHANGELOG：**

```markdown
### [1.2.0] - 2024-03-15

#### Added（新增）
- 用户头像上传功能 (#45)
- 订单导出 CSV (#52)

#### Changed（变更）
- 优化列表页加载速度 (#48)

#### Fixed（修复）
- 修复并发下订单号重复 (#51)

#### Security（安全）
- 升级 jsonwebtoken 修复 CVE-2024-xxxx

#### Breaking Changes（破坏性变更）
- 移除废弃的 /api/v1/legacy 端点
```

### 检查清单

- [ ] 版本号遵循 SemVer
- [ ] 发布前检查清单全部通过
- [ ] CHANGELOG 已更新
- [ ] Tag 已打并推送
- [ ] 部署成功且健康检查通过
- [ ] 冒烟测试通过（核心功能可用）
- [ ] 监控指标正常（无异常波动）
- [ ] 回滚方案已确认可执行
- [ ] 相关方已通知
- [ ] 发布记录已归档

### 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| CHANGELOG | Markdown | 项目根目录 CHANGELOG.md |
| Git Tag | Tag | Git 仓库 |
| Release Notes | Markdown | GitHub Releases |
| 发布记录 | 日志 | docs/releases/ |

### 常见误区

| 误区 | 正确做法 |
|------|---------|
| 不打 tag 直接部署 | 每次发布必须有对应 tag |
| 发布后不验证 | 必须健康检查 + 冒烟测试 |
| 回滚没有预案 | 发布前就确认回滚方案 |
| Hotfix 夹带私货 | Hotfix 只修紧急问题 |
| CHANGELOG 不写 | 每次发布必须更新 |
| 周五下午发布 | 避免在非工作时间/无人值守时发布 |

### 相关文档

- [CI/CD 流水线](cicd-release.md) — 自动化部署
- [Git 工作流](git-workflow.md) — Tag 管理
- [备份与灾难恢复](server-ops.md) — 数据回滚
- [事故复盘](incident-postmortem.md) — 发布事故复盘
- [发布检查清单模板](../templates/release-checklist.md)


---

# 附录：示例配置（源自 examples/，重组并入）

## A. GitHub Actions CI 骨架（examples/github-actions-ci.yml）

```yaml
# GitHub Actions CI/CD 流水线示例
# 复制到 .github/workflows/ci.yml，按项目实际命令调整
# 配套文档：phase-5-delivery/20-cicd-pipeline.md

name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

# 同一分支新提交自动取消旧的运行，省资源
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ---------- 代码质量 + 测试 ----------
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'          # 缓存依赖，加速

      - name: Install dependencies
        run: npm ci             # 用 ci 而非 install，保证 lock 一致

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

      - name: Unit tests
        run: npm test -- --coverage

      - name: Security audit
        run: npm audit --audit-level=high
        continue-on-error: true   # 审计告警不阻断，但会提示

  # ---------- 构建 + 部署（仅 main 分支）----------
  deploy:
    needs: test                 # 测试通过才部署
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image
        run: docker build -t myapp:${{ github.sha }} .

      # 部署方式二选一：
      # 方式 A：SSH 到自托管服务器拉取并重启
      - name: Deploy to server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /app
            git pull
            docker compose pull
            docker compose up -d --build
            docker image prune -f    # 清理旧镜像

      # 方式 B（如推送到镜像仓库）：
      # - docker login / docker push ...

      - name: Notify on failure
        if: failure()
        run: echo "部署失败，检查日志"    # 可接入邮件/webhook 通知
```

## B. 多阶段 Dockerfile 示例（examples/Dockerfile.example）

```dockerfile
# 多阶段构建 Dockerfile 示例（Node 全栈应用）
# 配套文档：phase-5-delivery/22b-server-hardening.md
# 关键点：多阶段减小镜像体积 + 非 root 用户运行

# ---------- 构建阶段 ----------
FROM node:20-alpine AS builder
WORKDIR /app

# 先只复制依赖清单，利用缓存层（依赖没变则不重装）
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 只装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 从构建阶段拷贝产物
COPY --from=builder /app/dist ./dist

# 创建非 root 用户并切换（安全加固：容器不以 root 运行）
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

# 健康检查（可选，供编排层探活）
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main.js"]
```
