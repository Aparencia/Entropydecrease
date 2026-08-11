"""
熵减 AI 网关 —— 反直觉发现器路由

POST /api/v1/ai/counterintuitive
调用 CounterintuitiveChain 生成反直觉事实。

@ai-context: 反直觉发现路由——输入学习主题，输出反直觉事实。
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.counterintuitive_chain import CounterintuitiveChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["反直觉发现器"])


# ============================================================
# 请求/响应模型
# ============================================================


class CounterintuitiveRequest(BaseModel):
    learning_topics: str = Field(default="", description="用户近期学习主题（可选）", max_length=1000)


class CounterintuitiveResponse(BaseModel):
    fact: str = Field(..., description="反直觉事实")
    category: str = Field(..., description="分类：common_sense/counter_intuitive/paradox/counter_example")
    category_name: str = Field(default="", description="分类中文名称")
    explanation: str = Field(default="", description="解释")
    relation_to_learning: str = Field(default="通用知识", description="与学习的关联")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/counterintuitive", response_model=CounterintuitiveResponse, summary="反直觉发现器")
async def counterintuitive(request: Request, body: CounterintuitiveRequest) -> CounterintuitiveResponse:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("反直觉发现: user=%s, topics=%s", user_id, body.learning_topics[:80] or "无")

    async def _run_chain(provider, model_name):
        chain = CounterintuitiveChain(provider=provider, model=model_name)
        return await chain.run(learning_topics=body.learning_topics)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "counterintuitive", request, _run_chain
        )
        response = CounterintuitiveResponse(
            fact=result.get("fact", ""),
            category=result.get("category", "counter_intuitive"),
            category_name=result.get("category_name", ""),
            explanation=result.get("explanation", ""),
            relation_to_learning=result.get("relation_to_learning", "通用知识"),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("反直觉发现完成: provider=%s", used_provider)
    except RuntimeError as e:
        logger.warning("反直觉发现服务不可用，降级响应: %s", str(e))
        response = CounterintuitiveResponse(
            fact="我们常以为地球是圆的，但严格来说它更像一个扁球体。",
            category="counter_intuitive",
            category_name="违反直觉",
            explanation="自转产生的离心力让赤道地区略微隆起。",
            relation_to_learning="通用知识",
            status="fallback",
            model="local_rule",
        )
    return response