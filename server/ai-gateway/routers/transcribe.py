"""
熵减 AI 网关 — ASR 语音转写路由

POST /api/v1/asr/transcribe
调用 Qwen3-ASR-Flash / GLM-ASR 等 ASR 模型将语音转写为文本。

@ai-context: 语音转写路由：音频转文字（Qwen3-ASR-Flash/GLM-ASR），经 fallback 链。
fallback 降级时通过 warning 字段透传提示，客户端据此识别失败而非静默当作"无语音"。
"""

import time
import logging

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.transcribe_chain import TranscribeChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/asr", tags=["语音转写"])


# ============================================================
# 请求/响应模型
# ============================================================


class TranscribeRequest(BaseModel):
    """语音转写请求"""
    # GW-M15: base64 上限 32M 字符（约 24MB 音频）——Qwen3-ASR-Flash 官方
    # 编码后 ≤10MB，此处放宽以兼容 WAV 高采样率；超大载荷由中间件前缀上限兜底
    audio_base64: str = Field(..., min_length=1, max_length=32_000_000, description="PCM/WAV 音频 base64 编码")
    language: str = Field(default="zh", max_length=16, description="语言代码：zh/en/auto")
    sample_rate: int = Field(default=16000, ge=8000, le=96000, description="采样率")
    channels: int = Field(default=1, ge=1, le=2, description="声道数")


class TranscribeSegment(BaseModel):
    """转写时间片段"""
    start: float = Field(default=0.0, description="开始时间（秒）")
    end: float = Field(default=0.0, description="结束时间（秒）")
    text: str = Field(default="", description="片段文本")


class TranscribeResponse(BaseModel):
    """语音转写响应"""
    text: str = Field(..., description="转写文本")
    segments: list[TranscribeSegment] = Field(default_factory=list, description="时间分段列表")
    language: str = Field(..., description="检测到的语言")
    confidence: float = Field(..., description="置信度 0-1")
    model_used: str = Field(..., description="使用的模型名称")
    processing_time_ms: int = Field(..., description="请求耗时（毫秒）")
    warning: str | None = Field(default=None, description="降级提示（fallback 时透传，客户端据此识别失败）")


# ============================================================
# 路由处理
# ============================================================


@router.post("/transcribe", response_model=TranscribeResponse, summary="语音转文字")
async def transcribe_audio(request: Request, body: TranscribeRequest) -> TranscribeResponse:
    """
    将音频数据转写为文本

    - 优先使用阿里云 Qwen3-ASR-Flash（OpenAI 兼容模式，低延迟中文 ASR）
    - 备选 GLM-ASR
    - 返回转写文本、时间分段、置信度
    """
    start_time = time.monotonic()
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "ASR 转写请求: user=%s, audio_size=%d chars, language=%s",
        user_id, len(body.audio_base64), body.language,
    )

    # 校验音频数据非空
    if not body.audio_base64.strip():
        raise HTTPException(status_code=400, detail="audio_base64 不能为空")

    # 通过 fallback 链自动选择 Provider 并在失败时降级
    async def _run_chain(provider, model_name):
        chain = TranscribeChain(provider=provider, model=model_name)
        return await chain.run(
            audio_base64=body.audio_base64,
            language=body.language,
            sample_rate=body.sample_rate,
            channels=body.channels,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "transcribe", request, _run_chain
        )
    except RuntimeError as e:
        logger.error("ASR 服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 ASR 服务暂时不可用，请稍后重试")

    latency_ms = result.get("latency_ms", int((time.monotonic() - start_time) * 1000))

    # 构建 segments 列表
    raw_segments = result.get("segments", [])
    segments = [
        TranscribeSegment(
            start=float(seg.get("start", 0.0)),
            end=float(seg.get("end", 0.0)),
            text=str(seg.get("text", "")),
        )
        for seg in raw_segments
        if isinstance(seg, dict)
    ]

    logger.info(
        "ASR 转写完成: provider=%s, model=%s, text_length=%d, confidence=%.2f",
        used_provider, result.get("model", "unknown"),
        len(result.get("text", "")), result.get("confidence", 0.0),
    )

    # fallback 降级时透传 warning，供客户端识别失败（而非静默当作"无语音"）
    warning = result.get("warning") or (
        "ASR 服务降级，转写结果不可用" if result.get("model") == "fallback" else None
    )

    return TranscribeResponse(
        text=result.get("text", ""),
        segments=segments,
        language=result.get("language", body.language),
        confidence=result.get("confidence", 0.0),
        model_used=result.get("model", "unknown"),
        processing_time_ms=latency_ms,
        warning=warning,
    )
