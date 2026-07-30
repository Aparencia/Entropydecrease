"""
熵减 AI 网关 — 多模态课堂分析路由

POST /api/v1/multimodal/analyze-session
POST /api/v1/multimodal/merge-notes
（/analyze-video 端点见 multimodal_video.py，经 include_router 挂载）

@ai-context Path B 服务端入口：客户端上传关键帧序列 + 语音转写 →
多模态模型联合分析 → 返回结构化 Markdown 课堂笔记。
超时配置 120s（多图 + 长文本生成，需要充裕的等待窗口）。
@ai-context 请求/响应模型见 multimodal_schemas.py；视频分析端点见
multimodal_video.py（本文件以 include_router 统一挂载前缀）。
"""

import time
import logging

from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.multimodal_analyze_chain import MultimodalAnalyzeChain
from prompts.session_analyze import MERGE_NOTES_SYSTEM_PROMPT, build_merge_prompt
from utils.text_dedup import dedup_paragraphs
from routers.multimodal_schemas import (
    AnalyzeSessionRequest,
    AnalyzeSessionResponse,
    MergeNotesRequest,
    MergeNotesResponse,
)
from routers.multimodal_video import router as video_router

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/multimodal", tags=["多模态分析"])


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/analyze-session",
    response_model=AnalyzeSessionResponse,
    summary="多模态课堂分析",
)
async def analyze_session(
    request: Request,
    body: AnalyzeSessionRequest,
) -> AnalyzeSessionResponse:
    """
    分析课堂关键帧和语音，生成结构化 Markdown 笔记

    - 使用 Qwen-VL-Plus / GLM-4V-Flash 多模态模型联合分析多图
    - 支持最多 100 帧关键帧（超过 20 帧自动分 chunk 并行）
    - 超时 120 秒（多图 + 长文本生成场景）
    - 返回 Markdown 结构化笔记
    """
    start_time = time.monotonic()
    user_id = getattr(request.state, "user_id", "anonymous")

    logger.info(
        "多模态分析请求: user=%s, keyframes=%d, audio_segments=%d, duration=%.1fs, mode=%s",
        user_id, len(body.keyframes), len(body.audio_segments), body.duration, body.mode,
    )

    # ---- 输入校验 ----
    if not body.keyframes:
        raise HTTPException(status_code=400, detail="keyframes 不能为空")

    # 防御性上限：防止超大请求压垮服务端
    if len(body.keyframes) > 100:
        raise HTTPException(
            status_code=400,
            detail=f"keyframes 数量超限（最多 100 帧，当前 {len(body.keyframes)} 帧）",
        )

    # 将所有语音片段的转写文本合并为一段（供 Chain 层使用）
    audio_text_parts: list[str] = []
    for seg in body.audio_segments:
        if seg.audio_text and seg.audio_text.strip():
            ts_start = f"{int(seg.timestamp_start // 60):02d}:{int(seg.timestamp_start % 60):02d}"
            ts_end = f"{int(seg.timestamp_end // 60):02d}:{int(seg.timestamp_end % 60):02d}"
            audio_text_parts.append(f"[{ts_start}–{ts_end}] {seg.audio_text.strip()}")

    audio_text = "\n".join(audio_text_parts) if audio_text_parts else None

    # 构建关键帧 dict 列表（Chain 层接口格式）
    keyframes_data = [
        {
            "timestamp": kf.timestamp,
            "image_base64": kf.image_base64,
            "change_type": kf.change_type,
        }
        for kf in body.keyframes
    ]

    # ---- 通过 fallback 链执行 ----
    async def _run_chain(provider, model_name):
        chain = MultimodalAnalyzeChain(provider=provider, model=model_name)
        return await chain.run(
            keyframes=keyframes_data,
            audio_text=audio_text,
            duration=int(body.duration),
            course_meta=body.course_meta,
            mode=body.mode,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "multimodal_analyze", request, _run_chain
        )
    except RuntimeError as e:
        logger.error("多模态分析服务全部不可用: %s", str(e))
        raise HTTPException(
            status_code=503,
            detail="所有多模态 AI 服务暂时不可用，请稍后重试",
        )

    latency_ms = int((time.monotonic() - start_time) * 1000)

    logger.info(
        "多模态分析完成: provider=%s, model=%s, keyframes=%d, latency=%dms",
        used_provider,
        result.get("model", "unknown"),
        result.get("keyframes_analyzed", 0),
        latency_ms,
    )

    return AnalyzeSessionResponse(
        content=result.get("content", ""),
        keyframes_analyzed=result.get("keyframes_analyzed", len(body.keyframes)),
        model_used=result.get("model", "unknown"),
    )


# ============================================================
# 片段笔记合并端点（增量分析课后整理）
# ============================================================


@router.post(
    "/merge-notes",
    response_model=MergeNotesResponse,
    summary="合并片段笔记",
)
async def merge_notes(
    request: Request,
    body: MergeNotesRequest,
) -> MergeNotesResponse:
    """
    将多个增量分析片段合并为完整结构化笔记（纯文本，无图片）

    - 使用文本模型（非视觉模型），超时 30s
    - 去重、统一结构、补充衔接、保留细节
    """
    start_time = time.monotonic()
    user_id = getattr(request.state, "user_id", "anonymous")

    logger.info(
        "片段笔记合并请求: user=%s, partials=%d, duration=%.1fs",
        user_id, len(body.partials), body.duration,
    )

    if not body.partials:
        raise HTTPException(status_code=400, detail="partials 不能为空")

    # 只有一个片段时直接返回，无需调用模型
    if len(body.partials) == 1:
        return MergeNotesResponse(
            content=body.partials[0].strip(),
            model_used="none (single partial)",
        )

    # 构建合并 prompt
    merge_prompt = build_merge_prompt(
        partials=body.partials,
        duration_seconds=int(body.duration),
    )

    # 通过 fallback 链执行（纯文本生成，用文本模型）
    async def _run_merge(provider, model_name):
        result = await provider.generate(
            prompt=merge_prompt,
            system_prompt=MERGE_NOTES_SYSTEM_PROMPT,
            model=model_name,
            temperature=0.3,
            max_tokens=4096,
        )
        return result

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "summarize", request, _run_merge
        )
    except RuntimeError as e:
        logger.error("片段笔记合并服务不可用: %s", str(e))
        raise HTTPException(
            status_code=503,
            detail="AI 服务暂时不可用，请稍后重试",
        )

    latency_ms = int((time.monotonic() - start_time) * 1000)
    logger.info(
        "片段笔记合并完成: provider=%s, model=%s, latency=%dms",
        used_provider, result.get("model", "unknown"), latency_ms,
    )

    # 清理模型输出（去除可能的代码块围栏）
    content = result.get("content", "").strip()
    if content.startswith("```markdown"):
        content = content[len("```markdown"):].strip()
        if content.endswith("```"):
            content = content[:-3].strip()
    elif content.startswith("```") and content.endswith("```"):
        inner = content[3:].strip()
        if inner.endswith("```"):
            inner = inner[:-3].strip()
        if "```" not in inner:
            content = inner

    # @ai-context 模型合并后仍可能残留重复段落，做一次段落级 Jaccard 去重兜底
    # (paragraph-level dedup as safety net after model merge)
    content = dedup_paragraphs(content)

    return MergeNotesResponse(
        content=content,
        model_used=result.get("model", "unknown"),
    )


# ============================================================
# 挂载视频分析子路由（/analyze-video）
# ============================================================

router.include_router(video_router)
