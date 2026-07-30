"""
熵减 AI 网关 — 笔记摘要路由

POST /api/v1/ai/summarize
调用通义千问对学习笔记生成结构化摘要。

@ai-context: 笔记摘要路由：对长文本生成摘要，经 fallback 链调用文本模型。
"""

import time
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.summarize_chain import SummarizeChain
from cache.redis_cache import get_cache

from fastapi import HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["笔记摘要"])


# ============================================================
# 请求/响应模型
# ============================================================


class SummarizeOptions(BaseModel):
    """摘要选项"""
    max_length: int = Field(default=200, description="摘要最大字数", ge=50, le=2000)
    style: str = Field(default="bullet", description="摘要风格：bullet/paragraph/outline")
    language: str = Field(default="zh", description="输出语言")


class SummarizeRequest(BaseModel):
    """摘要请求"""
    text: str = Field(..., description="待摘要的笔记内容", min_length=10)
    options: SummarizeOptions = Field(default_factory=SummarizeOptions)


class SummarizeResponse(BaseModel):
    """摘要响应"""
    summary: str = Field(..., description="生成的摘要内容")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")


# ============================================================
# 路由处理
# ============================================================


@router.post("/summarize", response_model=SummarizeResponse, summary="生成笔记摘要")
async def summarize(request: Request, body: SummarizeRequest) -> SummarizeResponse:
    """
    对学习笔记生成结构化摘要

    - 使用通义千问 qwen-plus 模型
    - 支持要点列表、段落、大纲三种风格
    - 字数可配置（默认 200 字）
    """
    start_time = time.monotonic()
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("摘要请求: user=%s, text_length=%d", user_id, len(body.text))

    # 生成 AI 响应缓存键（基于输入文本 + 选项）
    options_str = str(body.options.model_dump())
    cache_key = hashlib.sha256((body.text + options_str).encode()).hexdigest()

    # 获取用户自带的 API Key（有 Key 时跳过缓存，确保使用用户自己的 Provider）
    user_api_key = getattr(request.state, "user_api_key", None)

    # 检查 Redis AI 响应缓存
    cache = get_cache()
    if cache._client is not None and not user_api_key:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("摘要缓存命中: user=%s", user_id)
            return SummarizeResponse(
                summary=cached["content"],
                model=cached.get("model", "unknown"),
                tokens_used=cached.get("tokens_used", 0),
                latency_ms=cached.get("latency_ms", 0),
            )

    # 通过 fallback 链自动选择 Provider 并在失败时重试/降级
    async def _run_chain(provider, model_name):
        chain = SummarizeChain(provider=provider, model=model_name)
        return await chain.run(
            text=body.text,
            options=body.options.model_dump(),
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "summarize", request, _run_chain
        )
    except RuntimeError as e:
        logger.error("摘要服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    latency_ms = result.get("latency_ms", int((time.monotonic() - start_time) * 1000))

    logger.info("摘要完成: provider=%s, model=%s", used_provider, result.get("model", "unknown"))

    # 缓存成功结果（Redis 可用时）
    if cache._client is not None:
        await cache.set_ai_cache(cache_key, result, expire=3600)

    return SummarizeResponse(
        summary=result["content"],
        model=result.get("model", "unknown"),
        tokens_used=result.get("tokens_used", 0),
        latency_ms=latency_ms,
    )
