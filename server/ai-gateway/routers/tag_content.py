"""
熵减 AI 网关 — 内容打标路由

POST /api/v1/ai/tag-content
对灵感/笔记内容进行三维度自动打标。

@ai-context: 内容打标路由：为笔记/灵感自动生成分类标签。
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.tag_content_chain import TagContentChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["内容打标"])


# ============================================================
# 请求/响应模型
# ============================================================


class TagContentRequest(BaseModel):
    """内容打标请求"""
    content: str = Field(..., description="待打标的文本内容", min_length=1, max_length=5000)


class TagContentResult(BaseModel):
    """内容打标结果"""
    content_nature: str = Field(..., description="内容性质: concept|question|inspiration|todo")
    cognitive_depth: str = Field(..., description="认知深度: shallow|understanding|application")
    subject: str = Field(..., description="学科领域")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/tag-content",
    response_model=TagContentResult,
    summary="内容三维度打标",
)
async def tag_content(
    request: Request, body: TagContentRequest
) -> TagContentResult:
    """
    对灵感/笔记内容进行三维度自动打标

    - content_nature: 概念(concept) / 疑问(question) / 灵感(inspiration) / 待办(todo)
    - cognitive_depth: 浅层(shallow) / 理解(understanding) / 应用(application)
    - subject: 自动识别学科领域
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "内容打标请求: user=%s, content_length=%d",
        user_id, len(body.content),
    )

    async def _run_chain(provider, model_name):
        chain = TagContentChain(provider=provider, model=model_name)
        return await chain.run(content=body.content)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "tag_content", request, _run_chain
        )

        tag_result = TagContentResult(
            content_nature=result.get("content_nature", "inspiration"),
            cognitive_depth=result.get("cognitive_depth", "shallow"),
            subject=result.get("subject", "未分类"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )

        logger.info("内容打标完成: provider=%s, tags=%s/%s/%s",
                     used_provider, tag_result.content_nature,
                     tag_result.cognitive_depth, tag_result.subject)

    except RuntimeError as e:
        # 所有 Provider 均不可用，返回降级标签
        logger.warning("内容打标服务全部不可用，使用降级响应: %s", str(e))
        tag_result = TagContentResult(
            content_nature="inspiration",
            cognitive_depth="shallow",
            subject="未分类",
            model="fallback",
            tokens_used=0,
            latency_ms=0,
        )

    return tag_result
