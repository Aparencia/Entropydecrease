"""
熵减 AI 网关 —— 概念拟人化路由

POST /api/v1/ai/personify
调用 PersonifyChain 生成概念拟人化角色卡。

@ai-context: 概念拟人化路由——输入概念，输出人物卡与关系戏剧。
"""

import logging
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.personify_chain import PersonifyChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["概念拟人化"])


# ============================================================
# 请求/响应模型
# ============================================================


class PersonifyRequest(BaseModel):
    concept: str = Field(..., description="要拟人化的概念", min_length=1, max_length=200)
    related_concepts: str = Field(default="", description="相关概念（逗号分隔）", max_length=500)

    @field_validator("concept")
    @classmethod
    def concept_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("概念不能为空白")
        return v.strip()


class PersonaCard(BaseModel):
    name: str = Field(..., description="概念的人名")
    personality: str = Field(default="", description="性格描述")
    backstory: str = Field(default="", description="背景故事")
    catchphrase: str = Field(default="", description="口头禅")


class RelationshipItem(BaseModel):
    other_concept: str = Field(..., description="相关概念的人名")
    relation_type: str = Field(..., description="关系类型：causal/analogy/opposite")
    relation_type_name: str = Field(default="", description="关系类型中文名")
    story: str = Field(default="", description="关系故事")


class PersonifyResponse(BaseModel):
    persona_card: PersonaCard = Field(..., description="人物卡")
    relationships: list[RelationshipItem] = Field(default_factory=list, description="关系列表")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/personify", response_model=PersonifyResponse, summary="概念拟人化")
async def personify(request: Request, body: PersonifyRequest) -> PersonifyResponse:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("概念拟人化: user=%s, concept=%s", user_id, body.concept[:50])

    async def _run_chain(provider, model_name):
        chain = PersonifyChain(provider=provider, model=model_name)
        return await chain.run(
            concept=body.concept,
            related_concepts=body.related_concepts,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "personify", request, _run_chain
        )
        pc = result.get("persona_card", {})
        relationships = [
            RelationshipItem(
                other_concept=rel.get("other_concept", ""),
                relation_type=rel.get("relation_type", ""),
                relation_type_name=str(rel.get("relation_type_name", "") or ""),
                story=rel.get("story", ""),
            )
            for rel in result.get("relationships", [])
        ]
        response = PersonifyResponse(
            persona_card=PersonaCard(
                name=pc.get("name", ""),
                personality=pc.get("personality", ""),
                backstory=pc.get("backstory", ""),
                catchphrase=pc.get("catchphrase", ""),
            ),
            relationships=relationships,
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("概念拟人化完成: provider=%s", used_provider)
    except RuntimeError as e:
        logger.warning("概念拟人化服务不可用，降级响应: %s", str(e))
        response = PersonifyResponse(
            persona_card=PersonaCard(
                name="概念小精灵",
                personality="神秘、好奇",
                backstory="来自抽象世界的概念精灵",
                catchphrase="想要理解我，就多想想吧！",
            ),
            relationships=[],
            status="fallback",
            model="local_rule",
        )
    return response