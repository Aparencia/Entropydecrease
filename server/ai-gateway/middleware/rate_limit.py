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

        # 检查常规频率限制（预检查模式，仅读取计数）
        is_allowed, detail = await self._check_rate_limit(user_id, feature)
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

        # 仅对 2xx 响应递增计数，避免失败请求消耗配额
        if 200 <= response.status_code < 300:
            await self._increment_rate_limit(user_id, feature)

        return response

    async def _check_rate_limit(
        self, user_id: str, feature: str
    ) -> tuple[bool, str]:
        """
        检查用户是否超出频率限制（预检查模式，仅读取计数）

        检查顺序：
        1. 功能级每日限制（如 summarize 每日 15 次）
        2. 全局每日总量限制（每日 50 次）

        Redis 不可用时跳过检查，直接放行。
        实际计数在请求成功（2xx）后由 _increment_rate_limit 执行，
        避免失败请求消耗配额。

        Args:
            user_id: 用户 ID
            feature: 功能名称

        Returns:
            tuple: (是否允许, 拒绝原因)
        """
        cache = get_cache()
        if not cache._client:
            # Redis 不可用，降级放行
            logger.debug("频率限制检查: user=%s, feature=%s (Redis 不可用，放行)", user_id, feature)
            return True, ""

        today = datetime.now().strftime("%Y-%m-%d")

        # 从配置读取限额
        feature_limit = RATE_LIMITS.get(feature, 10)
        daily_limit = RATE_LIMITS.get("daily_total", 50)

        # ---- 第一层：功能级限制（预检查，仅读取） ----
        feature_key = f"rate_limit:{user_id}:{feature}:{today}"
        try:
            feature_raw = await cache.get(feature_key)
            feature_count = int(feature_raw) if feature_raw else 0
        except Exception as exc:
            logger.warning("频率限制预检查失败(功能级): %s", exc)
            return True, ""  # Redis 异常，降级放行

        if feature_count >= feature_limit:
            return False, (
                f"「{feature}」今日使用次数已达上限（{feature_limit} 次/天），"
                "请明天再试，或升级套餐获取更多配额。"
            )

        # 段级高频功能豁免全局每日总量（仅受功能级上限约束）
        if feature in GLOBAL_EXEMPT_FEATURES:
            return True, ""

        # ---- 第二层：全局每日总量限制（预检查，仅读取） ----
        global_key = f"rate_limit:{user_id}:global:{today}"
        try:
            global_raw = await cache.get(global_key)
            global_count = int(global_raw) if global_raw else 0
        except Exception as exc:
            logger.warning("频率限制预检查失败(全局): %s", exc)
            return True, ""  # Redis 异常，降级放行

        if global_count >= daily_limit:
            return False, (
                f"今日 AI 功能总使用次数已达上限（{daily_limit} 次/天），"
                "请明天再试，或升级套餐获取更多配额。"
            )

        logger.debug(
            "频率限制预检查通过: user=%s, feature=%s, feature_count=%d/%d, global_count=%d/%d",
            user_id, feature, feature_count, feature_limit, global_count, daily_limit,
        )
        return True, ""

    async def _increment_rate_limit(self, user_id: str, feature: str) -> None:
        """
        请求成功后递增频率限制计数器

        在 dispatch 中仅对 2xx 响应调用，避免失败请求消耗配额。

        Args:
            user_id: 用户 ID
            feature: 功能名称
        """
        cache = get_cache()
        if not cache._client:
            return

        today = datetime.now().strftime("%Y-%m-%d")

        # 计算到当日结束的剩余秒数（至少 60 秒，避免边界问题）
        now = datetime.now()
        seconds_until_end_of_day = (
            (24 - now.hour) * 3600
            - now.minute * 60
            - now.second
        )
        ttl = max(seconds_until_end_of_day, 60)

        # ---- 第一层：功能级计数 ----
        feature_key = f"rate_limit:{user_id}:{feature}:{today}"
        try:
            await cache.increment(feature_key, expire=ttl)
        except Exception as exc:
            logger.warning("频率限制计数失败(功能级): %s", exc)

        # 段级高频功能不计入全局每日总量
        if feature in GLOBAL_EXEMPT_FEATURES:
            return

        # ---- 第二层：全局每日总量计数 ----
        global_key = f"rate_limit:{user_id}:global:{today}"
        try:
            await cache.increment(global_key, expire=ttl)
        except Exception as exc:
            logger.warning("频率限制计数失败(全局): %s", exc)
