"""  
课伴 AI 网关 — FastAPI 应用入口

MVP-2 阶段的 AI 增强服务网关。
- 安全头中间件（纵深防御，与 Nginx 互为补充）
- CORS 中间件（生产环境严格模式 / 开发环境宽松模式）
- JWT 认证中间件
- 频率限制中间件
- 健康检查端点
- 全局异常处理器
"""

import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pythonjsonlogger import jsonlogger
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from config import APP_CONFIG
from errors import AIError
from middleware.auth import JWTAuthMiddleware
from middleware.rate_limit import RateLimitMiddleware
from middleware.input_validation import InputValidationMiddleware
from routers import (
    summarize_router,
    generate_cards_router,
    evaluate_router,
    recommend_router,
    vision_router,
    transcribe_router,
    tag_content_router,
    feynman_question_router,
    inspiration_router,
    learning_router,
    inspiration_draft_router,
    socratic_router,
    multimodal_router,
    course_detect_router,
    streaming_router,
)
from cache.redis_cache import get_cache

# ============================================================
# 结构化 JSON 日志配置
# ============================================================


def setup_json_logging():
    """配置结构化 JSON 日志"""
    log_handler = logging.StreamHandler()
    log_formatter = jsonlogger.JsonFormatter(
        fmt="%(timestamp)s %(level)s %(module)s %(message)s",
        rename_fields={
            "timestamp": "timestamp",
            "levelname": "level",
            "name": "module",
            "message": "message",
        },
    )
    log_handler.setFormatter(log_formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(log_handler)
    root_logger.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO")))


setup_json_logging()
logger = logging.getLogger(__name__)


# ============================================================
# 应用生命周期
# ============================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("课伴 AI 网关启动中...")
    logger.info("版本: %s", APP_CONFIG["version"])

    # 初始化 Redis 连接
    cache = get_cache()
    await cache.connect()
    logger.info("Redis 连接已建立")

    # 初始化各 Provider 并检查 API Key 配置
    from config import AI_PROVIDERS, is_valid_api_key
    from providers.qwen_provider import QwenProvider
    from providers.deepseek_provider import DeepSeekProvider
    from providers.glm_provider import GLMProvider
    from providers.gemini_provider import GeminiProvider
    from providers.fallback_provider import FallbackProvider

    # 将 Provider 实例存储到 app.state，供路由层使用
    app.state.providers = {}

    qwen_cfg = AI_PROVIDERS.get("qwen", {})
    if is_valid_api_key(qwen_cfg.get("api_key", "")):
        app.state.providers["qwen"] = QwenProvider(
            base_url=qwen_cfg["base_url"],
            api_key=qwen_cfg["api_key"],
        )
        logger.info("Provider [qwen]: 已初始化")
    else:
        logger.warning("Provider [qwen]: API Key 未配置，跳过初始化")

    deepseek_cfg = AI_PROVIDERS.get("deepseek", {})
    if is_valid_api_key(deepseek_cfg.get("api_key", "")):
        app.state.providers["deepseek"] = DeepSeekProvider(
            base_url=deepseek_cfg["base_url"],
            api_key=deepseek_cfg["api_key"],
        )
        logger.info("Provider [deepseek]: 已初始化")
    else:
        logger.warning("Provider [deepseek]: API Key 未配置，跳过初始化")

    glm_cfg = AI_PROVIDERS.get("glm", {})
    if is_valid_api_key(glm_cfg.get("api_key", "")):
        app.state.providers["glm"] = GLMProvider(
            base_url=glm_cfg["base_url"],
            api_key=glm_cfg["api_key"],
        )
        logger.info("Provider [glm]: 已初始化")
    else:
        logger.warning("Provider [glm]: API Key 未配置，跳过初始化")

    # Gemini: google-genai SDK，仅需 api_key
    gemini_cfg = AI_PROVIDERS.get("gemini", {})
    if is_valid_api_key(gemini_cfg.get("api_key", "")):
        app.state.providers["gemini"] = GeminiProvider(
            api_key=gemini_cfg["api_key"],
        )
        logger.info("Provider [gemini]: 已初始化")
    else:
        logger.warning("Provider [gemini]: API Key 未配置，跳过初始化")
    
    # FallbackProvider 始终可用
    app.state.providers["fallback"] = FallbackProvider()
    logger.info("Provider [fallback]: 已初始化（降级兜底）")

    for name, cfg in AI_PROVIDERS.items():
        has_key = is_valid_api_key(cfg.get("api_key", ""))
        status = "已配置" if has_key else "未配置（API Key 缺失或为占位符）"
        logger.info("Provider [%s]: %s", name, status)

    yield

    # 关闭时
    logger.info("课伴 AI 网关关闭中...")
    # 关闭 Redis 连接
    cache = get_cache()
    await cache.disconnect()
    logger.info("Redis 连接已关闭")


# ============================================================
# FastAPI 应用实例
# ============================================================

# 生产环境禁用自动文档生成（通过 docs_url/redoc_url/openapi_url=None）
_docs_url = "/docs" if APP_CONFIG.get("app_env") != "production" else None
_redoc_url = "/redoc" if APP_CONFIG.get("app_env") != "production" else None
_openapi_url = "/openapi.json" if APP_CONFIG.get("app_env") != "production" else None

app = FastAPI(
    title=APP_CONFIG["title"],
    version=APP_CONFIG["version"],
    description=APP_CONFIG["description"],
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    openapi_url=_openapi_url,
)


# ============================================================
# 纵深防御：安全头中间件（与 Nginx 互为补充）
# ============================================================


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """为每个响应添加安全头（纵深防御，与 Nginx 互为补充）"""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'"
        )
        return response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """为每个请求生成/透传 request_id，并写入响应头"""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["ai-gateway-request-id"] = request_id
        return response


# ============================================================
# 中间件注册（执行顺序与注册顺序相反：后注册的先执行）
#
# 纵深防御策略：
#   FastAPI 层添加安全头（X-Content-Type-Options / X-Frame-Options /
#   Referrer-Policy / CSP），与 Nginx 互为补充。
#   HSTS 由 Nginx 独占管理（FastAPI 层不重复添加）。
#   X-XSS-Protection 已废弃，不再添加。
#
# 注册顺序（从内到外）：
#   1. RequestId         — 最内层，先生成 request_id
#   2. SecurityHeaders   — 响应安全头
#   3. RateLimit         — 频率限制层（需要 user_id，故放在 JWTAuth 之后）
#   4. InputValidation   — 输入校验层
#   5. JWTAuth           — 认证层
#   6. CORS              — 最后注册 = 最外层，最先处理请求（含 OPTIONS 预检）
#
# CORS 策略：
#   - 生产环境：仅允许 CORS_ORIGINS 环境变量中配置的域名
#   - 开发环境：允许所有来源（便于调试）
# ============================================================

app.add_middleware(RequestIdMiddleware)         # 最内层：request_id
app.add_middleware(SecurityHeadersMiddleware)   # 纵深防御安全头
app.add_middleware(RateLimitMiddleware)         # 频率限制层（需要 user_id）
app.add_middleware(InputValidationMiddleware)   # 输入校验层
app.add_middleware(JWTAuthMiddleware)           # 认证层

# CORS 中间件：根据 APP_ENV 区分严格/宽松模式
if APP_CONFIG.get("app_env") == "production":
    # 生产环境 CORS 严格模式：仅允许配置的域名
    app.add_middleware(
        CORSMiddleware,
        allow_origins=APP_CONFIG["cors_origins"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-User-API-Key", "X-Request-ID"],
    )
else:
    # 开发环境 CORS 宽松模式：允许所有来源（便于调试）
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "ai-gateway-request-id"],
    )


# ============================================================
# 全局异常处理器
# ============================================================


@app.exception_handler(AIError)
async def ai_error_handler(request: Request, exc: AIError) -> JSONResponse:
    """将 AIError 映射为对应的 HTTP 状态码"""
    logger.warning(
        "AIError: %s (status=%d, path=%s)",
        exc.message, exc.status_code, request.url.path,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.message,
            **exc.detail,
        },
    )


# ============================================================
# 健康检查端点
# ============================================================


@app.get("/health", tags=["系统"])
async def health_check():
    """
    健康检查端点

    对每个 Provider 发送 ping 测试，记录响应时间和可用性。
    并行 ping 所有 Provider（最坏耗时 5s），并缓存结果 30 秒。
    """
    # 30 秒 TTL 健康状态缓存
    cache_ttl = 30
    cached_result = getattr(app.state, "_health_cache", None)
    cache_time = getattr(app.state, "_health_cache_time", 0)
    now = time.monotonic()
    if cached_result is not None and (now - cache_time) < cache_ttl:
        return cached_result

    async def _ping_provider(name, provider):
        """单个 Provider 健康检测（带 5 秒超时）"""
        try:
            result = await asyncio.wait_for(provider.health_check(), timeout=5.0)
            return name, result
        except asyncio.TimeoutError:
            return name, {"status": "unhealthy", "latency_ms": 5000, "error": "health check timeout"}
        except Exception as e:
            return name, {"status": "unhealthy", "latency_ms": 0, "error": str(e)}

    # 并行 ping 所有 Provider
    tasks = [
        _ping_provider(name, provider)
        for name, provider in app.state.providers.items()
    ]
    results = await asyncio.gather(*tasks) if tasks else []
    providers_status = dict(results)

    # Redis 连接状态检查
    redis_status = "not_connected"
    try:
        cache = get_cache()
        if cache._client is not None:
            await cache._client.ping()
            redis_status = "connected"
    except Exception as e:
        redis_status = f"error: {str(e)}"

    # 整体健康状态
    healthy_providers = sum(1 for p in providers_status.values() if p.get("status") == "healthy")
    overall = "healthy" if healthy_providers > 0 else "degraded"

    response = {
        "status": overall,
        "service": "ai-gateway",
        "version": APP_CONFIG["version"],
        "providers": providers_status,
        "redis": redis_status,
        "healthy_count": healthy_providers,
        "total_count": len(providers_status),
    }

    # 缓存结果
    app.state._health_cache = response
    app.state._health_cache_time = now

    return response


@app.get("/health/live", tags=["系统"])
async def liveness():
    """K8s liveness probe — 仅检查进程存活"""
    return {"status": "alive"}


@app.get("/health/quick", tags=["系统"])
async def health_quick():
    """
    轻量级健康检查 — 仅检查进程存活，不 ping 上游 Provider

    供桌面客户端频繁轮询使用，避免每次触发重量级 Provider 健康检查。
    """
    return {
        "status": "ok",
        "service": "ai-gateway",
        "version": APP_CONFIG["version"],
    }


# ============================================================
# 注册路由
# ============================================================

app.include_router(summarize_router)
app.include_router(generate_cards_router)
app.include_router(evaluate_router)
app.include_router(recommend_router)
app.include_router(vision_router)
app.include_router(transcribe_router)
app.include_router(feynman_question_router)
app.include_router(tag_content_router)
app.include_router(inspiration_router)
app.include_router(learning_router)         # v1.0.0: 记忆锚点/苏格拉底/预测/救援
app.include_router(inspiration_draft_router) # v1.1.0: AI 草稿生成
app.include_router(socratic_router)          # FEAT-022: 苏格拉底式学习（头脑风暴+四维度评估）
app.include_router(multimodal_router)          # Path B: 多模态课堂分析（多图联合 → Markdown 笔记）
app.include_router(course_detect_router)       # 课程识别（可选 AI 模式，单图推断课程信息）
app.include_router(streaming_router)             # 流式输出（SSE，全量 AI 功能）


# ============================================================
# 启动入口（开发用）
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # 开发模式热重载
    )
