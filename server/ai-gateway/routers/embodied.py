"""
熵减 AI 网关 —— 概念具身化路由

POST /api/v1/ai/embodied
调用 EmbodiedChain 为抽象概念生成身体动作建议（具身认知）。

@ai-context: 概念具身化（W6）路由——输入概念，输出动作建议列表与整体建议；
复用 call_with_fallback_for_request 降级链与并发 Semaphore。
"""
import logging
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.embodied_chain import EmbodiedChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["概念具身化"])


# ============================================================
# 请求/响应模型
# ============================================================


class EmbodiedRequest(BaseModel):
    """概念具身化请求"""
    concept: str = Field(..., description="要具身化的抽象概念", min_length=1, max_length=200)

    @field_validator("concept")
    @classmethod
    def concept_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("概念不能为空白")
        return v.strip()


class ActionItem(BaseModel):
    """单个身体动作建议"""
    gesture: str = Field(..., description="动作名称")
    description: str = Field(default="", description="动作描述（怎么做）")
    meaning: str = Field(default="", description="概念含义（该动作表达概念的什么）")
    difficulty: str = Field(default="easy", description="难度：easy/medium/hard")

    @field_validator("difficulty")
    @classmethod
    def difficulty_enum(cls, v: str) -> str:
        if v not in ("easy", "medium", "hard"):
            return "easy"  # 纵深防御：chain 层已过滤，非法值兜底
        return v


class EmbodiedResponse(BaseModel):
    """概念具身化响应"""
    actions: list[ActionItem] = Field(default_factory=list, description="动作建议列表")
    suggestion: str = Field(default="", description="整体建议")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/embodied", response_model=EmbodiedResponse, summary="概念具身化动作建议")
async def embodied(request: Request, body: EmbodiedRequest) -> EmbodiedResponse:
    """
    为抽象概念生成身体动作建议（如"力矩"→用手臂模拟杠杆）
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("概念具身化: user=%s, concept=%s", user_id, body.concept[:50])

    async def _run_chain(provider, model_name):
        chain = EmbodiedChain(provider=provider, model=model_name)
        return await chain.run(concept=body.concept)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "embodied", request, _run_chain
        )
        response = EmbodiedResponse(
            actions=[
                ActionItem(
                    gesture=ac.get("gesture", ""),
                    description=ac.get("description", ""),
                    meaning=ac.get("meaning", ""),
                    difficulty=ac.get("difficulty", "easy"),
                )
                for ac in result.get("actions", [])
            ],
            suggestion=result.get("suggestion", ""),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("概念具身化完成: provider=%s, actions=%d", used_provider, len(response.actions))
    except RuntimeError as e:
        logger.warning("概念具身化服务不可用，降级响应: %s", str(e))
        response = EmbodiedResponse(
            actions=[
                ActionItem(
                    gesture="双手比划",
                    description="用双手在身前比划出概念的核心结构，先慢后快重复三遍",
                    meaning="通过空间手势建立概念的身体表征",
                    difficulty="easy",
                ),
            ],
            suggestion="把动作融入费曼讲解：每次说到这个概念时都做一遍对应手势，加深记忆",
            status="fallback",
            model="local_rule",
        )
    return response
