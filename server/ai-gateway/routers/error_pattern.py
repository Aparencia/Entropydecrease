"""
熵减 AI 网关 —— 错误模式分析路由

POST /api/v1/ai/error-pattern
调用 ErrorPatternChain 分析黄金错误记录，识别错误模式（概念盲区/混淆/过度自信）。

@ai-context: 错误模式分析路由——输入黄金错误列表，输出错误模式分类与建议；
复用 call_with_fallback_for_request 降级链与 Redis 缓存。
"""
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.error_pattern_chain import ErrorPatternChain
from cache.redis_cache import get_cache
from fastapi import HTTPException

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["错误模式分析"])


# ============================================================
# 请求/响应模型
# ============================================================


class GoldenErrorRecord(BaseModel):
    """单条黄金错误记录"""
    flashcardId: str = Field(..., description="闪卡 ID")
    correctAnswer: str = Field(..., description="正确答案")
    userAnswer: str = Field(..., description="用户回答")


class ErrorPatternRequest(BaseModel):
    """错误模式分析请求"""
    goldenErrors: list[GoldenErrorRecord] = Field(..., description="黄金错误记录列表")


class PatternItem(BaseModel):
    """错误模式项"""
    type: str = Field(..., description="错误类型：concept_blind/concept_confusion/overconfidence")
    keywords: list[str] = Field(..., description="3个关键词")
    explanation: str = Field(..., description="错误原因简述")
    suggestion: str = Field(..., description="具体改进建议")


class TopOffender(BaseModel):
    """高频错误卡片"""
    flashcardId: str = Field(..., description="闪卡 ID")
    count: int = Field(..., description="出现次数")


class ErrorPatternResponse(BaseModel):
    """错误模式分析响应"""
    patterns: list[PatternItem] = Field(..., description="错误模式列表")
    top_offenders: list[TopOffender] = Field(..., description="高频错误卡片列表")
    summary: str = Field(..., description="整体趋势总结")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


def _validate_pattern_item(item: Any) -> dict | None:
    """校验 LLM 输出的错误模式项：缺失必填字段/类型非法时返回 None（过滤）。

    GW-2#3: LLM JSON 输出截断或格式漂移时，PatternItem(**p) 严格构造会抛
    ValidationError 导致 500——与 quiz_gen_chain._validate_question 相同的
    逐项校验+过滤模式，非法项丢弃而非崩溃。
    """
    if not isinstance(item, dict):
        return None
    required = {"type", "keywords", "explanation", "suggestion"}
    if not all(k in item and item[k] not in (None, "") for k in required):
        return None
    keywords = item.get("keywords")
    # GW-3: 空列表也过滤（LLM 输出空 keywords 无分析意义）
    if not isinstance(keywords, list) or len(keywords) == 0 or not all(isinstance(k, str) for k in keywords):
        return None
    return item


def _validate_top_offender(item: Any) -> dict | None:
    """校验 LLM 输出的高频错误卡片项：缺 flashcardId 时返回 None（过滤）。"""
    if not isinstance(item, dict):
        return None
    flashcard_id = item.get("flashcardId")
    if not isinstance(flashcard_id, str) or not flashcard_id:
        return None
    try:
        count = int(item.get("count", 0))
    except (TypeError, ValueError):
        # GW-2#3: count 非数字时容错为 0，而非让 pydantic 抛 500
        count = 0
    # GW-3: 负数 count 无业务意义，归一为 0
    if count < 0:
        count = 0
    return {"flashcardId": flashcard_id, "count": count}


def _filter_patterns(patterns_data: list) -> list[PatternItem]:
    """GW-3: 过滤合法模式项并构造 PatternItem（首次请求与缓存命中共用）。
    缺字段/类型非法的项丢弃并计数告警，不再让 pydantic 严格构造抛 500。"""
    result: list[PatternItem] = []
    dropped = 0
    for p in patterns_data:
        validated = _validate_pattern_item(p)
        if validated is not None:
            result.append(PatternItem(**validated))
        else:
            dropped += 1
    if dropped > 0:
        logger.warning(
            "错误模式分析: %d 条模式项因缺字段被过滤（LLM 输出质量问题）",
            dropped,
        )
    return result


@router.post("/error-pattern", response_model=ErrorPatternResponse, summary="分析黄金错误模式")
async def error_pattern(request: Request, body: ErrorPatternRequest) -> ErrorPatternResponse:
    """
    分析黄金错误记录，识别错误模式并给出改进建议

    - 使用通义千问 qwen-plus 模型 + JSON Mode
    - 支持最多 20 条错误记录分析
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("错误模式分析请求: user=%s, errors_count=%d", user_id, len(body.goldenErrors))

    # 生成 AI 响应缓存键（基于输入错误记录）
    # GW-2#10: 缓存键加入 user_id 隔离——错误模式分析结果基于用户私有
    # 学习数据，原键不含用户维度，内容相同的不同用户会串用彼此的分析结论
    #（隐私泄露 + 正确性错误）；同时不再截断 50 字符（sha256 本身压缩长度）
    # GW-3(X5): 键仅含 chain 实际消费的字段（前 20 条 correctAnswer/userAnswer，
    # flashcardId 不参与分析）——原键含 flashcardId 与全量文本，同内容不同
    # flashcardId 不命中缓存，命中率低（多付 AI 调用成本）
    errors_str = "|".join([
        f"{e.correctAnswer}:{e.userAnswer}"
        for e in body.goldenErrors[:20]
    ])
    cache_key = hashlib.sha256(f"{user_id}:{errors_str}".encode()).hexdigest()

    # 检查 Redis AI 响应缓存
    cache = get_cache()
    if cache._client is not None:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("错误模式分析缓存命中: user=%s", user_id)
            # GW-3: 缓存中可能是未清洗的原始 LLM 输出（历史写入）——命中路径
            # 同样逐项校验过滤，缺字段项不再抛 ValidationError（原实现命中
            # 直接 ErrorPatternResponse(**cached) 严格构造 → 500）
            cached_patterns = _filter_patterns(cached.get("patterns", []))
            cached_offenders = [
                TopOffender(**v) for o in cached.get("top_offenders", [])
                if (v := _validate_top_offender(o)) is not None
            ]
            return ErrorPatternResponse(
                patterns=cached_patterns,
                top_offenders=cached_offenders,
                summary=cached.get("summary", "暂无总结"),
                model=cached.get("model", "unknown"),
                tokens_used=cached.get("tokens_used", 0),
            )

    # 通过 fallback 链自动选择 Provider 并在失败时重试/降级
    async def _run_chain(provider, model_name):
        chain = ErrorPatternChain(provider=provider, model=model_name)
        return await chain.run(
            golden_errors=[{
                "flashcardId": e.flashcardId,
                "correctAnswer": e.correctAnswer,
                "userAnswer": e.userAnswer,
            } for e in body.goldenErrors],
        )

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "error_pattern", request, _run_chain
        )

        patterns_data = chain_result.get("patterns", [])
        top_offenders_data = chain_result.get("top_offenders", [])
        summary = chain_result.get("summary", "暂无总结")
        model_used = chain_result.get("model", "unknown")
        tokens_used = chain_result.get("tokens_used", 0)

        logger.info("错误模式分析完成: provider=%s, patterns=%d, top_offenders=%d", 
                    used_provider, len(patterns_data), len(top_offenders_data))

    except RuntimeError as e:
        logger.error("错误模式分析服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    # 缓存成功结果（Redis 可用时）——fallback 结果不入缓存，避免 AI 恢复后 1 小时内持续失效
    # GW-3: 写缓存前清洗 LLM 输出（过滤缺字段项），后续命中路径无需再依赖严格构造
    if cache._client is not None and chain_result.get("model") != "fallback":
        cleaned = {
            **chain_result,
            "patterns": [p for p in patterns_data if _validate_pattern_item(p) is not None],
            "top_offenders": [o for o in top_offenders_data if _validate_top_offender(o) is not None],
        }
        await cache.set_ai_cache(cache_key, cleaned, expire=3600)

    # 构建响应对象
    # GW-2#3: LLM 输出逐项校验+过滤，缺字段项不导致 500（截断/格式漂移降级）
    # GW-3: 过滤逻辑提取到 _filter_patterns（与缓存命中路径共用）
    patterns = _filter_patterns(patterns_data)

    top_offenders = []
    for o in top_offenders_data:
        validated = _validate_top_offender(o)
        if validated is not None:
            top_offenders.append(TopOffender(**validated))

    return ErrorPatternResponse(
        patterns=patterns,
        top_offenders=top_offenders,
        summary=summary,
        model=model_used,
        tokens_used=tokens_used,
    )
