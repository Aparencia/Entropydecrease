# AGENTS.md — 熵减 (Entropydecrease) 仓库代理上下文

## 项目概述

熵减是面向学生与终身学习者的 AI 智能学习桌面应用，践行费曼学习法与间隔重复。
核心理念：本地优先 + AI 增强可选。

## 项目结构

```
├── client/          # Electron + React 桌面客户端（主产品）
│   ├── electron/    # Electron 主进程（TypeScript）
│   └── src/         # React 渲染进程（Vite + Tailwind）
├── server/          # 后端服务
│   ├── ai-gateway/  # AI 网关（Python / FastAPI / LangChain）
│   ├── sync-service/# 数据同步服务（Go / Gin）
│   └── nginx/       # 反向代理配置
├── website/         # 官网（Next.js 静态站点）
├── scripts/         # 仓库级工具脚本（版本、音效生成、会话检测）
└── docs/            # 全生命周期开发工作流文档
```

## 核心模块边界

| 模块 | 入口 | 职责 |
|------|------|------|
| Electron 主进程 | `client/electron/main.ts` | 窗口管理、IPC、系统托盘、自动更新 |
| AI 集成层 | `client/electron/ai/` | 本地 Ollama 推理 + 云端 AI 网关调度 |
| AI 网关配置 | `server/ai-gateway/config/` | 多模型路由（Qwen/DeepSeek/GLM/Gemini）、超时、降级（包化：runtime/limits/providers/fallback/app） |
| AI 网关入口 | `server/ai-gateway/main.py` | FastAPI 应用装配、中间件、路由注册 |
| 前端渲染 | `client/src/App.tsx` | React 路由、全局布局、3D 场景 |
| 数据层 | `client/electron/db/` | better-sqlite3 本地持久化 |
| 同步服务入口 | `server/sync-service/main.go` | Gin 路由装配、健康探针、WebSocket 通道 |

## 变更需额外审查的文件

以下文件变更影响面大，需要额外审查：

- `client/electron/main.ts` — 应用生命周期，改动可能导致启动失败
- `client/electron/preload.ts` — IPC 桥接安全边界
- `client/electron/ai/` — AI 调度逻辑，涉及多 provider 降级链
- `server/ai-gateway/config/` — 模型路由与密钥配置，影响全部 AI 功能
- `server/ai-gateway/middleware/auth.py` — JWT 认证，安全关键
- `server/ai-gateway/middleware/rate_limit.py` — 频率限制，影响可用性
- `server/sync-service/middleware/auth.go` — 同步服务 JWT 认证，安全关键
- `server/docker-compose.prod.yml` — 生产编排，改动影响部署
- `client/electron-builder.yml` — 打包配置，影响发布产物
- `.github/workflows/` — CI/CD 流水线

## 本地验证命令

```bash
# 客户端（在 client/ 目录下执行）
npm run lint          # Oxlint 代码检查
npm run test          # Vitest 单元测试
npm run build         # tsc -b && vite build（TypeScript 编译 + Vite 打包）

# Electron 桌面端构建
npm run electron:build

# 服务端 AI 网关（在 server/ai-gateway/ 目录下）
pip install -r requirements.txt
python -m pytest tests/ -q   # 单元测试（331 基线）
python main.py               # 启动 FastAPI 开发服务器

# 同步服务（在 server/sync-service/ 目录下）
go build ./... && go vet ./... && go test ./...

# 官网（在 website/ 目录下）
npm run build         # next build（静态导出）

# 仓库级
npm run release:dry   # semantic-release 干跑验证（需 git 仓库）
```

## 技术栈速查

- **客户端**: React 18, TypeScript, Vite, Electron, Tailwind CSS, Zustand, TanStack Query, Dexie.js, TipTap, Framer Motion, Vitest, Oxlint
- **AI 网关**: Python, FastAPI, LangChain, 通义千问/DeepSeek/智谱 GLM/Gemini
- **同步服务**: Go, Gin, PostgreSQL, Redis
- **官网**: Next.js (静态导出)
- **基础设施**: Docker, docker-compose, Nginx, electron-updater

## 约定

- 提交信息遵循 Conventional Commits 规范
- 版本号由 semantic-release 自动管理
- AI 功能必须支持离线降级（本地优先原则）
- 多模态模型 `max_tokens` 限制：Qwen 最大 4096，GLM-4V-Flash 最大 1024
- 单文件 ≤300 行（AI 编程规范 §1）；全部源码文件需含 `@ai-context` 中英双语注释（§3）
- 用户数据标识（keban 库名 / keban_device_id / keban_crypto_salt 等）永久豁免品牌重命名，保证跨版本数据兼容
