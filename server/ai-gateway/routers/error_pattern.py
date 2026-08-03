"""
熵减 AI 网关 —— 错误模式分析路由

POST /api/v1/ai/error-pattern
调用 ErrorPatternChain 分析黄金错误记录，识别错误模式（概念盲区/混淆/过度自信）。

@ai-context: 错误模式分析路由——输入黄金错误列表，输出错误模式分类与建议；
复用 call_with_fallback_for_request 降级链与 Redis 缓存。
"""
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.error_pattern_chain import ErrorPatternChain
from cache.redis_cache import get_cache
from fastapi import HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["错误模式分析"])


# ============================================================
# 请求/响应模型
# ============================================================


class GoldenErrorRecord(BaseModel):
    """单条黄金错误记录"""
    flashcardId: str = Field(..., description="闪卡 ID")
    correctAnswer: str = Field(..., description="正确答案")
    userAnswer: str = Field(..., description="用户回答")


class ErrorPatternRequest(BaseModel):
    """错误模式分析请求"""
    goldenErrors: list[GoldenErrorRecord] = Field(..., description="黄金错误记录列表")


class PatternItem(BaseModel):
    """错误模式项"""
    type: str = Field(..., description="错误类型：concept_blind/concept_confusion/overconfidence")
    keywords: list[str] = Field(..., description="3个关键词")
    explanation: str = Field(..., description="错误原因简述")
    suggestion: str = Field(..., description="具体改进建议")


class TopOffender(BaseModel):
    """高频错误卡片"""
    flashcardId: str = Field(..., description="闪卡 ID")
    count: int = Field(..., description="出现次数")


class ErrorPatternResponse(BaseModel):
    """错误模式分析响应"""
    patterns: list[PatternItem] = Field(..., description="错误模式列表")
    top_offenders: list[TopOffender] = Field(..., description="高频错误卡片列表")
    summary: str = Field(..., description="整体趋势总结")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


@router.post("/error-pattern", response_model=ErrorPatternResponse, summary="分析黄金错误模式")
async def error_pattern(request: Request, body: ErrorPatternRequest) -> ErrorPatternResponse:
    """
    分析黄金错误记录，识别错误模式并给出改进建议

    - 使用通义千问 qwen-plus 模型 + JSON Mode
    - 支持最多 20 条错误记录分析
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("错误模式分析请求: user=%s, errors_count=%d", user_id, len(body.goldenErrors))

    # 生成 AI 响应缓存键（基于输入错误记录）
    errors_str = "|".join([
        f"{e.flashcardId}:{e.correctAnswer[:50]}:{e.userAnswer[:50]}"
        for e in body.goldenErrors
    ])
    cache_key = hashlib.sha256(errors_str.encode()).hexdigest()

    # 检查 Redis AI 响应缓存
    cache = get_cache()
    if cache._client is not None:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("错误模式分析缓存命中: user=%s", user_id)
            return ErrorPatternResponse(**cached)

    # 通过 fallback 链自动选择 Provider 并在失败时重试/降级
    async def _run_chain(provider, model_name):
        chain = ErrorPatternChain(provider=provider, model=model_name)
        return await chain.run(
            golden_errors=[{
                "flashcardId": e.flashcardId,
                "correctAnswer": e.correctAnswer,
                "userAnswer": e.userAnswer,
            } for e in body.goldenErrors],
        )

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "error_pattern", request, _run_chain
        )

        patterns_data = chain_result.get("patterns", [])
        top_offenders_data = chain_result.get("top_offenders", [])
        summary = chain_result.get("summary", "暂无总结")
        model_used = chain_result.get("model", "unknown")
        tokens_used = chain_result.get("tokens_used", 0)

        logger.info("错误模式分析完成: provider=%s, patterns=%d, top_offenders=%d", 
                    used_provider, len(patterns_data), len(top_offenders_data))

    except RuntimeError as e:
        logger.error("错误模式分析服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    # 缓存成功结果（Redis 可用时）——fallback 结果不入缓存，避免 AI 恢复后 1 小时内持续失效
    if cache._client is not None and chain_result.get("model") != "fallback":
        await cache.set_ai_cache(cache_key, chain_result, expire=3600)

    # 构建响应对象
    patterns = [
        PatternItem(**p) for p in patterns_data
    ]
    top_offenders = [
        TopOffender(**o) for o in top_offenders_data
    ]

    return ErrorPatternResponse(
        patterns=patterns,
        top_offenders=top_offenders,
        summary=summary,
        model=model_used,
        tokens_used=tokens_used,
    )
