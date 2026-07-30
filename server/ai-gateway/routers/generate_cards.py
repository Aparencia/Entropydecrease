"""
熵减 AI 网关 — 闪卡生成路由

POST /api/v1/ai/generate-cards
调用通义千问从学习笔记中提取知识点，生成问答闪卡（JSON Mode）。

@ai-context: 闪卡生成路由：从笔记抽取问答对生成闪卡（JSON Mode），经 fallback 链。
"""

import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.card_gen_chain import CardGenChain
from chains.optimize_card_chain import OptimizeCardChain
from cache.redis_cache import get_cache
from fastapi import HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["闪卡生成"])


# ============================================================
# 请求/响应模型
# ============================================================


class CardGenOptions(BaseModel):
    """闪卡生成选项"""
    max_cards: int = Field(default=10, description="最大卡片数", ge=1, le=30)
    difficulty: str = Field(default="medium", description="难度：easy/medium/hard")
    card_type: str = Field(
        default="mixed",
        description="卡片类型：question_answer/fill_blank/true_false/mixed",
    )


class CardGenRequest(BaseModel):
    """闪卡生成请求"""
    note: str = Field(..., description="学习笔记内容", min_length=20)
    options: CardGenOptions = Field(default_factory=CardGenOptions)


class FlashCard(BaseModel):
    """单张闪卡"""
    front: str = Field(..., description="卡片正面（问题/提示）")
    back: str = Field(..., description="卡片背面（答案）")
    type: str = Field(default="question_answer", description="卡片类型")
    confidence: float = Field(default=0.8, description="提取置信度", ge=0.0, le=1.0)


class CardGenResponse(BaseModel):
    """闪卡生成响应"""
    cards: list[FlashCard] = Field(..., description="生成的闪卡列表")
    total_extracted: int = Field(..., description="提取的知识点总数")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


@router.post("/generate-cards", response_model=CardGenResponse, summary="生成问答闪卡")
async def generate_cards(request: Request, body: CardGenRequest) -> CardGenResponse:
    """
    从学习笔记中提取核心知识点，生成问答闪卡

    - 使用通义千问 qwen-plus 模型 + JSON Mode
    - 支持多种卡片类型：问答、填空、判断
    - 难度可配置
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("闪卡生成请求: user=%s, note_length=%d", user_id, len(body.note))

    # 生成 AI 响应缓存键（基于输入笔记 + 选项）
    options_str = str(body.options.model_dump())
    cache_key = hashlib.sha256((body.note + options_str).encode()).hexdigest()

    # 获取用户自带的 API Key（有 Key 时跳过缓存，确保使用用户自己的 Provider）
    user_api_key = getattr(request.state, "user_api_key", None)

    # 检查 Redis AI 响应缓存
    cache = get_cache()
    if cache._client is not None and not user_api_key:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("闪卡生成缓存命中: user=%s", user_id)
            cached_cards = cached.get("cards", [])
            return CardGenResponse(
                cards=[FlashCard(**card) for card in cached_cards],
                total_extracted=cached.get("total_extracted", len(cached_cards)),
                model=cached.get("model", "unknown"),
                tokens_used=cached.get("tokens_used", 0),
            )

    # 通过 fallback 链自动选择 Provider 并在失败时重试/降级
    async def _run_chain(provider, model_name):
        chain = CardGenChain(provider=provider, model=model_name)
        return await chain.run(
            note=body.note,
            options=body.options.model_dump(),
        )

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "generate_cards", request, _run_chain
        )

        cards_data = chain_result.get("cards", [])
        total_extracted = chain_result.get("total_extracted", len(cards_data))
        model_used = chain_result.get("model", "unknown")
        tokens_used = chain_result.get("tokens_used", 0)

        logger.info("闪卡生成完成: provider=%s, cards=%d", used_provider, len(cards_data))

    except RuntimeError as e:
        logger.error("闪卡生成服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    # 缓存成功结果（Redis 可用时）
    if cache._client is not None:
        await cache.set_ai_cache(cache_key, chain_result, expire=3600)

    cards = [FlashCard(**card) for card in cards_data]

    return CardGenResponse(
        cards=cards,
        total_extracted=total_extracted,
        model=model_used,
        tokens_used=tokens_used,
    )


# ============================================================
# 闪卡优化
# ============================================================


class OptimizeCardRequest(BaseModel):
    """闪卡优化请求"""
    front: str = Field(..., min_length=1, description="当前卡片正面内容")
    back: str = Field(..., min_length=1, description="当前卡片背面内容")


class OptimizeCardResult(BaseModel):
    """闪卡优化响应"""
    suggested_front: str = Field(..., description="优化后的正面内容")
    suggested_back: str = Field(..., description="优化后的背面内容")
    improvements: list[str] = Field(default_factory=list, description="改进说明列表")
    model: str
    tokens_used: int
    latency_ms: int


@router.post("/optimize-card", response_model=OptimizeCardResult, summary="优化闪卡内容")
async def optimize_card(request: Request, body: OptimizeCardRequest) -> OptimizeCardResult:
    """
    为现有闪卡生成更清晰的正面/反面表述建议

    - 分析当前卡片内容的清晰度
    - 生成更简洁、更易记忆的表述
    - 提供改进说明
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("闪卡优化请求: user=%s, front_length=%d, back_length=%d",
                user_id, len(body.front), len(body.back))

    async def _run_chain(provider, model_name):
        chain = OptimizeCardChain(provider=provider, model=model_name)
        return await chain.run(front=body.front, back=body.back)

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "optimize_card", request, _run_chain
        )

        logger.info("闪卡优化完成: provider=%s", used_provider)

    except RuntimeError as e:
        logger.error("闪卡优化服务全部不可用: %s", str(e))
        # 降级：返回原始内容 + 提示
        return OptimizeCardResult(
            suggested_front=body.front,
            suggested_back=body.back,
            improvements=["AI 服务暂不可用，已保留原始内容"],
            model="fallback",
            tokens_used=0,
            latency_ms=0,
        )

    return OptimizeCardResult(
        suggested_front=chain_result.get("suggested_front", body.front),
        suggested_back=chain_result.get("suggested_back", body.back),
        improvements=chain_result.get("improvements", []),
        model=chain_result.get("model", "unknown"),
        tokens_used=chain_result.get("tokens_used", 0),
        latency_ms=chain_result.get("latency_ms", 0),
    )
