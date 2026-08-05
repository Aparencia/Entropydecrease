"""
熵减 AI 网关 —— 微学习卡片流路由

POST /api/v1/ai/micro-card
调用 MicroCardChain 将复杂知识拆解为 30 秒可消化的微学习卡片流
（front 自包含 / back 补充 / tags / difficulty 1-5）。

@ai-context: 微学习卡片流（Phase4）路由——输入复杂知识文本，输出卡片流；
复用 call_with_fallback_for_request 降级链与并发 Semaphore；
LLM 输出逐项校验+过滤（缺字段项丢弃而非 pydantic 500）。
"""
import logging
from typing import Any
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.micro_card_chain import MicroCardChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["微学习卡片流"])


# ============================================================
# 请求/响应模型
# ============================================================


class MicroCardRequest(BaseModel):
    """微学习卡片流请求"""
    content: str = Field(..., description="复杂知识文本", min_length=1, max_length=20000)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("内容不能为空白")
        return v


class MicroCardItem(BaseModel):
    """单张微学习卡片"""
    id: str = Field(..., description="卡片 ID")
    front: str = Field(..., description="正面：30 秒可消化的自包含知识块")
    back: str = Field(..., description="背面：补充解释/例子/记忆钩子")
    tags: list[str] = Field(default_factory=list, description="主题标签")
    difficulty: int = Field(default=3, description="难度 1-5（1=入门，5=进阶）")


class MicroCardResponse(BaseModel):
    """微学习卡片流响应"""
    cards: list[MicroCardItem] = Field(default_factory=list, description="微学习卡片列表")
    total_cards: int = Field(default=0, description="卡片总数")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


def _filter_cards(items: Any) -> list[MicroCardItem]:
    """校验卡片项：front/back 缺一不可，difficulty 归一为 1-5 整数（LLM 输出质量问题）"""
    result: list[MicroCardItem] = []
    if not isinstance(items, list):
        return result
    seq = 0  # 清洗后保留卡片的序号（缺 id 时按此编号）
    for item in items:
        if not isinstance(item, dict):
            continue
        front = str(item.get("front", "")).strip()
        back = str(item.get("back", "")).strip()
        if not front or not back:
            continue
        seq += 1
        card_id = str(item.get("id", "")).strip() or f"card-{seq}"
        tags = item.get("tags", [])
        if not isinstance(tags, list):
            tags = []
        tags = [str(t) for t in tags if isinstance(t, str) and t.strip()]
        try:
            difficulty = int(item.get("difficulty", 3))
        except (TypeError, ValueError):
            difficulty = 3
        difficulty = max(1, min(5, difficulty))
        result.append(MicroCardItem(
            id=card_id, front=front, back=back, tags=tags, difficulty=difficulty,
        ))
    return result


@router.post("/micro-card", response_model=MicroCardResponse, summary="拆解复杂知识为微学习卡片流")
async def micro_card(request: Request, body: MicroCardRequest) -> MicroCardResponse:
    """
    将复杂知识拆解为 30 秒可消化的微学习卡片流（front 自包含，无需上下文）
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("微学习卡片流请求: user=%s, content_len=%d", user_id, len(body.content))

    async def _run_chain(provider, model_name):
        chain = MicroCardChain(provider=provider, model=model_name)
        return await chain.run(content=body.content)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "micro_card", request, _run_chain
        )
        cards = _filter_cards(result.get("cards", []))
        response = MicroCardResponse(
            cards=cards,
            total_cards=len(cards),  # 以实际清洗后的卡片数为准
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("微学习卡片流完成: provider=%s, cards=%d", used_provider, len(cards))
    except RuntimeError as e:
        logger.warning("微学习卡片流服务不可用，降级响应: %s", str(e))
        response = MicroCardResponse(
            cards=[],
            total_cards=0,
            status="fallback",
            model="local_rule",
        )
    return response
