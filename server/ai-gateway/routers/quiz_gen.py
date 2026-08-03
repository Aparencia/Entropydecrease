"""
熵减 AI 网关 —— 课程级迷你测试生成路由（N1）

POST /api/v1/ai/generate-quiz
调用 QuizGenChain 基于多篇笔记生成混合题型迷你测试。

@ai-context: 测试效应路由——输入笔记合并文本，输出结构化题目列表；
复用 call_with_fallback_for_request 降级链与 Redis 缓存。
"""
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.quiz_gen_chain import QuizGenChain
from cache.redis_cache import get_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["迷你测试生成"])


# ============================================================
# 请求/响应模型
# ============================================================


class QuizGenRequest(BaseModel):
    """迷你测试生成请求"""
    notesText: str = Field(..., description="多篇笔记合并文本（前端截断至 6000 字内）")


class QuizQuestion(BaseModel):
    """单道题目"""
    type: str = Field(..., description="题型：fill_blank/choice/short_answer")
    question: str = Field(..., description="题干")
    options: list[str] = Field(default_factory=list, description="选择题选项")
    answer: str = Field(..., description="正确答案")
    explanation: str = Field(default="", description="一句话解析")
    concept: str = Field(default="", description="考察的概念关键词")


class QuizGenResponse(BaseModel):
    """迷你测试生成响应"""
    questions: list[QuizQuestion] = Field(..., description="题目列表")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


@router.post("/generate-quiz", response_model=QuizGenResponse, summary="生成课程级迷你测试")
async def generate_quiz(request: Request, body: QuizGenRequest) -> QuizGenResponse:
    """
    基于笔记内容生成 5-10 题混合题型迷你测试

    - 使用通义千问 qwen-plus 模型 + JSON Mode
    - 题目经结构校验，非法题目自动过滤
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    if not body.notesText.strip():
        raise HTTPException(status_code=400, detail="笔记内容不能为空")
    logger.info("迷你测试生成请求: user=%s, text_len=%d", user_id, len(body.notesText))

    cache_key = hashlib.sha256(body.notesText[:3000].encode()).hexdigest()

    cache = get_cache()
    if cache._client is not None:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("迷你测试缓存命中: user=%s", user_id)
            return QuizGenResponse(**cached)

    async def _run_chain(provider, model_name):
        chain = QuizGenChain(provider=provider, model=model_name)
        return await chain.run(notes_text=body.notesText)

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "quiz_gen", request, _run_chain
        )

        questions_data = chain_result.get("questions", [])
        if not questions_data:
            raise HTTPException(status_code=502, detail="未能生成有效题目，请稍后重试")

        logger.info("迷你测试生成完成: provider=%s, questions=%d", used_provider, len(questions_data))

    except RuntimeError as e:
        logger.error("迷你测试生成服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    # 仅缓存有效结果：fallback 空结果不入缓存，避免 AI 恢复后 1 小时内持续失效
    if cache._client is not None and chain_result.get("model") != "fallback":
        await cache.set_ai_cache(cache_key, chain_result, expire=3600)

    return QuizGenResponse(
        questions=[QuizQuestion(**q) for q in questions_data],
        model=chain_result.get("model", "unknown"),
        tokens_used=chain_result.get("tokens_used", 0),
    )
