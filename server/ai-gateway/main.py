"""
熵减 AI 网关 — FastAPI 应用入口

@ai-context: MVP-2 阶段的 AI 增强服务网关。本文件为组合层：日志配置见
logging_setup，Provider 初始化见 provider_bootstrap，安全头/请求 ID 中间件
见 security_middleware，健康检查见 health 路由。
@ai-context: 中间件注册顺序（从内到外）RequestId → SecurityHeaders →
RateLimit → Budget → PromptGuard → InputValidation → JWTAuth → CORS。
CORS 生产严格/开发宽松，由 APP_ENV 切换。
@ai-context: Phase1-4 优化集成：熔断器、Prompt 防护、预算控制、
GZip 压缩、并发 Semaphore、后台健康探活。
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from config import APP_CONFIG
from errors import AIError
from middleware.auth import JWTAuthMiddleware
from middleware.rate_limit import RateLimitMiddleware
from middleware.input_validation import InputValidationMiddleware
from middleware.prompt_guard import PromptGuardMiddleware
from cost.budget import BudgetMiddleware
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
    balance_router,
    ritual_recall_router,
    progress_narrative_router,
    chat_router,
    error_pattern_router,
    quiz_gen_router,
    content_tier_router,
    conflict_detect_router,
    concept_precheck_router,
    import_concept_router,
    license_router,
    license_webhook_router,
    beta_router,
    learning_plan_router,
    session_qa_router,
    debate_router,
    counterintuitive_router,
    personify_router,
    mnemonic_router,
    podcast_router,
    learning_coach_router,
    infographic_router,
    freshness_router,
    embodied_router,
    learning_narrative_router,
    haiku_router,
    compile_router,
    micro_card_router,
)
from cache.redis_cache import get_cache

from logging_setup import setup_json_logging
from provider_bootstrap import init_providers, start_health_probe
from security_middleware import SecurityHeadersMiddleware, RequestIdMiddleware
from health import router as health_router

# ============================================================
# 结构化 JSON 日志配置
# ============================================================

setup_json_logging()
logger = logging.getLogger(__name__)

# ============================================================
# Phase3: 并发控制（限制同时进行的 AI 调用数，防止供应商过载）
# ============================================================

# 全局 AI 并发上限（所有功能共享）
AI_CONCURRENCY_LIMIT = int(APP_CONFIG.get("ai_concurrency_limit", "20"))
# 高耗时功能独立并发上限（视频分析、多模态分析）
AI_HEAVY_CONCURRENCY_LIMIT = int(APP_CONFIG.get("ai_heavy_concurrency_limit", "3"))

ai_semaphore: asyncio.Semaphore | None = None
ai_heavy_semaphore: asyncio.Semaphore | None = None


# ============================================================
# 应用生命周期
# ============================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global ai_semaphore, ai_heavy_semaphore

    # 启动时
    logger.info("熵减 AI 网关启动中...")
    logger.info("版本: %s", APP_CONFIG["version"])

    # 初始化并发控制 Semaphore
    ai_semaphore = asyncio.Semaphore(AI_CONCURRENCY_LIMIT)
    ai_heavy_semaphore = asyncio.Semaphore(AI_HEAVY_CONCURRENCY_LIMIT)
    app.state.ai_semaphore = ai_semaphore
    app.state.ai_heavy_semaphore = ai_heavy_semaphore
    logger.info("并发控制: AI 上限=%d, 重任务上限=%d", AI_CONCURRENCY_LIMIT, AI_HEAVY_CONCURRENCY_LIMIT)

    # 初始化 Redis 连接
    cache = get_cache()
    await cache.connect()
    if cache._client is not None:
        logger.info("Redis 连接已建立")
    else:
        logger.error(
            "Redis 连接失败，限流与响应缓存将全部降级失效（限流放行）。"
            "请检查 REDIS_URL 环境变量与 redis 容器状态"
        )

    # 初始化各 Provider 并检查 API Key 配置（含 Key 池 + 熔断器）
    init_providers(app)

    # 启动后台健康探活任务
    probe_task = start_health_probe(app)

    yield

    # 关闭时
    logger.info("熵减 AI 网关关闭中...")
    # 取消健康探活任务
    probe_task.cancel()
    try:
        await probe_task
    except asyncio.CancelledError:
        pass
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
# 中间件注册（执行顺序与注册顺序相反：后注册的先执行）
#
# 纵深防御策略（从内到外）：
#   1. RequestId         — 最内层，先生成 request_id
#   2. SecurityHeaders   — 响应安全头
#   3. RateLimit         — 频率限制层（需要 user_id）
#   4. Budget            — 预算控制层（需要 user_id，Phase2）
#   5. PromptGuard       — Prompt 注入防护（Phase1）
#   6. InputValidation   — 输入校验层
#   7. JWTAuth           — 认证层
#   8. CORS              — 最外层，最先处理请求（含 OPTIONS 预检）
#
# Phase3: GZip 压缩（最内层，仅压缩 > 500B 的响应）
# ============================================================

app.add_middleware(GZipMiddleware, minimum_size=500)  # Phase3: 响应压缩
app.add_middleware(RequestIdMiddleware)         # 最内层：request_id
app.add_middleware(SecurityHeadersMiddleware)   # 纵深防御安全头
app.add_middleware(RateLimitMiddleware)         # 频率限制层（需要 user_id）
app.add_middleware(BudgetMiddleware)            # Phase2: 预算控制层
app.add_middleware(PromptGuardMiddleware)       # Phase1: Prompt 注入防护
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
        allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-Request-ID"],
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
    # GW-M6: 不向客户端透传上游错误细节——exc.message/reason 可能含
    # provider 内部信息、prompt 片段、配额详情，仅返回通用文案与结构化字段
    safe_detail = {
        k: v for k, v in exc.detail.items()
        if k in ("provider", "feature", "limit", "model")
    }
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": _GENERIC_ERROR_MESSAGES.get(exc.status_code, "AI 服务暂时不可用"),
            **safe_detail,
        },
    )


# 上游错误脱敏后的通用错误文案（GW-M6）
_GENERIC_ERROR_MESSAGES: dict[int, str] = {
    401: "认证失败，请重新登录",
    429: "请求过于频繁，请稍后重试",
    502: "模型服务响应异常，请稍后重试",
    503: "AI 服务暂时不可用，请稍后重试",
}


# ============================================================
# 注册路由
# ============================================================

app.include_router(health_router)                # 健康检查（/health, /health/quick, /health/live）
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
app.include_router(progress_narrative_router)  # A3: 微进展叙述——注册于 streaming_router 之前，避免被通配路由拦截
app.include_router(chat_router)                  # 学伴对话（SSE 流式）——必须在 streaming_router 之前注册，避免被 /{feature}/stream 通配拦截
app.include_router(error_pattern_router)         # F4: 黄金错误模式分析——同样注册于 streaming_router 之前
app.include_router(quiz_gen_router)              # N1: 课程级迷你测试生成——同样注册于 streaming_router 之前
app.include_router(content_tier_router)          # N5: 内容分层——同样注册于 streaming_router 之前
app.include_router(conflict_detect_router)       # N6: 概念冲突检测——同样注册于 streaming_router 之前
app.include_router(concept_precheck_router)      # E1: 概念预检——同样注册于 streaming_router 之前
app.include_router(import_concept_router)         # 阶段 A: 知识入籍概念化——同样注册于 streaming_router 之前
app.include_router(license_router)                # 激活码验证（POST /api/v1/license/activate）
app.include_router(license_webhook_router)         # 面包多订单通知（POST /api/v1/license/webhook）
app.include_router(beta_router)                   # 内测邀请 API（POST /api/v1/beta/use-invite）
app.include_router(streaming_router)             # 流式输出（SSE，全量 AI 功能）
app.include_router(balance_router)               # API 余额查询
app.include_router(ritual_recall_router)         # v0.26.0 B1.2: 仪式回顾小问
app.include_router(learning_plan_router)         # P1: 今日学习计划（个性化学习路径）
app.include_router(session_qa_router)            # D2: 课堂内容问答（带引用来源）
app.include_router(debate_router)                # Phase2: AI 辩论对手
app.include_router(counterintuitive_router)      # Phase2: 反直觉发现器
app.include_router(personify_router)             # Phase2: 概念拟人化
app.include_router(mnemonic_router)              # Phase2: 记忆术生成器
app.include_router(podcast_router)               # Phase2: AI 播客生成器
app.include_router(learning_coach_router)        # Phase2: AI 学习教练
app.include_router(infographic_router)           # Phase2: 知识信息图生成器
app.include_router(freshness_router)             # Phase3: 知识保鲜检测
app.include_router(embodied_router)              # Phase3: 概念具身化
app.include_router(learning_narrative_router)    # Phase3: 学习叙事 RPG
app.include_router(haiku_router)                 # Phase3: 学习俳句
app.include_router(compile_router)               # Phase4: 知识编译引擎——同样注册于 streaming_router 之前
app.include_router(micro_card_router)            # Phase4: 微学习卡片流——同样注册于 streaming_router 之前


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
