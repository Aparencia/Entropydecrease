"""
熵减 AI 网关 —— 概念预检路由（E1 错误概念先破后立）

POST /api/v1/ai/concept-precheck
调用 ConceptPrecheckChain 为费曼讲解前生成 1-2 个探测性问题。

@ai-context: 概念预检路由——输入目标概念 + 历史薄弱点摘要，输出探测问题；
复用 call_with_fallback_for_request 降级链与 Redis 缓存。
"""
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.concept_precheck_chain import ConceptPrecheckChain
from cache.redis_cache import get_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["概念预检"])


# ============================================================
# 请求/响应模型
# ============================================================


class ConceptPrecheckRequest(BaseModel):
    """概念预检请求"""
    concept: str = Field(..., description="目标概念名称")
    weakHistory: str = Field(default="", description="历史薄弱点/错题摘要（前端截断，可为空）")


class PrecheckQuestion(BaseModel):
    """单个探测性问题"""
    question: str = Field(..., description="探测性问题")
    intent: str = Field(default="", description="想暴露的错误认知或误解")


class ConceptPrecheckResponse(BaseModel):
    """概念预检响应"""
    questions: list[PrecheckQuestion] = Field(..., description="探测性问题列表（1-2 条，可能为空）")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


@router.post("/concept-precheck", response_model=ConceptPrecheckResponse, summary="概念预检")
async def concept_precheck(request: Request, body: ConceptPrecheckRequest) -> ConceptPrecheckResponse:
    """
    为费曼讲解前生成错误概念探测问题

    - 使用通义千问 qwen-plus 模型 + JSON Mode
    - 返回空列表时前端静默跳过预检（可选增强）
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    if not body.concept.strip():
        raise HTTPException(status_code=400, detail="概念不能为空")
    logger.info(
        "概念预检请求: user=%s, concept=%s, weak_len=%d",
        user_id, body.concept[:50], len(body.weakHistory),
    )

    cache_key = hashlib.sha256(
        ("precheck:" + body.concept[:500] + body.weakHistory[:1000]).encode()
    ).hexdigest()

    cache = get_cache()
    if cache._client is not None:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("概念预检缓存命中: user=%s", user_id)
            return ConceptPrecheckResponse(**cached)

    async def _run_chain(provider, model_name):
        chain = ConceptPrecheckChain(provider=provider, model=model_name)
        return await chain.run(
            concept=body.concept,
            weak_history=body.weakHistory,
        )

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "concept_precheck", request, _run_chain
        )

        questions_data = chain_result.get("questions", [])
        logger.info("概念预检完成: provider=%s, questions=%d", used_provider, len(questions_data))

    except RuntimeError as e:
        logger.error("概念预检服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    # 仅缓存有效结果：fallback 空结果入缓存会导致 AI 恢复后 1 小时内持续静默失效
    if cache._client is not None and chain_result.get("model") != "fallback":
        await cache.set_ai_cache(cache_key, chain_result, expire=3600)

    return ConceptPrecheckResponse(
        questions=[PrecheckQuestion(**q) for q in questions_data],
        model=chain_result.get("model", "unknown"),
        tokens_used=chain_result.get("tokens_used", 0),
    )
