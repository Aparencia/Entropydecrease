"""
熵减 AI 网关 —— 内容分层路由（N5 策略性遗忘标记）

POST /api/v1/ai/content-tier
调用 ContentTierChain 将笔记内容分为核心/支撑/细节三层。

@ai-context: 策略性遗忘路由——输入笔记文本，输出三层原文摘录；
复用 call_with_fallback_for_request 降级链与 Redis 缓存。
"""
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.content_tier_chain import ContentTierChain
from cache.redis_cache import get_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["内容分层"])


# ============================================================
# 请求/响应模型
# ============================================================


class ContentTierRequest(BaseModel):
    """内容分层请求"""
    notesText: str = Field(..., description="笔记文本（前端截断至 6000 字内）")


class TierItem(BaseModel):
    """分层条目"""
    text: str = Field(..., description="原文片段摘录")
    reason: str = Field(default="", description="core 层专用：为何是核心")


class ContentTierResponse(BaseModel):
    """内容分层响应"""
    core: list[TierItem] = Field(..., description="核心概念层")
    support: list[TierItem] = Field(..., description="支撑材料层")
    detail: list[TierItem] = Field(..., description="参考细节层")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


@router.post("/content-tier", response_model=ContentTierResponse, summary="笔记内容三层分层")
async def content_tier(request: Request, body: ContentTierRequest) -> ContentTierResponse:
    """
    将笔记内容分为核心概念/支撑材料/参考细节三层

    - 使用通义千问 qwen-plus 模型 + JSON Mode
    - 条目经结构校验，非法条目自动过滤
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    if not body.notesText.strip():
        raise HTTPException(status_code=400, detail="笔记内容不能为空")
    logger.info("内容分层请求: user=%s, text_len=%d", user_id, len(body.notesText))

    cache_key = hashlib.sha256(("tier:" + body.notesText[:3000]).encode()).hexdigest()

    cache = get_cache()
    if cache._client is not None:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("内容分层缓存命中: user=%s", user_id)
            return ContentTierResponse(**cached)

    async def _run_chain(provider, model_name):
        chain = ContentTierChain(provider=provider, model=model_name)
        return await chain.run(notes_text=body.notesText)

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "content_tier", request, _run_chain
        )

        if not chain_result.get("core"):
            raise HTTPException(status_code=502, detail="未能生成有效分层，请稍后重试")

        logger.info(
            "内容分层完成: provider=%s, core=%d, support=%d, detail=%d",
            used_provider, len(chain_result.get("core", [])),
            len(chain_result.get("support", [])), len(chain_result.get("detail", [])),
        )

    except RuntimeError as e:
        logger.error("内容分层服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    # 仅缓存有效结果：fallback 空结果入缓存会导致 AI 恢复后 1 小时内持续静默失效
    if cache._client is not None and chain_result.get("model") != "fallback":
        await cache.set_ai_cache(cache_key, chain_result, expire=3600)

    return ContentTierResponse(
        core=[TierItem(**item) for item in chain_result.get("core", [])],
        support=[TierItem(**item) for item in chain_result.get("support", [])],
        detail=[TierItem(**item) for item in chain_result.get("detail", [])],
        model=chain_result.get("model", "unknown"),
        tokens_used=chain_result.get("tokens_used", 0),
    )
