# 环境与配置管理

## 目的

规范不同环境（开发/测试/生产）的配置管理方式，确保环境一致性、密钥安全、配置可追溯，避免"在我电脑上能跑"的问题。

## 适用时机

- 项目初始化时设计配置方案
- 新增环境变量或配置项
- 部署到新环境
- 排查环境相关问题
- 密钥/凭证需要轮换

## 流程步骤

### 第一部分：环境分离

**标准环境划分：**

| 环境 | 用途 | 数据来源 | 部署方式 |
|------|------|---------|---------|
| local | 本地开发 | 种子数据/模拟 | docker-compose / 本地进程 |
| staging | 预发布验证 | 脱敏生产数据 | 与生产相同配置 |
| production | 正式运行 | 真实数据 | 正式部署流程 |

**环境一致性原则：**
- 各环境使用相同的技术栈版本
- 配置结构相同，只是值不同
- staging 尽可能模拟 production
- 用 Docker 保证运行环境一致

### 第二部分：环境变量管理

**.env 文件规范：**

```bash
# .env.example（提交到 Git，模板文件）
# 应用配置
APP_NAME=my-app
APP_PORT=3000
NODE_ENV=development

# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb

# 认证
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d

# 第三方服务
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

**规则：**
- `.env.example` 提交到 Git（只有键和说明，无真实值）
- `.env` / `.env.local` / `.env.production` 绝不提交（在 .gitignore 中）
- **唯一例外**：`client/.env.production`（内容全部为公开值——Supabase publishable anon key + 公网 URL，本就随安装包分发；CI 打包依赖它注入渲染进程 VITE_ 变量）。该文件必须满足"零敏感值"审计：只允许 publishable/anon 级凭据与公网地址，任何 service_role/私钥/密码一律禁止放入
- 每个变量有注释说明用途
- 敏感值留空或写占位符

**命名规范：**
```
格式：{SERVICE}_{PROPERTY}
示例：
  DATABASE_URL
  REDIS_HOST
  JWT_SECRET
  SMTP_PORT
  AWS_S3_BUCKET
```

### 第三部分：配置加载策略

**优先级（从高到低）：**
1. 命令行参数
2. 系统环境变量
3. `.env.{NODE_ENV}` 文件（如 `.env.production`）
4. `.env` 文件（通用默认）
5. 代码中的默认值

**配置验证：**
- 应用启动时验证必需变量是否存在
- 缺少必需变量时立即报错退出（不要运行到一半才崩）
- 验证格式（URL 格式、端口范围等）

```typescript
// 配置验证示例
const required = ['DATABASE_URL', 'JWT_SECRET'];
const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}`);
}
```

### 第四部分：密钥管理

**绝对禁止：**
- 密钥硬编码在代码中
- 密钥提交到 Git 仓库
- 密钥通过明文聊天/邮件传递
- 生产密钥用于开发环境

**推荐做法：**
- 开发环境：`.env.local`（gitignore）
- 生产环境：系统环境变量 / 密钥管理服务
- Docker：`--env-file` 或 Docker Secrets
- CI/CD：GitHub Secrets / GitLab CI Variables

**密钥轮换：**
- 定期轮换（建议 90 天）
- 泄露时立即轮换
- 轮换不需要停机（支持多 key 并存过渡）

### 第五部分：配置即代码

**可提交的配置（非敏感）：**
- 应用行为配置（功能开关、限流阈值）
- 构建配置（webpack/vite/tsconfig）
- 部署配置（Dockerfile/nginx.conf）
- 这些放入代码仓库，版本化管理

**不可提交的配置（敏感）：**
- 数据库连接串
- API 密钥/Secret
- 证书/私钥
- 这些通过环境变量或密钥管理服务注入

### 第六部分：Feature Flag

**用途：**
- 未完成功能的开关（开发中不暴露）
- A/B 测试
- 灰度发布
- 紧急关闭有问题的功能

**管理原则：**
- 每个 Flag 有明确的负责人和过期时间
- 定期清理已全量的 Flag（避免 Flag 堆积）
- Flag 命名：`feature_{描述}` 或 `flag_{描述}`

## 检查清单

- [ ] 环境划分明确（local/staging/production）
- [ ] `.env.example` 已创建并提交
- [ ] `.env` 等真实配置在 .gitignore 中
- [ ] 无密钥硬编码在代码中
- [ ] 应用启动时验证必需变量
- [ ] 生产密钥通过安全方式注入
- [ ] 各环境配置结构一致
- [ ] Docker 配置可复现环境
- [ ] 密钥有轮换计划
- [ ] Feature Flag 有清理机制

## 输出物

| 输出物 | 格式 | 存放位置 |
|--------|------|---------|
| .env.example | 环境变量模板 | 项目根目录 |
| 配置加载模块 | 代码 | src/config/ |
| 部署配置 | Dockerfile/yml | docker/ |
| 密钥清单（非值） | 文档 | docs/secrets-inventory.md |

## 常见误区

| 误区 | 正确做法 |
|------|---------|
| 把 .env 提交到 Git | .env 永远在 .gitignore 中 |
| 所有环境用同一份配置 | 环境分离，值不同结构同 |
| 密钥写在代码注释里 | 注释也不行，用密钥管理服务 |
| 缺少变量静默失败 | 启动时验证，缺少就报错退出 |
| 生产密钥用于本地开发 | 各环境独立密钥 |
| 配置散落各处 | 统一配置模块，集中管理 |

## 相关文档

- [Git 工作流](git-workflow.md) — .gitignore 配置
- [CI/CD 流水线](cicd-release.md) — 部署时注入配置
- [安全审查清单](security.md) — 密钥安全
- [备份与灾难恢复](server-ops.md) — 配置备份
