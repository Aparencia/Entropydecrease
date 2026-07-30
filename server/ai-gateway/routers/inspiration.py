"""
熵减 AI 网关 — 灵感分拣路由

POST /api/v1/ai/sort-inspiration
分析灵感/笔记内容，推荐最适合的归类目标（feynman/flashcard/note/todo）。

@ai-context: 灵感排序路由：对灵感条目做智能排序/打分。
"""

import logging
from typing import Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.sort_inspiration_chain import SortInspirationChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["灵感分拣"])


# ============================================================
# 请求/响应模型
# ============================================================


class SortInspirationRequest(BaseModel):
    """灵感分拣请求"""
    content: str = Field(..., description="待分析的灵感文本内容", min_length=1, max_length=5000)
    existing_tags: Optional[dict[str, str]] = Field(
        default=None, description="已有的标签信息，辅助判断"
    )


class SortSuggestionItem(BaseModel):
    """单条分拣建议"""
    category: str = Field(..., description="归类目标: feynman|flashcard|note|todo|action_item")
    confidence: float = Field(..., description="置信度 0.0-1.0")
    reason: str = Field(..., description="推荐理由")
    suggestedAction: str = Field(default="", description="推荐的后续操作")


class SortInspirationResult(BaseModel):
    """灵感分拣结果"""
    suggestions: list[SortSuggestionItem] = Field(..., description="归类建议列表（1-5 个）")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")
    status: str = Field(default="success", description="状态")


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/sort-inspiration",
    response_model=SortInspirationResult,
    summary="灵感内容智能分拣",
)
async def sort_inspiration(
    request: Request, body: SortInspirationRequest
) -> SortInspirationResult:
    """
    分析灵感/笔记内容，推荐最适合的归类目标

    - feynman: 适合做费曼讲解练习的概念
    - flashcard: 适合制作闪卡的知识点
    - note: 适合整理为正式笔记
    - todo: 包含行动计划或待办事项
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "灵感分拣请求: user=%s, content_length=%d, has_tags=%s",
        user_id, len(body.content), body.existing_tags is not None,
    )

    async def _run_chain(provider, model_name):
        chain = SortInspirationChain(provider=provider, model=model_name)
        return await chain.run(
            content=body.content,
            existing_tags=body.existing_tags,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "sort_inspiration", request, _run_chain
        )

        suggestions = [
            SortSuggestionItem(
                category=s.get("category", "note"),
                confidence=s.get("confidence", 0.5),
                reason=s.get("reason", ""),
                suggestedAction=s.get("suggestedAction", ""),
            )
            for s in result.get("suggestions", [])
        ]

        sort_result = SortInspirationResult(
            suggestions=suggestions,
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
            status=result.get("status", "success"),
        )

        logger.info(
            "灵感分拣完成: provider=%s, suggestions_count=%d",
            used_provider, len(sort_result.suggestions),
        )

    except RuntimeError as e:
        # 所有 Provider 均不可用，返回降级建议
        logger.warning("灵感分拣服务全部不可用，使用降级响应: %s", str(e))
        sort_result = SortInspirationResult(
            suggestions=[
                SortSuggestionItem(
                    category="note",
                    confidence=0.5,
                    reason="服务暂时不可用，建议先整理为笔记",
                    suggestedAction="整理为笔记",
                )
            ],
            model="fallback",
            tokens_used=0,
            latency_ms=0,
            status="error",
        )

    return sort_result
