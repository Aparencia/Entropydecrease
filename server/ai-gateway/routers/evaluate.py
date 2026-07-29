"""
熵减 AI 网关 — 费曼评估路由

POST /api/v1/ai/evaluate-explanation
调用 DeepSeek 评估用户对概念的费曼式解释。

@ai-context: 费曼评估路由：对用户讲解打分并给反馈，经 fallback 链调用文本模型。
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.evaluation_chain import EvaluationChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["费曼评估"])


# ============================================================
# 请求/响应模型
# ============================================================


class EvaluateRequest(BaseModel):
    """费曼评估请求"""
    concept: str = Field(..., description="待解释的概念名称", min_length=1)
    explanation: str = Field(..., description="用户对概念的费曼式解释", min_length=10)


class DimensionScore(BaseModel):
    """维度评分"""
    dimension: str = Field(..., description="评分维度名称")
    score: float = Field(..., description="分数 (0-10)", ge=0, le=10)
    feedback: str = Field(..., description="该维度的反馈")


class EvaluationResult(BaseModel):
    """费曼评估结果"""
    overall_score: float = Field(..., description="综合评分 (0-10)", ge=0, le=10)
    dimensions: list[DimensionScore] = Field(..., description="各维度评分")
    strengths: list[str] = Field(default_factory=list, description="优点列表")
    improvements: list[str] = Field(default_factory=list, description="改进建议列表")
    encouragement: str = Field(default="", description="鼓励性评语")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/evaluate-explanation",
    response_model=EvaluationResult,
    summary="费曼学习法评估",
)
async def evaluate_explanation(
    request: Request, body: EvaluateRequest
) -> EvaluationResult:
    """
    评估用户对概念的费曼式解释

    - 使用 DeepSeek deepseek-chat 模型
    - 从准确性、完整性、简洁性、通俗性四个维度评分
    - 提供具体改进建议和鼓励性反馈
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "费曼评估请求: user=%s, concept=%s, explanation_length=%d",
        user_id, body.concept, len(body.explanation),
    )

    # 通过 fallback 链自动选择 Provider 并在失败时重试/降级
    async def _run_chain(provider, model_name):
        chain = EvaluationChain(provider=provider, model=model_name)
        return await chain.run(
            concept=body.concept,
            explanation=body.explanation,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "evaluate", request, _run_chain
        )

        # 从 chain 结果构建 EvaluationResult
        dimensions = [
            DimensionScore(
                dimension=dim["dimension"],
                score=dim["score"],
                feedback=dim["feedback"],
            )
            for dim in result.get("dimensions", [])
        ]

        evaluation = EvaluationResult(
            overall_score=result.get("overall_score", 5.0),
            dimensions=dimensions,
            strengths=result.get("strengths", []),
            improvements=result.get("improvements", []),
            encouragement=result.get("encouragement", ""),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )

        logger.info("费曼评估完成: provider=%s", used_provider)

    except RuntimeError as e:
        # 所有 Provider 均不可用，返回通用鼓励性降级评估
        logger.warning("费曼评估服务全部不可用，使用降级响应: %s", str(e))
        evaluation = EvaluationResult(
            overall_score=5.0,
            dimensions=[
                DimensionScore(
                    dimension="overall",
                    score=5.0,
                    feedback="AI 评估暂不可用，请继续努力用自己的话解释概念！",
                )
            ],
            strengths=["尝试用自己的话解释概念是很好的学习习惯"],
            improvements=["AI 服务恢复后可获取更详细的评估"],
            encouragement="费曼学习法是掌握知识的绝佳方法，继续保持！",
            model="fallback",
            tokens_used=0,
            latency_ms=0,
        )

    return evaluation
