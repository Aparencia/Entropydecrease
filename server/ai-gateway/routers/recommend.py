"""
熵减 AI 网关 — 番茄钟推荐路由

POST /api/v1/ai/recommend-duration
调用 DeepSeek 根据用户历史专注数据推荐个性化番茄钟时长。

@ai-context: 番茄钟推荐路由：基于历史专注数据推荐时长/策略，含本地规则降级。
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from providers.fallback_provider import FallbackProvider
from chains.recommend_chain import RecommendChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["番茄钟推荐"])


# ============================================================
# 请求/响应模型
# ============================================================


class FocusSession(BaseModel):
    """单次专注记录"""
    duration_minutes: int = Field(..., description="专注时长（分钟）")
    completed: bool = Field(default=False, description="是否完成")
    subject: str = Field(default="", description="学习科目")
    timestamp: str = Field(default="", description="时间戳")


class RecommendRequest(BaseModel):
    """番茄钟推荐请求"""
    history: list[FocusSession] = Field(
        default_factory=list, description="历史专注记录"
    )
    mode: str = Field(
        default="general",
        description="推荐模式：general（通用）| pomodoro（14天增强+科目分布）",
    )


class DurationConfig(BaseModel):
    """番茄钟时长配置"""
    recommended_minutes: int = Field(..., description="推荐专注时长（分钟）")
    break_minutes: int = Field(default=5, description="推荐休息时长（分钟）")
    reason: str = Field(default="", description="推荐理由")
    source: str = Field(
        default="ai", description="推荐来源：ai/local_rule"
    )
    model: str = Field(default="", description="使用的模型名称")
    tokens_used: int = Field(default=0, description="消耗的 token 数")
    latency_ms: int = Field(default=0, description="请求耗时（毫秒）")


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/recommend-duration",
    response_model=DurationConfig,
    summary="推荐番茄钟时长",
)
async def recommend_duration(
    request: Request, body: RecommendRequest
) -> DurationConfig:
    """
    根据用户历史专注数据推荐个性化番茄钟时长

    - 使用 DeepSeek deepseek-chat 模型
    - 分析历史专注模式，给出时长建议
    - AI 不可用时降级为本地规则引擎
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "番茄钟推荐请求: user=%s, history_count=%d, mode=%s",
        user_id, len(body.history), body.mode,
    )

    # 将历史记录转为 dict 列表供 chain 使用
    history_dicts = [h.model_dump() for h in body.history]

    # 通过 fallback 链自动选择 Provider 并在失败时重试/降级
    async def _run_chain(provider, model_name):
        chain = RecommendChain(provider=provider, model=model_name)
        return await chain.run(history=history_dicts, mode=body.mode)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "recommend", request, _run_chain
        )

        logger.info("番茄钟推荐完成: provider=%s", used_provider)

        return DurationConfig(
            recommended_minutes=result.get("recommended_minutes", 25),
            break_minutes=result.get("break_minutes", 5),
            reason=result.get("reason", "基于您的专注历史分析"),
            source=result.get("source", "ai"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )

    except RuntimeError as e:
        # 所有 Provider 均不可用，降级为本地规则引擎
        logger.warning("番茄钟推荐服务全部不可用，使用本地规则引擎: %s", str(e))
        fallback_result = FallbackProvider.recommend_duration_fallback(history_dicts)
        return DurationConfig(
            recommended_minutes=fallback_result["recommended_minutes"],
            break_minutes=5,
            reason=fallback_result["reason"],
            source=fallback_result["source"],
            model="local_rule",
            tokens_used=0,
            latency_ms=0,
        )
