"""
熵减 AI 网关 —— 概念冲突检测路由（N6）

POST /api/v1/ai/conflict-detect
调用 ConflictDetectChain 比对新笔记与历史理解之间的矛盾冲突。

@ai-context: 错误概念转变路由——输入新笔记 + 历史文本，输出冲突列表；
复用 call_with_fallback_for_request 降级链与 Redis 缓存。
"""
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.conflict_detect_chain import ConflictDetectChain
from cache.redis_cache import get_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["概念冲突检测"])


# ============================================================
# 请求/响应模型
# ============================================================


class ConflictDetectRequest(BaseModel):
    """概念冲突检测请求"""
    newNoteText: str = Field(..., description="新笔记文本（前端截断至 3000 字内）")
    historyText: str = Field(..., description="历史理解文本：旧笔记/费曼讲解摘录")


class ConflictItem(BaseModel):
    """单条概念冲突"""
    old_claim: str = Field(..., description="历史理解中的矛盾表述")
    new_claim: str = Field(..., description="新笔记中的矛盾表述")
    topic: str = Field(default="", description="冲突涉及的概念主题")
    suggestion: str = Field(default="", description="先破后立的修正建议")


class ConflictDetectResponse(BaseModel):
    """概念冲突检测响应"""
    conflicts: list[ConflictItem] = Field(..., description="冲突列表（可能为空）")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


@router.post("/conflict-detect", response_model=ConflictDetectResponse, summary="概念冲突检测")
async def conflict_detect(request: Request, body: ConflictDetectRequest) -> ConflictDetectResponse:
    """
    比对新笔记与历史理解之间的概念冲突

    - 使用通义千问 qwen-plus 模型 + JSON Mode
    - 无冲突属正常结果（返回空列表），不视为错误
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    if not body.newNoteText.strip():
        raise HTTPException(status_code=400, detail="新笔记内容不能为空")
    if not body.historyText.strip():
        raise HTTPException(status_code=400, detail="历史理解内容不能为空")
    logger.info(
        "概念冲突检测请求: user=%s, new_len=%d, history_len=%d",
        user_id, len(body.newNoteText), len(body.historyText),
    )

    cache_key = hashlib.sha256(
        ("conflict:" + body.newNoteText[:2000] + body.historyText[:2000]).encode()
    ).hexdigest()

    cache = get_cache()
    if cache._client is not None:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("概念冲突检测缓存命中: user=%s", user_id)
            return ConflictDetectResponse(**cached)

    async def _run_chain(provider, model_name):
        chain = ConflictDetectChain(provider=provider, model=model_name)
        return await chain.run(
            new_note_text=body.newNoteText,
            history_text=body.historyText,
        )

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "conflict_detect", request, _run_chain
        )

        conflicts_data = chain_result.get("conflicts", [])
        logger.info("概念冲突检测完成: provider=%s, conflicts=%d", used_provider, len(conflicts_data))

    except RuntimeError as e:
        logger.error("概念冲突检测服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    if cache._client is not None:
        await cache.set_ai_cache(cache_key, chain_result, expire=3600)

    return ConflictDetectResponse(
        conflicts=[ConflictItem(**c) for c in conflicts_data],
        model=chain_result.get("model", "unknown"),
        tokens_used=chain_result.get("tokens_used", 0),
    )
