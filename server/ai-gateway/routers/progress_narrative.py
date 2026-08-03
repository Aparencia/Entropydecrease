"""
熵减 AI 网关 — 微进展叙述路由（A3）

POST /api/v1/ai/progress-narrative
  将客户端聚合的本周学习统计快照转化为温暖的微进展叙述

@ai-context: A3 micro-progress narrator router. Input is a client-side
aggregated stats snapshot (local-first: gateway never sees raw data);
returns degraded response when all providers fail so the client can
fall back to its offline template.
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.progress_narrative_chain import ProgressNarrativeChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["微进展叙述"])


class ProgressNarrativeRequest(BaseModel):
    """微进展叙述请求"""
    stats_text: str = Field(
        ..., description="客户端聚合的本周学习统计文本（含环比）", min_length=1,
    )


class ProgressNarrativeResult(BaseModel):
    """微进展叙述结果"""
    narrative: str = Field(..., description="叙述文本（可空表示降级）")
    status: str = Field(..., description="success / degraded")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")


@router.post(
    "/progress-narrative",
    response_model=ProgressNarrativeResult,
    summary="生成微进展叙述",
)
async def progress_narrative(
    request: Request, body: ProgressNarrativeRequest
) -> ProgressNarrativeResult:
    """
    把本周学习统计写成一句温暖、具体的进展叙述。

    - 每周一次的主动触发（客户端控制节奏）
    - 服务不可用时返回 status=degraded，客户端回退离线模板
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "微进展叙述请求: user=%s, stats_length=%d",
        user_id, len(body.stats_text),
    )

    async def _run_chain(provider, model_name):
        chain = ProgressNarrativeChain(provider=provider, model=model_name)
        return await chain.run(stats_text=body.stats_text)

    try:
        result, used_provider, _is_user_key = await call_with_fallback_for_request(
            request.app, "progress_narrative", request, _run_chain
        )
        response = ProgressNarrativeResult(
            narrative=result.get("narrative", ""),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("微进展叙述完成: provider=%s, status=%s", used_provider, response.status)

    except RuntimeError as e:
        logger.warning("微进展叙述服务全部不可用，返回降级响应: %s", str(e))
        response = ProgressNarrativeResult(
            narrative="",
            status="degraded",
            model="fallback",
            tokens_used=0,
            latency_ms=0,
        )

    return response
