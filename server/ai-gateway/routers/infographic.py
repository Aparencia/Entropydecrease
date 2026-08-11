"""
熵减 AI 网关 —— 知识信息图生成器路由

POST /api/v1/ai/infographic
调用 InfographicChain 生成信息图结构。

@ai-context: 信息图路由——输入内容，输出结构化信息图大纲。
"""

import logging
from pydantic import BaseModel, Field, field_validator, ConfigDict
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.infographic_chain import InfographicChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["知识信息图"])


# ============================================================
# 请求/响应模型
# ============================================================


class InfographicRequest(BaseModel):
    content: str = Field(..., description="课程/笔记内容", min_length=1, max_length=5000)
    content_type: str = Field(default="general", description="内容类型（如 physics, history, tech 等）", max_length=50)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("内容不能为空白")
        return v.strip()


class InfographicPoint(BaseModel):
    text: str = Field(..., description="要点内容")
    importance: int = Field(default=3, description="重要性 1-5", ge=1, le=5)


class InfographicSection(BaseModel):
    heading: str = Field(..., description="章节标题")
    points: list[InfographicPoint] = Field(default_factory=list, description="要点列表")


class KeyRelationship(BaseModel):
    from_concept: str = Field(..., alias="from", description="概念 A")
    to_concept: str = Field(..., alias="to", description="概念 B")
    relation: str = Field(default="", description="关系类型")

    model_config = ConfigDict(populate_by_name=True)


class InfographicResponse(BaseModel):
    title: str = Field(..., description="信息图标题")
    style: str = Field(..., description="风格：academic/tech/warm")
    style_name: str = Field(default="", description="风格中文名称")
    sections: list[InfographicSection] = Field(default_factory=list, description="章节列表")
    key_relationships: list[KeyRelationship] = Field(default_factory=list, description="关键关系")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/infographic", response_model=InfographicResponse, summary="知识信息图生成")
async def infographic(request: Request, body: InfographicRequest) -> InfographicResponse:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("信息图生成: user=%s, content=%s", user_id, body.content[:80])

    async def _run_chain(provider, model_name):
        chain = InfographicChain(provider=provider, model=model_name)
        return await chain.run(
            content=body.content,
            content_type=body.content_type,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "infographic", request, _run_chain
        )
        sections = [
            InfographicSection(
                heading=sec.get("heading", ""),
                points=[
                    InfographicPoint(
                        text=p.get("text", ""),
                        importance=p.get("importance", 3),
                    )
                    for p in sec.get("points", [])
                ],
            )
            for sec in result.get("sections", [])
        ]
        relationships = [
            KeyRelationship(
                from_concept=rel.get("from", ""),
                to_concept=rel.get("to", ""),
                relation=rel.get("relation", ""),
            )
            for rel in result.get("key_relationships", [])
        ]
        response = InfographicResponse(
            title=result.get("title", ""),
            style=result.get("style", "academic"),
            style_name=result.get("style_name", ""),
            sections=sections,
            key_relationships=relationships,
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("信息图生成完成: provider=%s, sections=%d", used_provider, len(sections))
    except RuntimeError as e:
        logger.warning("信息图生成服务不可用，降级响应: %s", str(e))
        response = InfographicResponse(
            title="知识概览",
            style="academic",
            style_name="学术简约",
            sections=[
                InfographicSection(
                    heading="核心概念",
                    points=[InfographicPoint(text="待分析内容", importance=5)],
                ),
            ],
            key_relationships=[],
            status="fallback",
            model="local_rule",
        )
    return response