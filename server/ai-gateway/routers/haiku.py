"""
熵减 AI 网关 —— 学习俳句路由

POST /api/v1/ai/haiku
调用 HaikuChain 生成每日学习俳句（5-7-5，反思性写作 + 正念）。

@ai-context: 学习俳句（R6）路由——输入近期学习摘要，输出俳句/翻译/反思/情绪；
复用 call_with_fallback_for_request 降级链与并发 Semaphore。
"""
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.haiku_chain import HaikuChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["学习俳句"])


# ============================================================
# 请求/响应模型
# ============================================================


class HaikuRequest(BaseModel):
    """学习俳句请求"""
    summary: str = Field(default="", description="近期学习摘要（概念/错误/成就），可留空", max_length=2000)


class HaikuResponse(BaseModel):
    """学习俳句响应"""
    haiku: str = Field(..., description="5-7-5 俳句（三行用 / 分隔）")
    translation: str = Field(default="", description="白话翻译")
    reflection: str = Field(default="", description="学习感悟")
    mood: str = Field(default="reflective", description="情绪标签：calm/joyful/reflective/determined/tired/curious")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/haiku", response_model=HaikuResponse, summary="生成每日学习俳句")
async def haiku(request: Request, body: HaikuRequest) -> HaikuResponse:
    """
    基于近期学习摘要生成 5-7-5 学习俳句（每日俳句）
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("学习俳句: user=%s, summary=%s", user_id, body.summary[:50])

    async def _run_chain(provider, model_name):
        chain = HaikuChain(provider=provider, model=model_name)
        return await chain.run(summary=body.summary)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "haiku", request, _run_chain
        )
        response = HaikuResponse(
            haiku=result.get("haiku", ""),
            translation=result.get("translation", ""),
            reflection=result.get("reflection", ""),
            mood=result.get("mood", "reflective"),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("学习俳句完成: provider=%s, haiku=%s", used_provider, response.haiku[:30])
    except RuntimeError as e:
        logger.warning("学习俳句服务不可用，降级响应: %s", str(e))
        response = HaikuResponse(
            haiku="知识如潮水/一页页翻过心间/记忆沉淀时",
            translation="今天的学习像潮水一样涌来又沉淀，知识在心底留下痕迹",
            reflection="学习是一日日积累的过程",
            mood="reflective",
            status="fallback",
            model="local_rule",
        )
    return response
