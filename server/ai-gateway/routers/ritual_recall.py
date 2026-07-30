"""
熵减 AI 网关 — 仪式回顾小问路由

POST /api/v1/ai/ritual-recall
  基于上次学习笔记生成 1 个"10 秒可答"的回顾小问 + 参考要点

@ai-context: 仪式回顾小问路由：服务学习启动仪式回顾步骤（RIT-08）；
服务全部不可用时返回降级响应，前端据 status 无缝回退遮罩摘要基线。
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.ritual_recall_chain import RitualRecallChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["仪式回顾小问"])


class RitualRecallRequest(BaseModel):
    """仪式回顾小问请求"""
    title: str = Field(default="", description="上次笔记标题")
    content: str = Field(..., description="上次笔记内容/摘要", min_length=1)


class RitualRecallResult(BaseModel):
    """仪式回顾小问结果"""
    question: str = Field(..., description="回顾小问（可空表示降级）")
    reference: str = Field(default="", description="参考要点")
    status: str = Field(..., description="success / degraded")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")


@router.post(
    "/ritual-recall",
    response_model=RitualRecallResult,
    summary="生成仪式回顾小问",
)
async def ritual_recall(
    request: Request, body: RitualRecallRequest
) -> RitualRecallResult:
    """
    基于上次笔记生成 1 个 10 秒可答的回顾小问。

    - 服务学习启动仪式的回顾闪回步骤
    - 服务不可用时返回 status=degraded，前端回退遮罩摘要
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "仪式回顾小问请求: user=%s, title=%s, content_length=%d",
        user_id, body.title, len(body.content),
    )

    async def _run_chain(provider, model_name):
        chain = RitualRecallChain(provider=provider, model=model_name)
        return await chain.run(content=body.content, title=body.title)

    try:
        result, used_provider, _is_user_key = await call_with_fallback_for_request(
            request.app, "ritual_recall", request, _run_chain
        )
        response = RitualRecallResult(
            question=result.get("question", ""),
            reference=result.get("reference", ""),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("仪式回顾小问完成: provider=%s, status=%s", used_provider, response.status)

    except RuntimeError as e:
        logger.warning("仪式回顾小问服务全部不可用，返回降级响应: %s", str(e))
        response = RitualRecallResult(
            question="",
            reference="",
            status="degraded",
            model="fallback",
            tokens_used=0,
            latency_ms=0,
        )

    return response
