"""
课伴 AI 网关 — 多模态课堂分析路由

POST /api/v1/multimodal/analyze-session

@ai-context Path B 服务端入口：客户端上传关键帧序列 + 语音转写 →
多模态模型联合分析 → 返回结构化 Markdown 课堂笔记。

超时配置 120s（多图 + 长文本生成，需要充裕的等待窗口）。
"""

import os
import shutil
import tempfile
import time
import logging

from pydantic import BaseModel, Field
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from config import call_with_fallback_for_request
from chains.multimodal_analyze_chain import MultimodalAnalyzeChain
from chains.video_analyze_chain import VideoAnalyzeChain
from prompts.session_analyze import MERGE_NOTES_SYSTEM_PROMPT, build_merge_prompt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/multimodal", tags=["多模态分析"])


# ============================================================
# Pydantic 请求/响应模型
# ============================================================


class KeyFrameInput(BaseModel):
    """单帧关键帧输入"""
    timestamp: float = Field(..., description="帧出现的时间戳（秒）")
    image_base64: str = Field(..., description="PNG/JPEG 图片 base64 编码（不含 data: 前缀）")
    change_type: str = Field(
        default="scene_change",
        description="画面变化类型：scene_change(场景切换) | ppt_flip(PPT翻页) | handwriting(板书手写)",
    )


class AudioSegmentInput(BaseModel):
    """单段语音片段输入"""
    timestamp_start: float = Field(..., description="语音开始时间（秒）")
    timestamp_end: float = Field(..., description="语音结束时间（秒）")
    audio_text: str | None = Field(
        default=None,
        description="语音转写文本（若客户端已完成 ASR 转写则直接传入，省去服务端二次转写）",
    )


class AnalyzeSessionRequest(BaseModel):
    """多模态课堂分析请求

    @ai-context 客户端在课程录制结束后批量上传关键帧和语音片段，
    服务端一次性生成完整的结构化笔记。
    """
    duration: float = Field(..., description="课程总时长（秒）")
    keyframes: list[KeyFrameInput] = Field(..., description="关键帧列表（按时间排序）")
    audio_segments: list[AudioSegmentInput] = Field(
        default_factory=list,
        description="语音片段列表（可选，客户端已转写的文本）",
    )
    output_format: str = Field(default="markdown", description="输出格式：markdown")
    language: str = Field(default="zh-CN", description="输出语言：zh-CN / en-US")
    course_meta: dict | None = Field(
        default=None,
        description="课程元数据（可选，含 course_name/subject/custom_terms）",
    )


class AnalyzeSessionResponse(BaseModel):
    """多模态课堂分析响应"""
    content: str = Field(..., description="Markdown 格式的课堂笔记内容")
    keyframes_analyzed: int = Field(..., description="实际分析的关键帧数量")
    model_used: str = Field(..., description="实际使用的模型名称")


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
        "多模态分析请求: user=%s, keyframes=%d, audio_segments=%d, duration=%.1fs",
        user_id, len(body.keyframes), len(body.audio_segments), body.duration,
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


class MergeNotesRequest(BaseModel):
    """片段笔记合并请求"""
    partials: list[str] = Field(..., description="片段笔记列表（按时间顺序）")
    duration: float = Field(default=0, description="课程总时长（秒）")
    language: str = Field(default="zh-CN", description="输出语言")


class MergeNotesResponse(BaseModel):
    """片段笔记合并响应"""
    content: str = Field(..., description="合并后的 Markdown 笔记")
    model_used: str = Field(..., description="实际使用的模型")


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

    return MergeNotesResponse(
        content=content,
        model_used=result.get("model", "unknown"),
    )


# ============================================================
# 视频分析端点
# ============================================================

# 视频文件上传大小上限：500MB
_VIDEO_MAX_SIZE = 500 * 1024 * 1024


class AnalyzeVideoResponse(BaseModel):
    """视频分析响应"""
    content: str = Field(..., description="Markdown 格式的视频分析笔记")
    duration_analyzed: int = Field(..., description="分析的视频时长（秒）")
    model_used: str = Field(..., description="实际使用的模型名称")


@router.post(
    "/analyze-video",
    response_model=AnalyzeVideoResponse,
    summary="视频课堂分析",
)
async def analyze_video(
    request: Request,
    video_file: UploadFile = File(..., description="视频文件上传（mp4/webm/mkv，≤500MB）"),
    duration: float = Form(..., description="视频时长（秒）"),
    language: str = Form(default="zh-CN", description="输出语言：zh-CN / en-US"),
) -> AnalyzeVideoResponse:
    """
    上传视频文件并分析，生成结构化 Markdown 课堂笔记

    - 优先使用 Gemini 原生视频分析
    - 降级为 Qwen-VL 抽帧多图分析
    - 超时 300 秒（视频处理耗时较长）
    """
    start_time = time.monotonic()
    user_id = getattr(request.state, "user_id", "anonymous")

    logger.info(
        "视频分析请求: user=%s, filename=%s, duration=%.1fs",
        user_id, video_file.filename, duration,
    )

    # ---- 文件大小校验 ----
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _VIDEO_MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"视频文件超过大小上限（500MB，当前 {int(content_length) // 1024 // 1024}MB）",
        )

    # ---- 保存上传文件到临时目录 ----
    tmp_dir = tempfile.mkdtemp(prefix="keban_video_")
    suffix = os.path.splitext(video_file.filename or "video.mp4")[1] or ".mp4"
    tmp_path = os.path.join(tmp_dir, f"video{suffix}")

    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(video_file.file, f)

        file_size = os.path.getsize(tmp_path)
        if file_size > _VIDEO_MAX_SIZE:
            raise HTTPException(status_code=413, detail="视频文件超过 500MB 上限")

        logger.info("视频已保存: path=%s, size=%dMB", tmp_path, file_size // 1024 // 1024)

        # ---- 通过 fallback 链执行 ----
        async def _run_video_chain(provider, model_name):
            chain = VideoAnalyzeChain(provider=provider, model=model_name)
            return await chain.run(
                video_input=tmp_path,
                duration=int(duration),
                language=language,
            )

        try:
            result, used_provider, is_user_key = await call_with_fallback_for_request(
                request.app, "video_analyze", request, _run_video_chain
            )
        except RuntimeError as e:
            logger.error("视频分析服务全部不可用: %s", str(e))
            raise HTTPException(
                status_code=503,
                detail="所有视频分析 AI 服务暂时不可用，请稍后重试",
            )

        latency_ms = int((time.monotonic() - start_time) * 1000)

        logger.info(
            "视频分析完成: provider=%s, model=%s, duration=%ds, latency=%dms",
            used_provider,
            result.get("model", "unknown"),
            int(duration),
            latency_ms,
        )

        return AnalyzeVideoResponse(
            content=result.get("content", ""),
            duration_analyzed=result.get("duration_analyzed", int(duration)),
            model_used=result.get("model", "unknown"),
        )

    finally:
        # 清理临时文件
        shutil.rmtree(tmp_dir, ignore_errors=True)
