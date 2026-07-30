"""
熵减 AI 网关 — AI 草稿生成路由（v1.1.0）

POST /api/v1/ai/inspiration-draft
将灵感/零散想法转化为结构化学习材料草稿（flashcard/feynman/note）

@ai-context: 灵感草稿路由（v1.1.0）：由灵感片段生成结构化草稿。
"""

import logging
from typing import Any, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.inspiration_draft_chain import InspirationDraftChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["AI 草稿"])


# ============================================================
# 请求/响应模型
# ============================================================


class InspirationDraftRequest(BaseModel):
    """AI 草稿请求"""
    content: str = Field(..., description="灵感内容", min_length=1, max_length=5000)
    target_type: str = Field(
        default="note",
        description="目标类型: flashcard/feynman/note",
    )


class FlashcardDraft(BaseModel):
    """闪卡草稿"""
    front: str = Field(..., description="问题")
    back: str = Field(..., description="答案")
    type: str = Field(default="question_answer", description="卡片类型")
    confidence: float = Field(default=0.8, description="置信度")


class FeynmanDraft(BaseModel):
    """费曼讲解草稿"""
    concept: str = Field(default="", description="核心概念")
    simple_explanation: str = Field(default="", description="通俗解释")
    analogy: str = Field(default="", description="生活类比")
    test_question: str = Field(default="", description="检验追问")


class NoteDraft(BaseModel):
    """笔记草稿"""
    title: str = Field(default="", description="笔记标题")
    key_points: list[str] = Field(default_factory=list, description="核心要点")
    summary: str = Field(default="", description="一句话总结")


class InspirationDraftResult(BaseModel):
    """AI 草稿结果"""
    draft_type: str = Field(default="note", description="草稿类型")
    cards: Optional[list[FlashcardDraft]] = Field(default=None, description="闪卡草稿")
    feynman: Optional[FeynmanDraft] = Field(default=None, description="费曼草稿")
    note: Optional[NoteDraft] = Field(default=None, description="笔记草稿")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/inspiration-draft",
    response_model=InspirationDraftResult,
    summary="AI 草稿生成（v1.1.0）",
)
async def inspiration_draft(
    request: Request, body: InspirationDraftRequest
) -> InspirationDraftResult:
    """
    将灵感内容转化为结构化学习材料草稿

    支持三种目标类型：
    - flashcard: 闪卡草稿（2-3 张问答闪卡）
    - feynman: 费曼讲解草稿（概念 + 通俗解释 + 类比 + 追问）
    - note: 笔记草稿（标题 + 要点 + 总结）
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "AI 草稿请求: user=%s, target_type=%s, content_length=%d",
        user_id, body.target_type, len(body.content),
    )

    async def _run_chain(provider, model_name):
        chain = InspirationDraftChain(provider=provider, model=model_name)
        return await chain.run(
            content=body.content,
            target_type=body.target_type,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "inspiration_draft", request, _run_chain
        )
        draft = result.get("draft", {})
        draft_type = draft.get("type", body.target_type) if draft else body.target_type

        response = _build_draft_response(draft, draft_type, result)
        logger.info("AI 草稿完成: provider=%s, type=%s", used_provider, draft_type)
    except RuntimeError as e:
        logger.warning("AI 草稿服务不可用，降级响应: %s", str(e))
        response = InspirationDraftResult(
            draft_type=body.target_type,
            status="error",
            model="fallback",
        )

    return response


def _build_draft_response(
    draft: dict[str, Any], draft_type: str, result: dict[str, Any]
) -> InspirationDraftResult:
    """根据草稿类型构建响应"""
    cards = None
    feynman = None
    note = None

    if draft_type == "flashcard" and draft:
        cards = [
            FlashcardDraft(
                front=c.get("front", ""),
                back=c.get("back", ""),
                type=c.get("type", "question_answer"),
                confidence=c.get("confidence", 0.8),
            )
            for c in draft.get("cards", [])
        ]
    elif draft_type == "feynman" and draft:
        feynman = FeynmanDraft(
            concept=draft.get("concept", ""),
            simple_explanation=draft.get("simple_explanation", ""),
            analogy=draft.get("analogy", ""),
            test_question=draft.get("test_question", ""),
        )
    elif draft_type == "note" and draft:
        note = NoteDraft(
            title=draft.get("title", ""),
            key_points=draft.get("key_points", []),
            summary=draft.get("summary", ""),
        )

    return InspirationDraftResult(
        draft_type=draft_type,
        cards=cards,
        feynman=feynman,
        note=note,
        status=result.get("status", "success"),
        model=result.get("model", "unknown"),
        tokens_used=result.get("tokens_used", 0),
        latency_ms=result.get("latency_ms", 0),
    )
