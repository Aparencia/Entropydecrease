"""
熵减 AI 网关 — 费曼反问路由

POST /api/v1/ai/feynman-question
  生成 1-3 个基于用户讲解的追问

POST /api/v1/ai/feynman-evaluate-answers
  评估用户对追问的回答，返回理解度评分

@ai-context: 费曼提问路由：基于笔记内容生成引导性问题，驱动深度理解。
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.feynman_question_chain import FeynmanQuestionChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["费曼反问"])


# ============================================================
# 请求/响应模型 — 生成追问
# ============================================================


class FeynmanQuestionRequest(BaseModel):
    """费曼反问请求"""
    concept: str = Field(..., description="概念名称", min_length=1)
    explanation: str = Field(..., description="用户的费曼式讲解", min_length=10)


class FeynmanQuestion(BaseModel):
    """单个追问"""
    question: str = Field(..., description="追问内容")
    focus: str = Field(..., description="聚焦的知识点")


class FeynmanQuestionResult(BaseModel):
    """追问生成结果"""
    questions: list[FeynmanQuestion] = Field(..., description="追问列表")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")


# ============================================================
# 请求/响应模型 — 评估回答
# ============================================================


class FeynmanAnswerRequest(BaseModel):
    """费曼回答评估请求"""
    concept: str = Field(..., description="概念名称", min_length=1)
    questions: list[str] = Field(..., description="追问列表")
    answers: list[str] = Field(..., description="用户的回答列表")


class FeynmanAnswerResult(BaseModel):
    """回答评估结果"""
    understanding_score: float = Field(
        ..., description="理解度评分 (0-10)", ge=0, le=10
    )
    feedback: str = Field(..., description="整体反馈")
    strong_points: list[str] = Field(default_factory=list, description="理解到位的方面")
    weak_points: list[str] = Field(default_factory=list, description="仍需加强的方面")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")
    latency_ms: int = Field(..., description="请求耗时（毫秒）")


# ============================================================
# 路由处理 — 生成追问
# ============================================================


@router.post(
    "/feynman-question",
    response_model=FeynmanQuestionResult,
    summary="生成费曼追问",
)
async def feynman_question(
    request: Request, body: FeynmanQuestionRequest
) -> FeynmanQuestionResult:
    """
    生成 1-3 个追问，帮助学习者深入理解概念。

    - AI 以"好奇小白"角色提问
    - 追问基于讲解中的薄弱点/模糊表述
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "费曼反问请求: user=%s, concept=%s, explanation_length=%d",
        user_id, body.concept, len(body.explanation),
    )

    async def _run_chain(provider, model_name):
        chain = FeynmanQuestionChain(provider=provider, model=model_name)
        return await chain.generate_questions(
            concept=body.concept,
            explanation=body.explanation,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "feynman_question", request, _run_chain
        )

        questions = [
            FeynmanQuestion(question=q["question"], focus=q["focus"])
            for q in result.get("questions", [])
        ]

        response = FeynmanQuestionResult(
            questions=questions,
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("费曼反问完成: provider=%s, question_count=%d", used_provider, len(questions))

    except RuntimeError as e:
        logger.warning("费曼反问服务全部不可用，使用降级响应: %s", str(e))
        response = FeynmanQuestionResult(
            questions=[
                FeynmanQuestion(
                    question="能否举一个生活中的例子来说明这个概念？",
                    focus="概念的实际应用",
                )
            ],
            model="fallback",
            tokens_used=0,
            latency_ms=0,
        )

    return response


# ============================================================
# 路由处理 — 评估回答
# ============================================================


@router.post(
    "/feynman-evaluate-answers",
    response_model=FeynmanAnswerResult,
    summary="评估费曼追问的回答",
)
async def feynman_evaluate_answers(
    request: Request, body: FeynmanAnswerRequest
) -> FeynmanAnswerResult:
    """
    评估用户对追问的回答质量，给出理解度评分与反馈。

    - 返回 0-10 分的理解度评分
    - 指出强项与薄弱点
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "费曼回答评估请求: user=%s, concept=%s, question_count=%d",
        user_id, body.concept, len(body.questions),
    )

    async def _run_chain(provider, model_name):
        chain = FeynmanQuestionChain(provider=provider, model=model_name)
        return await chain.evaluate_answers(
            concept=body.concept,
            questions=body.questions,
            answers=body.answers,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "feynman_evaluate", request, _run_chain
        )

        response = FeynmanAnswerResult(
            understanding_score=result.get("understanding_score", 5.0),
            feedback=result.get("feedback", ""),
            strong_points=result.get("strong_points", []),
            weak_points=result.get("weak_points", []),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("费曼回答评估完成: provider=%s", used_provider)

    except RuntimeError as e:
        logger.warning("费曼回答评估服务全部不可用，使用降级响应: %s", str(e))
        response = FeynmanAnswerResult(
            understanding_score=5.0,
            feedback="AI 评估暂不可用，但请继续保持用费曼学习法检验自己的理解！",
            strong_points=["坚持用费曼学习法是很好的学习习惯"],
            weak_points=["AI 服务恢复后可获取更详细的评估"],
            model="fallback",
            tokens_used=0,
            latency_ms=0,
        )

    return response
