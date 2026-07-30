"""
熵减 AI 网关 — 多模态路由：视频课堂分析端点

@ai-context: 从 routers/multimodal.py 拆出的 Path C 视频分析端点。
优先 Gemini 原生视频分析，降级 Qwen-VL 抽帧多图分析；超时 300s。
上传视频先落临时目录（entropydecrease_video_ 前缀），分析后 finally 清理。
文件大小双重校验（content-length 头 + 落盘后实际大小），上限 500MB。
本文件 router 无 prefix，由 multimodal.py 统一挂载 /api/v1/multimodal 前缀。
"""

import os
import shutil
import tempfile
import time
import logging

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from config import call_with_fallback_for_request
from chains.video_analyze_chain import VideoAnalyzeChain
from routers.multimodal_schemas import AnalyzeVideoResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["多模态分析"])

# 视频文件上传大小上限：500MB
_VIDEO_MAX_SIZE = 500 * 1024 * 1024


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
    tmp_dir = tempfile.mkdtemp(prefix="entropydecrease_video_")
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
