"""
熵减 AI 网关 —— AI 辩论对手路由

POST /api/v1/ai/debate
调用 DebateChain 生成辩论论点。

@ai-context: 辩论学习路由——输入主题、类型、立场，输出论点与反论点。
"""

import logging
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.debate_chain import DebateChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["AI 辩论对手"])


# ============================================================
# 请求/响应模型
# ============================================================


class DebateRequest(BaseModel):
    topic: str = Field(..., description="辩论主题", min_length=1, max_length=500)
    debate_type: str = Field(default="academic", description="辩论类型：academic/policy/value/philosophy")
    stance: str = Field(default="", description="用户立场", max_length=500)
    history: list[dict[str, str]] = Field(default_factory=list, description="辩论历史", max_length=50)

    @field_validator("topic")
    @classmethod
    def topic_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("主题不能为空白")
        return v.strip()

    @field_validator("debate_type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in ("academic", "policy", "value", "philosophy"):
            raise ValueError("无效的辩论类型，可选：academic/policy/value/philosophy")
        return v


class DebateResponse(BaseModel):
    argument: str = Field(..., description="核心论点")
    counter_argument: str = Field(..., description="反论点")
    evidence_quality: str = Field(..., description="证据质量：high/medium/low")
    challenge: str = Field(default="", description="挑战性问题")
    round_number: int = Field(..., description="当前辩论轮次")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/debate", response_model=DebateResponse, summary="AI 辩论对手")
async def debate(request: Request, body: DebateRequest) -> DebateResponse:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("AI 辩论: user=%s, topic=%s, type=%s", user_id, body.topic[:80], body.debate_type)

    async def _run_chain(provider, model_name):
        chain = DebateChain(provider=provider, model=model_name)
        return await chain.run(
            topic=body.topic,
            debate_type=body.debate_type,
            stance=body.stance,
            history=body.history,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "debate", request, _run_chain
        )
        response = DebateResponse(
            argument=result.get("argument", ""),
            counter_argument=result.get("counter_argument", ""),
            evidence_quality=result.get("evidence_quality", "medium"),
            challenge=result.get("challenge", ""),
            round_number=result.get("round_number", 1),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("AI 辩论完成: provider=%s, round=%d", used_provider, response.round_number)
    except RuntimeError as e:
        logger.warning("AI 辩论服务不可用，降级响应: %s", str(e))
        response = DebateResponse(
            argument="让我们从基本假设开始讨论。",
            counter_argument="我们可以从不同角度审视这个问题。",
            evidence_quality="medium",
            challenge="你能用一个具体的例子支撑你的立场吗？",
            round_number=1,
            status="fallback",
            model="local_rule",
        )
    return response