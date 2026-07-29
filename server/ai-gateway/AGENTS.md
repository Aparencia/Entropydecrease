# AGENTS.md — server/ai-gateway AI 网关子系统

## 入口

- `main.py` — FastAPI 应用入口（中间件注册、路由挂载、全局异常处理）
- `config.py` — 多模型路由配置（Provider 选择、模型槽位、超时、降级策略）

## 目录结构

```
ai-gateway/
├── main.py          # 应用入口 + 中间件栈
├── config.py        # Provider/模型/超时/降级 配置中枢
├── errors.py        # 统一错误类型定义
├── chains/          # LangChain 调用链（每个 AI 功能一个 chain 文件）
├── providers/       # 模型 Provider 适配（qwen/deepseek/glm/gemini/fallback）
├── routers/         # FastAPI 路由（按功能域拆分）
├── middleware/      # 中间件（auth/rate_limit/input_validation）
├── prompts/         # Prompt 模板（.txt 和 .py）
├── cache/           # Redis 缓存层
├── requirements.txt # Python 依赖
└── Dockerfile       # 容器构建
```

## 约束

- 新增 AI 功能必须：① 在 `chains/` 创建 chain ② 在 `routers/` 注册路由 ③ 在 `config.py` 配置模型槽位
- 模型标识符必须使用平台标准名（如 `qwen2.5-vl-72b-instruct`，不可用别名 `qwen-vl-max`）
- `max_tokens` 限制：Qwen 系列最大 4096；GLM-4V-Flash 严格 [1, 1024]
- 所有路由必须经过 JWT 认证中间件和频率限制中间件
- Provider 降级链：主 Provider 超时/错误 → fallback_provider 自动切换
- 环境变量通过 `server/.env` 加载，密钥不得硬编码

## 验证路由

```bash
# 在 server/ai-gateway/ 目录下执行
pip install -r requirements.txt   # 安装依赖
python -c "from config import APP_CONFIG; print('config OK')"  # 配置加载验证
python main.py                    # 启动开发服务器（默认 :8000）

# 在 server/ 目录下执行（容器化验证）
docker-compose up --build ai_gateway  # 容器构建 + 启动
```

## 高影响文件

- `config.py` — 模型路由变更影响全部 AI 功能，需验证所有 chain
- `middleware/auth.py` — 认证逻辑变更影响所有受保护端点
- `middleware/rate_limit.py` — 限流策略变更影响可用性
- `providers/fallback_provider.py` — 降级逻辑变更影响容错能力
- `main.py` — 中间件顺序变更可能破坏请求处理链
