"""
熵减 AI 网关 — 苏格拉底式学习路由

POST /api/v1/ai/socratic/brainstorm  — 头脑风暴（5+发散角度）
POST /api/v1/ai/socratic/evaluate    — 四维度评估用户回答
POST /api/v1/ai/socratic/deepening   — 生成个性化深化角度

@ai-context: 苏格拉底式学习路由：头脑风暴式提问 + 四维度评估，多轮对话经 fallback 链。
"""

import logging
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.socratic_brainstorm_chain import SocraticBrainstormChain
from chains.socratic_evaluate_chain import SocraticEvaluateChain
from chains.socratic_deepening_chain import SocraticDeepeningChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai/socratic", tags=["苏格拉底学习"])


# ============================================================
# 请求/响应模型 — 头脑风暴
# ============================================================


class SocraticBrainstormRequest(BaseModel):
    """头脑风暴请求"""
    topic: str = Field(..., description="学习主题", min_length=1, max_length=500)
    context: str = Field(default="", description="额外上下文", max_length=2000)

    @field_validator("topic")
    @classmethod
    def topic_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("主题不能为空白")
        return v.strip()


class BrainstormIdeaItem(BaseModel):
    title: str = Field(..., description="创意标题")
    description: str = Field(..., description="创意描述")
    category: str = Field(default="", description="分类")


class SocraticBrainstormResult(BaseModel):
    ideas: list[BrainstormIdeaItem] = Field(default_factory=list)
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 请求/响应模型 — 四维度评估
# ============================================================


class SocraticEvaluateRequest(BaseModel):
    topic: str = Field(..., description="学习主题", min_length=1, max_length=500)
    question: str = Field(..., description="AI 提出的问题", min_length=1, max_length=2000)
    answer: str = Field(..., description="用户的回答", min_length=1, max_length=5000)
    history: list[dict[str, str]] = Field(
        default_factory=list,
        description="对话历史 [{role, content}]",
        max_length=50,
    )

    @field_validator("topic")
    @classmethod
    def topic_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("主题不能为空白")
        return v.strip()

    @field_validator("question")
    @classmethod
    def question_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("问题不能为空白")
        return v.strip()

    @field_validator("answer")
    @classmethod
    def answer_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("回答不能为空白")
        return v.strip()

    @field_validator("history")
    @classmethod
    def validate_history(cls, v: list[dict[str, str]]) -> list[dict[str, str]]:
        valid_roles = {"user", "assistant", "system", "learner", "tutor"}
        for msg in v:
            if "role" not in msg or "content" not in msg:
                raise ValueError("历史消息必须包含 role 和 content 字段")
            if msg["role"] not in valid_roles:
                raise ValueError(f"无效的 role: {msg['role']}")
            if not str(msg["content"]).strip():
                raise ValueError("历史消息 content 不能为空白")
        return v


class DimensionScores(BaseModel):
    accuracy: float = Field(..., ge=0, le=10)
    completeness: float = Field(..., ge=0, le=10)
    logic: float = Field(..., ge=0, le=10)
    expression: float = Field(..., ge=0, le=10)


class SocraticEvaluateResult(BaseModel):
    dimensions: DimensionScores = Field(...)
    feedback: str = Field(default="")
    encouragement: str = Field(default="")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 请求/响应模型 — 深化角度
# ============================================================


class SocraticDeepeningRequest(BaseModel):
    topic: str = Field(..., description="学习主题", min_length=1, max_length=500)
    dialogue_summary: str = Field(default="", description="追问对话摘要", max_length=2000)
    history: list[dict[str, str]] = Field(
        default_factory=list,
        description="对话历史",
        max_length=50,
    )

    @field_validator("topic")
    @classmethod
    def topic_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("主题不能为空白")
        return v.strip()


class DeepeningAngleItem(BaseModel):
    key: str = Field(..., description="角度标识符")
    label: str = Field(..., description="角度标签")
    question: str = Field(..., description="引导问题")


class SocraticDeepeningResult(BaseModel):
    angles: list[DeepeningAngleItem] = Field(default_factory=list)
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理 — 头脑风暴
# ============================================================


@router.post("/brainstorm", response_model=SocraticBrainstormResult, summary="苏格拉底头脑风暴")
async def socratic_brainstorm(request: Request, body: SocraticBrainstormRequest) -> SocraticBrainstormResult:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("苏格拉底头脑风暴: user=%s, topic=%s", user_id, body.topic[:80])

    async def _run_chain(provider, model_name):
        chain = SocraticBrainstormChain(provider=provider, model=model_name)
        return await chain.run(topic=body.topic, context=body.context)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "socratic_brainstorm", request, _run_chain
        )
        ideas = [
            BrainstormIdeaItem(
                title=item.get("title", ""),
                description=item.get("description", ""),
                category=item.get("category", ""),
            )
            for item in result.get("ideas", [])
        ]
        response = SocraticBrainstormResult(
            ideas=ideas,
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("头脑风暴完成: provider=%s, idea_count=%d", used_provider, len(ideas))
    except RuntimeError as e:
        logger.warning("头脑风暴服务不可用，降级响应: %s", str(e))
        response = SocraticBrainstormResult(
            ideas=[
                BrainstormIdeaItem(title="生活类比", description=f"「{body.topic}」让你联想到生活中的什么？", category="类比"),
                BrainstormIdeaItem(title="反例挑战", description=f"什么情况下「{body.topic}」不成立？", category="反例"),
                BrainstormIdeaItem(title="实际应用", description=f"「{body.topic}」在现实中有哪些具体应用？", category="应用"),
                BrainstormIdeaItem(title="发展历史", description=f"「{body.topic}」是如何被提出和演变的？", category="历史"),
                BrainstormIdeaItem(title="争议与反思", description=f"围绕「{body.topic}」有哪些不同看法？", category="争议"),
            ],
            status="fallback",
            model="local_rule",
        )
    return response


# ============================================================
# 路由处理 — 四维度评估
# ============================================================


@router.post("/evaluate", response_model=SocraticEvaluateResult, summary="苏格拉底回答评估")
async def socratic_evaluate(request: Request, body: SocraticEvaluateRequest) -> SocraticEvaluateResult:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("苏格拉底评估: user=%s, topic=%s", user_id, body.topic[:50])

    async def _run_chain(provider, model_name):
        chain = SocraticEvaluateChain(provider=provider, model=model_name)
        return await chain.run(
            topic=body.topic, question=body.question,
            answer=body.answer, history=body.history,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "socratic_evaluate", request, _run_chain
        )
        dims = result.get("dimensions", {})
        response = SocraticEvaluateResult(
            dimensions=DimensionScores(
                accuracy=dims.get("accuracy", 5.0),
                completeness=dims.get("completeness", 5.0),
                logic=dims.get("logic", 5.0),
                expression=dims.get("expression", 5.0),
            ),
            feedback=result.get("feedback", ""),
            encouragement=result.get("encouragement", "继续思考，你会越来越深入！"),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("苏格拉底评估完成: provider=%s", used_provider)
    except RuntimeError as e:
        logger.warning("苏格拉底评估服务不可用，降级响应: %s", str(e))
        response = SocraticEvaluateResult(
            dimensions=DimensionScores(accuracy=5, completeness=5, logic=5, expression=5),
            feedback="AI 评估暂不可用，但请继续保持深入思考！",
            encouragement="坚持追问自己'为什么'和'如何'，是最好的学习方式。",
            status="fallback",
            model="local_rule",
        )
    return response


# ============================================================
# 路由处理 — 深化角度
# ============================================================

# 默认深化角度（降级时使用）
_DEFAULT_DEEPENING_ANGLES = [
    {"key": "analogy", "label": "类比联想", "question": "这个概念像什么？能用生活中什么东西来比喻？"},
    {"key": "counter", "label": "反例验证", "question": "什么情况下这个概念不成立？有例外吗？"},
    {"key": "apply", "label": "实际应用", "question": "在实际生活或工作中，这个概念怎么用？"},
    {"key": "origin", "label": "起源探究", "question": "这个概念是怎么来的？谁发现的？为什么？"},
    {"key": "debate", "label": "多元视角", "question": "关于这个概念，有什么不同的看法或争论？"},
]


@router.post("/deepening", response_model=SocraticDeepeningResult, summary="生成深化角度")
async def socratic_deepening(request: Request, body: SocraticDeepeningRequest) -> SocraticDeepeningResult:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("苏格拉底深化角度: user=%s, topic=%s", user_id, body.topic[:80])

    async def _run_chain(provider, model_name):
        chain = SocraticDeepeningChain(provider=provider, model=model_name)
        return await chain.run(
            topic=body.topic,
            dialogue_summary=body.dialogue_summary,
            history=body.history,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "socratic_deepening", request, _run_chain
        )
        angles = [
            DeepeningAngleItem(
                key=item.get("key", ""),
                label=item.get("label", ""),
                question=item.get("question", ""),
            )
            for item in result.get("angles", [])
        ]
        response = SocraticDeepeningResult(
            angles=angles,
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("深化角度生成完成: provider=%s, angle_count=%d", used_provider, len(angles))
    except RuntimeError as e:
        logger.warning("深化角度服务不可用，降级响应: %s", str(e))
        # 降级：使用默认角度，替换主题名称
        response = SocraticDeepeningResult(
            angles=[
                DeepeningAngleItem(
                    key=a["key"],
                    label=a["label"],
                    question=a["question"].replace("这个概念", f"「{body.topic}」"),
                )
                for a in _DEFAULT_DEEPENING_ANGLES
            ],
            status="fallback",
            model="local_rule",
        )
    return response
