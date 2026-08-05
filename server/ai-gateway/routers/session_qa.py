"""
熵减 AI 网关 — 课堂问答路由（D2 回声定位问答）

POST /api/v1/ai/session-qa — 以课堂转写为上下文回答问题，返回引用来源

@ai-context: 课堂问答路由：输入课堂转写（客户端截断）+ 问题，输出答案与
引用片段（时间戳）；degraded 状态表示模型输出不可用。
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from config import call_with_fallback_for_request
from chains.session_qa_chain import SessionQaChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["课堂问答"])


# ============================================================
# 请求/响应模型
# ============================================================


class SessionQaRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500, description="用户问题")
    transcript: str = Field(..., min_length=1, max_length=8000, description="课堂转写文本（客户端截断）")


class SessionQaReference(BaseModel):
    time: str = Field(description="引用片段时间戳，如 00:12:34")
    text: str = Field(description="引用片段摘录（≤80 字）")


class SessionQaResult(BaseModel):
    answer: str
    references: list[SessionQaReference] = []
    status: str
    model: str
    tokens_used: int = 0


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/session-qa",
    response_model=SessionQaResult,
    summary="课堂内容问答（带引用来源）",
)
async def session_qa(
    request: Request, body: SessionQaRequest
) -> SessionQaResult:
    """针对课堂转写内容提问，回答附带转写片段引用"""
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "课堂问答请求: user=%s, question_len=%d, transcript_len=%d",
        user_id, len(body.question), len(body.transcript),
    )

    async def _run_chain(provider, model_name):
        chain = SessionQaChain(provider=provider, model=model_name)
        return await chain.run(transcript=body.transcript, question=body.question)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "session_qa", request, _run_chain
        )
    except Exception as exc:
        logger.error("课堂问答失败: user=%s, error=%s", user_id, exc)
        return SessionQaResult(answer="", references=[], status="degraded", model="none", tokens_used=0)

    references = [
        SessionQaReference(time=ref.get("time", ""), text=ref.get("text", ""))
        for ref in result.get("references", [])
        if ref.get("time") and ref.get("text")
    ]
    return SessionQaResult(
        answer=result.get("answer", ""),
        references=references,
        status=result.get("status", "success"),
        model=result.get("model", "unknown"),
        tokens_used=result.get("tokens_used", 0),
    )
