"""
熵减 AI 网关 —— AI 播客生成器路由

POST /api/v1/ai/podcast
调用 PodcastChain 生成播客脚本。

@ai-context: 播客学习路由——输入主题、材料、场景，输出对话脚本。
"""

import logging
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.podcast_chain import PodcastChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["AI 播客生成器"])


# ============================================================
# 请求/响应模型
# ============================================================


class PodcastRequest(BaseModel):
    topic: str = Field(..., description="播客主题", min_length=1, max_length=500)
    materials: str = Field(default="", description="参考材料", max_length=5000)
    scene: str = Field(default="commute", description="收听场景：commute/workout/bedtime/break")

    @field_validator("topic")
    @classmethod
    def topic_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("主题不能为空白")
        return v.strip()

    @field_validator("scene")
    @classmethod
    def validate_scene(cls, v: str) -> str:
        if v not in ("commute", "workout", "bedtime", "break"):
            raise ValueError("无效的场景，可选：commute/workout/bedtime/break")
        return v


class SegmentItem(BaseModel):
    speaker: str = Field(..., description="说话者：host/guest")
    text: str = Field(..., description="对话内容")
    duration_estimate: int = Field(default=15, description="预计时长（秒）")


class PodcastResponse(BaseModel):
    title: str = Field(..., description="播客标题")
    segments: list[SegmentItem] = Field(default_factory=list, description="对话片段列表")
    summary: str = Field(default="", description="内容总结")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/podcast", response_model=PodcastResponse, summary="AI 播客生成")
async def podcast(request: Request, body: PodcastRequest) -> PodcastResponse:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("播客生成: user=%s, topic=%s, scene=%s", user_id, body.topic[:50], body.scene)

    async def _run_chain(provider, model_name):
        chain = PodcastChain(provider=provider, model=model_name)
        return await chain.run(
            topic=body.topic,
            materials=body.materials,
            scene=body.scene,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "podcast", request, _run_chain
        )
        segments = [
            SegmentItem(
                speaker=seg.get("speaker", ""),
                text=seg.get("text", ""),
                duration_estimate=seg.get("duration_estimate", 15),
            )
            for seg in result.get("segments", [])
        ]
        response = PodcastResponse(
            title=result.get("title", ""),
            segments=segments,
            summary=result.get("summary", ""),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("播客生成完成: provider=%s, segments=%d", used_provider, len(segments))
    except RuntimeError as e:
        logger.warning("播客生成服务不可用，降级响应: %s", str(e))
        response = PodcastResponse(
            title="知识小课堂",
            segments=[
                SegmentItem(speaker="host", text="今天我们来聊聊一个有趣的话题。", duration_estimate=10),
                SegmentItem(speaker="guest", text="是的，这个话题很有意思。", duration_estimate=15),
            ],
            summary="探索新知识",
            status="fallback",
            model="local_rule",
        )
    return response