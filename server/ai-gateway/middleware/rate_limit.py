"""
熵减 AI 网关 — 频率限制中间件

基于 Redis 的滑动窗口频率限制：
- 按 user_id + feature 计数
- 双层计数器：全局每日上限 + 功能级上限
- Redis 不可用时放行（降级到无限制）
- 超限返回 HTTP 429

@ai-context: 频率限制中间件：按用户+功能维度基于 Redis 计数执行每日上限（RATE_LIMITS），超限返回 429。
"""

import logging
from datetime import datetime

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from cache.redis_cache import get_cache
from config import RATE_LIMITS

logger = logging.getLogger(__name__)

# GW-M12: 原子限流检查 Lua 脚本——INCR + 超限回滚（DECR）在同一脚本内完成，
# 消除"检查后回退"的竞态窗口（并发请求中一个失败误减他人占用）与负数计数
_LUA_CHECK_RATE = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count > tonumber(ARGV[1]) then
    redis.call('DECR', KEYS[1])
    return -1
end
return count
"""

# ============================================================
# API 路径 → 功能名称映射
# ============================================================
# 中间件通过精确匹配请求路径确定功能名称，再查询 RATE_LIMITS 执行配额检查。
# 新增路由时必须在此注册，否则请求将跳过频率限制（不受配额保护）。
# 注意：通配路径（如 /{feature}/stream）无法精确匹配，需在路由层自行限流。
PATH_TO_FEATURE: dict[str, str] = {
    # ---- 早期核心路由 ----
    "/api/v1/ai/summarize": "summarize",               # 笔记摘要
    "/api/v1/ai/generate-cards": "generate_cards",     # 闪卡生成
    "/api/v1/ai/evaluate-explanation": "evaluate",     # 费曼评估
    "/api/v1/ai/recommend-duration": "recommend",      # 番茄钟时长推荐
    "/api/v1/vision/extract": "vision_extract",         # 视觉内容提取（修正为实际路由前缀 /api/v1/vision，原路径 /api/v1/ai/vision 会导致限流失效）
    "/api/v1/asr/transcribe": "transcribe",            # 语音转文字（段级高频，豁免全局总量）
    "/api/v1/ai/tag-content": "tag_content",           # 内容标签
    "/api/v1/ai/optimize-card": "optimize_card",       # 闪卡优化
    "/api/v1/ai/feynman-question": "feynman_question", # 费曼反问
    "/api/v1/ai/feynman-evaluate-answers": "feynman_evaluate",  # 费曼回答评估
    "/api/v1/ai/sort-inspiration": "sort_inspiration", # 灵感内容智能分拣

    # ---- v1.0.0 新增路由（learning.py） ----
    "/api/v1/ai/anchor-point": "anchor_point",         # 记忆锚点生成
    "/api/v1/ai/socratic": "socratic",                 # 苏格拉底式追问（单轮）
    "/api/v1/ai/predict": "predict",                   # 预测驱动学习
    "/api/v1/ai/rescue": "rescue",                     # 卡壳三级救援

    # ---- v1.1.0 新增路由 ----
    "/api/v1/ai/inspiration-draft": "inspiration_draft",  # AI 草稿生成
    "/api/v1/ai/ritual-recall": "ritual_recall",          # 仪式回顾小问（v0.26.0 B1.2）
    "/api/v1/ai/progress-narrative": "progress_narrative", # A3 微进展叙述（每周一次）

    # ---- FEAT-022: 苏格拉底式学习（socratic.py，prefix=/api/v1/ai/socratic） ----
    "/api/v1/ai/socratic/brainstorm": "socratic_brainstorm",  # 苏格拉底头脑风暴
    "/api/v1/ai/socratic/evaluate": "socratic_evaluate",      # 苏格拉底四维度评估
    "/api/v1/ai/socratic/deepening": "socratic_deepening",    # 苏格拉底深化角度

    # ---- Path B: 多模态课堂分析（multimodal.py + course_detect.py） ----
    "/api/v1/multimodal/analyze-session": "multimodal_analyze",  # 多图联合课堂分析
    "/api/v1/multimodal/merge-notes": "summarize",               # 合并片段笔记（复用 summarize 配额）
    "/api/v1/multimodal/detect-course": "multimodal_analyze",    # AI 课程识别（复用 multimodal_analyze 配额）

    # ---- 学伴对话（chat.py） ----
    "/api/v1/ai/chat/stream": "chat",                  # 学伴对话流式端点

    # ---- F4: 黄金错误模式分析（error_pattern.py） ----
    "/api/v1/ai/error-pattern": "error_pattern",       # 错误模式分析

    # ---- N1: 课程级迷你测试生成（quiz_gen.py） ----
    "/api/v1/ai/generate-quiz": "quiz_gen",            # 迷你测试生成

    # ---- N5/N6: 内容分层与概念冲突检测（content_tier.py + conflict_detect.py） ----
    "/api/v1/ai/content-tier": "content_tier",         # 内容三层分层
    "/api/v1/ai/conflict-detect": "conflict_detect",   # 概念冲突检测

    # ---- E1: 概念预检（concept_precheck.py） ----
    "/api/v1/ai/concept-precheck": "concept_precheck", # 费曼讲解前探测问题

    # ---- 知识入籍概念化（import_concept.py） ----
    "/api/v1/ai/import/concepts": "import_concept",  # 切块文本→概念候选

    # ---- Path C: 视频分析（multimodal_video.py） ----
    "/api/v1/multimodal/analyze-video": "video_analyze",  # 视频课堂分析

    # 注意：/{feature}/stream（streaming.py）为通配路径，无法精确匹配，
    # 其限流由流式路由内部通过 feature 参数自行处理。
}

# 豁免全局每日总量的功能：段级高频调用（如课堂实时转录一节课数百段）
# 与高频多轮对话（学伴 chat），若计入 daily_total 会很快耗尽全部 AI 配额，
# 仅受各自功能级上限约束
GLOBAL_EXEMPT_FEATURES: frozenset[str] = frozenset({"transcribe", "chat"})


class RateLimitMiddleware(BaseHTTPMiddleware):
    """频率限制中间件 — 基于 Redis 滑动窗口"""

    async def dispatch(self, request: Request, call_next):
        # 仅对 AI 功能 API 进行频率限制
        feature = PATH_TO_FEATURE.get(request.url.path)
        if not feature:
            return await call_next(request)

        # 获取 user_id（由 JWT 中间件注入）
        user_id = getattr(request.state, "user_id", "anonymous")
        # GW-M11: 匿名用户按 IP 分桶——所有匿名请求共享同一配额会被
        # 恶意用户耗尽（误伤合法匿名用户），IP 维度隔离各自计数
        if user_id == "anonymous":
            client_ip = request.client.host if request.client else "unknown"
            xff = request.headers.get("x-forwarded-for", "")
            if xff:
                client_ip = xff.split(",")[0].strip() or client_ip
            user_id = f"anonymous:{client_ip}"

        # 检查常规频率限制（Lua 原子 INCR+校验，防止 TOCTOU 竞态）
        is_allowed, detail = await check_rate_limit(user_id, feature)
        if not is_allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": detail,
                    "feature": feature,
                },
            )

        # 执行请求
        response = await call_next(request)

        # 非 2xx 响应时回退计数（失败请求不消耗配额）
        if not (200 <= response.status_code < 300):
            await rollback_rate_limit(user_id, feature)

        return response


async def check_rate_limit(user_id: str, feature: str) -> tuple[bool, str]:
    """
    检查用户是否超出频率限制（原子 INCR 操作，防止 TOCTOU 竞态）

    使用 Redis INCR 原子递增后检查返回值，避免"读-判断-写"模式下的竞态条件。
    超过限额时由调用方调用 rollback_rate_limit 回退计数。
    中间件与流式路由（/{feature}/stream 通配路径）共用本函数。

    Args:
        user_id: 用户 ID
        feature: 功能名称

    Returns:
        tuple: (是否允许, 拒绝原因)
    """
    cache = get_cache()
    if not cache._client:
        logger.debug("频率限制检查: user=%s, feature=%s (Redis 不可用，放行)", user_id, feature)
        return True, ""

    today = datetime.now().strftime("%Y-%m-%d")

    # 从配置读取限额
    feature_limit = RATE_LIMITS.get(feature, 10)
    daily_limit = RATE_LIMITS.get("daily_total", 50)

    # 计算到当日结束的剩余秒数（至少 60 秒）
    now = datetime.now()
    seconds_until_end_of_day = (
        (24 - now.hour) * 3600 - now.minute * 60 - now.second
    )
    ttl = max(seconds_until_end_of_day, 60)

    # ---- 第一层：功能级限制（Lua 原子 INCR + 检查，超限自动回滚） ----
    feature_key = f"rate_limit:{user_id}:{feature}:{today}"
    feature_count = await _lua_check_limit(feature_key, feature_limit, ttl)
    if feature_count < 0:
        return False, (
            f"「{feature}」今日使用次数已达上限（{feature_limit} 次/天），"
            "请明天再试，或升级套餐获取更多配额。"
        )

    # 段级高频功能豁免全局每日总量
    if feature in GLOBAL_EXEMPT_FEATURES:
        return True, ""

    # ---- 第二层：全局每日总量限制（Lua 原子 INCR + 检查） ----
    global_key = f"rate_limit:{user_id}:global:{today}"
    global_count = await _lua_check_limit(global_key, daily_limit, ttl)
    if global_count < 0:
        return False, (
            f"今日 AI 功能总使用次数已达上限（{daily_limit} 次/天），"
            "请明天再试，或升级套餐获取更多配额。"
        )

    logger.debug(
        "频率限制检查通过: user=%s, feature=%s, feature_count=%d/%d, global_count=%d/%d",
        user_id, feature, feature_count, feature_limit, global_count, daily_limit,
    )
    return True, ""


async def _lua_check_limit(key: str, limit: int, ttl: int) -> int:
    """Lua 原子限流检查：返回 -1 表示超限（计数已自动回滚），否则返回当前计数。

    Redis 不可用/脚本执行失败时返回 0（fail-open，与既有策略一致）。
    """
    cache = get_cache()
    if not cache._client:
        return 0
    try:
        result = await cache._client.eval(_LUA_CHECK_RATE, 1, key, limit, ttl)
        return int(result)
    except Exception as exc:
        logger.warning("限流 Lua 检查失败 key=%s: %s", key, exc)
        return 0


async def rollback_rate_limit(user_id: str, feature: str) -> None:
    """回退频率限制计数器。

    ⚠️ 仅允许在 check_rate_limit 返回 True（本次 INCR 已生效）之后、
    请求未成功消费配额（非 2xx）时调用——此时功能级与全局计数均已 +1，
    回滚两层是准确的。超限路径（check 返回 False）Lua 脚本已原子回滚，
    禁止调用本函数，否则双重 DECR 会把配额刷穿（GW-2#2）。
    """
    cache = get_cache()
    if not cache._client:
        return
    today = datetime.now().strftime("%Y-%m-%d")
    feature_key = f"rate_limit:{user_id}:{feature}:{today}"
    try:
        await cache._client.decr(feature_key)
    except Exception as exc:
        logger.debug("频率限制回退失败(功能级): %s", exc)

    if feature in GLOBAL_EXEMPT_FEATURES:
        return
    global_key = f"rate_limit:{user_id}:global:{today}"
    try:
        await cache._client.decr(global_key)
    except Exception as exc:
        logger.debug("频率限制回退失败(全局): %s", exc)
