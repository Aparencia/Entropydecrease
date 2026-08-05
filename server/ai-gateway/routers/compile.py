"""
熵减 AI 网关 —— 知识编译引擎路由

POST /api/v1/ai/compile
调用 CompileChain 将课程/主题笔记编译为结构化学习资源
（知识摘要/概念图谱/闪卡精华集/费曼精选/学习路径推荐）。

@ai-context: 知识编译引擎（Phase4）路由——输入多篇笔记 + 可选主题，输出
5 种学习资源；复用 call_with_fallback_for_request 降级链与并发 Semaphore；
LLM 输出逐项校验+过滤（缺字段项丢弃而非 pydantic 500）。
"""
import logging
from typing import Any
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.compile_chain import CompileChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["知识编译引擎"])


# ============================================================
# 请求/响应模型
# ============================================================


class CompileNote(BaseModel):
    """单篇课程/主题笔记"""
    title: str = Field(default="", description="笔记标题", max_length=200)
    content: str = Field(..., description="笔记内容", max_length=20000)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("笔记内容不能为空白")
        return v


class CompileRequest(BaseModel):
    """知识编译请求"""
    notes: list[CompileNote] = Field(..., description="笔记列表（最多 10 篇）", min_length=1, max_length=10)
    theme: str = Field(default="", description="课程/主题名（可选）", max_length=100)


class ConceptNode(BaseModel):
    """概念图谱节点"""
    concept: str = Field(..., description="概念名")
    related: list[str] = Field(default_factory=list, description="关联概念列表")
    mastery_estimate: float = Field(default=0.3, description="掌握度估计 0.0-1.0")


class FlashcardHighlight(BaseModel):
    """闪卡精华"""
    front: str = Field(..., description="卡片正面问题")
    back: str = Field(..., description="卡片背面答案")


class FeynmanPick(BaseModel):
    """费曼精选"""
    concept: str = Field(..., description="核心概念")
    takeaway: str = Field(..., description="一句话大白话解释")


class LearningStep(BaseModel):
    """学习路径步骤"""
    step: str = Field(..., description="步骤名")
    action: str = Field(..., description="具体动作")


class CompileResponse(BaseModel):
    """知识编译响应"""
    summary: str = Field(default="", description="知识摘要")
    concept_map: list[ConceptNode] = Field(default_factory=list, description="概念图谱")
    flashcard_highlights: list[FlashcardHighlight] = Field(default_factory=list, description="闪卡精华集")
    feynman_picks: list[FeynmanPick] = Field(default_factory=list, description="费曼精选")
    learning_path: list[LearningStep] = Field(default_factory=list, description="学习路径推荐")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


def _filter_concept_map(items: Any) -> list[ConceptNode]:
    """校验概念图谱项：缺 concept 或 concept 为空白时丢弃（LLM 输出质量问题）"""
    result: list[ConceptNode] = []
    if not isinstance(items, list):
        return result
    for item in items:
        if not isinstance(item, dict):
            continue
        concept = str(item.get("concept", "")).strip()
        if not concept:
            continue
        related = item.get("related", [])
        if not isinstance(related, list):
            related = []
        related = [str(r) for r in related if isinstance(r, str) and r.strip()]
        try:
            mastery = float(item.get("mastery_estimate", 0.3))
        except (TypeError, ValueError):
            mastery = 0.3
        mastery = max(0.0, min(1.0, mastery))
        result.append(ConceptNode(concept=concept, related=related, mastery_estimate=mastery))
    return result


def _filter_pairs(items: Any, required: tuple[str, str], model_cls: type) -> list:
    """通用校验：两个必填字段均非空才保留（闪卡/费曼/学习路径共用）"""
    result = []
    if not isinstance(items, list):
        return result
    for item in items:
        if not isinstance(item, dict):
            continue
        values = {k: str(item.get(k, "")).strip() for k in required}
        if not all(values.values()):
            continue
        result.append(model_cls(**values))
    return result


@router.post("/compile", response_model=CompileResponse, summary="编译课程笔记为结构化学习资源")
async def compile_notes(request: Request, body: CompileRequest) -> CompileResponse:
    """
    将课程/主题笔记编译为知识摘要、概念图谱、闪卡精华集、费曼精选与学习路径推荐
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("知识编译请求: user=%s, notes=%d, theme=%s", user_id, len(body.notes), body.theme[:50])

    async def _run_chain(provider, model_name):
        chain = CompileChain(provider=provider, model=model_name)
        return await chain.run(
            notes=[{"title": n.title, "content": n.content} for n in body.notes],
            options={"theme": body.theme} if body.theme else None,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "compile", request, _run_chain
        )
        response = CompileResponse(
            summary=result.get("summary", ""),
            concept_map=_filter_concept_map(result.get("concept_map", [])),
            flashcard_highlights=_filter_pairs(
                result.get("flashcard_highlights", []), ("front", "back"), FlashcardHighlight
            ),
            feynman_picks=_filter_pairs(
                result.get("feynman_picks", []), ("concept", "takeaway"), FeynmanPick
            ),
            learning_path=_filter_pairs(
                result.get("learning_path", []), ("step", "action"), LearningStep
            ),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info(
            "知识编译完成: provider=%s, concepts=%d, cards=%d, steps=%d",
            used_provider, len(response.concept_map),
            len(response.flashcard_highlights), len(response.learning_path),
        )
    except RuntimeError as e:
        logger.warning("知识编译服务不可用，降级响应: %s", str(e))
        response = CompileResponse(
            summary="AI 编译失败，请稍后重试或检查网络连接。",
            status="fallback",
            model="local_rule",
        )
    return response
