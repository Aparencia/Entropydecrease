"""
熵减 AI 网关 —— 知识入籍概念化路由（阶段 A 入口问题）

POST /api/v1/ai/import/concepts
调用 ImportConceptChain 从文本块中提取核心概念，供知识入籍预览编辑。

@ai-context: 知识入籍路由——输入标题 + 文本块，输出概念候选列表；复用
call_with_fallback_for_request 降级链与 Redis 缓存；fallback 空结果不缓存
（避免 AI 恢复后 1 小时内持续静默失效，与 concept_precheck 同构）。
@ai-context: Settling router. Title + text chunks in, concept candidates out.
Shares the fallback chain and Redis cache; fallback results are not cached.
"""
import hashlib
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.import_concept_chain import ImportConceptChain
from cache.redis_cache import get_cache

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["知识入籍"])

# 输入预算（与前端 textChunker 对齐，防 DoS）/ Input budgets (anti-DoS)
MAX_CHUNK_CHARS = 3000
MAX_CHUNKS = 50
MAX_TOTAL_CHARS = 50000


# ============================================================
# 请求/响应模型
# ============================================================


class ImportConceptPayload(BaseModel):
    """知识入籍概念化请求 / Settling request payload"""
    title: str = Field(..., min_length=1, max_length=200, description="来源标题/文件名")
    text_chunks: list[str] = Field(
        ..., min_length=1, max_length=MAX_CHUNKS, description="文本块列表（≤3000 字/块）"
    )


class ConceptCandidateOut(BaseModel):
    """概念候选（与前端 ConceptCandidate 对应） / Concept candidate"""
    name: str = Field(..., description="概念名称")
    summary: str = Field(default="", description="一句话摘要")
    card_front: str = Field(..., description="复习提问（缺省由 name 派生）")
    card_back: str = Field(default="", description="答案要点")


class ImportConceptResult(BaseModel):
    """知识入籍概念化响应 / Settling response"""
    concepts: list[ConceptCandidateOut] = Field(..., description="概念候选列表（可能为空）")
    model: str = Field(..., description="使用的模型名称")
    tokens_used: int = Field(..., description="消耗的 token 数")


# ============================================================
# 路由处理
# ============================================================


@router.post("/import/concepts", response_model=ImportConceptResult, summary="知识入籍概念化")
async def import_concepts(request: Request, body: ImportConceptPayload) -> ImportConceptResult:
    """
    从文本块中提取核心概念（JSON Mode + fallback 链）

    - 输入为已切块的文本（前端 textChunker 产物）
    - 概念为空时前端静默降级为手动建卡（离线优先原则）
    """
    user_id = getattr(request.state, "user_id", "anonymous")

    # 输入校验：单块上限与总量上限（防超长请求拖垮网关）
    for chunk in body.text_chunks:
        if len(chunk) > MAX_CHUNK_CHARS:
            raise HTTPException(
                status_code=400,
                detail=f"文本块超过单块上限 {MAX_CHUNK_CHARS} 字，请重新切块",
            )
    total_chars = sum(len(c) for c in body.text_chunks)
    if total_chars > MAX_TOTAL_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"文本总量超过上限 {MAX_TOTAL_CHARS} 字，请分批导入",
        )

    logger.info(
        "知识入籍请求: user=%s, title=%s, chunks=%d, total_chars=%d",
        user_id, body.title[:60], len(body.text_chunks), total_chars,
    )

    # 缓存键：标题 + 全部文本块（文本块超长时哈希裁剪不影响唯一性）
    cache_key = hashlib.sha256(
        ("import_concept:" + body.title[:200] + "".join(body.text_chunks)[:20000]).encode()
    ).hexdigest()

    cache = get_cache()
    if cache._client is not None:
        cached = await cache.get_ai_cache(cache_key)
        if cached:
            logger.info("知识入籍缓存命中: user=%s", user_id)
            return ImportConceptResult(
                concepts=[ConceptCandidateOut(**c) for c in cached.get("concepts", [])],
                model=cached.get("model", "unknown"),
                tokens_used=cached.get("tokens_used", 0),
            )

    async def _run_chain(provider, model_name):
        chain = ImportConceptChain(provider=provider, model=model_name)
        return await chain.run(
            title=body.title,
            text_chunks=body.text_chunks,
        )

    try:
        chain_result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "import_concept", request, _run_chain
        )
        concepts_data = chain_result.get("concepts", [])
        logger.info("知识入籍完成: provider=%s, concepts=%d", used_provider, len(concepts_data))
    except RuntimeError as e:
        logger.error("知识入籍服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    # 仅缓存有效结果：fallback 空结果入缓存会导致 AI 恢复后 1 小时内持续静默失效
    if cache._client is not None and chain_result.get("model") != "fallback":
        await cache.set_ai_cache(cache_key, chain_result, expire=3600)

    return ImportConceptResult(
        concepts=[ConceptCandidateOut(**c) for c in concepts_data],
        model=chain_result.get("model", "unknown"),
        tokens_used=chain_result.get("tokens_used", 0),
    )
