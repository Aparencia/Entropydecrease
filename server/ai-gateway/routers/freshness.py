"""
熵减 AI 网关 —— 知识保鲜检测路由

POST /api/v1/ai/freshness
调用 FreshnessChain 检测知识条目是否因领域更新而过时（新鲜/即将过期/已过期）。

@ai-context: 知识保鲜系统（G4）路由——输入知识条目列表，输出保鲜度标签与
建议；复用 call_with_fallback_for_request 降级链与并发 Semaphore。
"""
import logging
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.freshness_chain import FreshnessChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["知识保鲜检测"])


# ============================================================
# 请求/响应模型
# ============================================================


class KnowledgeItem(BaseModel):
    """单个知识条目"""
    concept: str = Field(..., description="知识概念名", min_length=1, max_length=200)
    lastReviewedAt: str = Field(default="", description="最后复习日期（如 2026-08-01）", max_length=64)
    content: str = Field(default="", description="知识内容摘要", max_length=2000)

    @field_validator("concept")
    @classmethod
    def concept_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("概念不能为空白")
        return v.strip()


class FreshnessRequest(BaseModel):
    """知识保鲜检测请求"""
    items: list[KnowledgeItem] = Field(..., description="知识条目列表（最多 20 条）", min_length=1, max_length=20)


class FreshnessItemResult(BaseModel):
    """单条知识的保鲜度结果"""
    concept: str = Field(..., description="知识概念名")
    freshness: str = Field(..., description="保鲜度：fresh/expiring/expired")
    reason: str = Field(default="", description="判断原因")
    recommendation: str = Field(default="", description="建议动作")

    @field_validator("freshness")
    @classmethod
    def freshness_enum(cls, v: str) -> str:
        if v not in ("fresh", "expiring", "expired"):
            return "expiring"  # 纵深防御：chain 层已过滤，非法值兜底
        return v


class FreshnessResponse(BaseModel):
    """知识保鲜检测响应"""
    items: list[FreshnessItemResult] = Field(..., description="保鲜度结果列表")
    summary: str = Field(default="", description="整体保鲜状况总结")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/freshness", response_model=FreshnessResponse, summary="检测知识保鲜状态")
async def freshness(request: Request, body: FreshnessRequest) -> FreshnessResponse:
    """
    检测知识条目是否因领域更新而过时，给出保鲜度标签与刷新建议
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("知识保鲜检测: user=%s, items=%d", user_id, len(body.items))

    async def _run_chain(provider, model_name):
        chain = FreshnessChain(provider=provider, model=model_name)
        return await chain.run(
            items=[{
                "concept": item.concept,
                "lastReviewedAt": item.lastReviewedAt,
                "content": item.content,
            } for item in body.items],
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "freshness", request, _run_chain
        )
        response = FreshnessResponse(
            items=[
                FreshnessItemResult(
                    concept=it.get("concept", ""),
                    freshness=it.get("freshness", ""),
                    reason=it.get("reason", ""),
                    recommendation=it.get("recommendation", ""),
                )
                for it in result.get("items", [])
            ],
            summary=result.get("summary", ""),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("知识保鲜检测完成: provider=%s, items=%d", used_provider, len(response.items))
    except RuntimeError as e:
        logger.warning("知识保鲜检测服务不可用，降级响应: %s", str(e))
        response = FreshnessResponse(
            items=[],
            summary="AI 分析失败，请稍后重试或检查网络连接。",
            status="fallback",
            model="local_rule",
        )
    return response
