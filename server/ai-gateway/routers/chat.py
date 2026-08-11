"""
熵减 AI 网关 — 学伴对话路由（SSE 流式）

POST /api/v1/ai/chat/stream
接收用户消息 + 历史 + 场景上下文，流式返回 AI 回复。

@ai-context: 学伴对话端点——独立于通用 streaming.py 的专用路由，
注入动态性格 system prompt + scene 语气微调；历史窗口由客户端裁剪后传入。
"""

import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config import call_with_fallback_stream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["学伴对话"])

# ============================================================
# 超时保护（秒）
# ============================================================
_FIRST_TOKEN_TIMEOUT = 30.0
_CHUNK_IDLE_TIMEOUT = 30.0
# 流式端点总体存活时间上限（秒），超时后强制结束
_MAX_STREAM_DURATION = 300.0

# ============================================================
# System Prompt
# ============================================================

_BASE_SYSTEM_PROMPT = """你是「深潜伙伴」，熵减学习应用中的 AI 学伴。
性格：动态适应——学习时专业严谨、休息时轻松幽默、低谷时温暖鼓励。
原则：
- 奖赏回来，不惩罚离开：永远正向鼓励，不批评用户中断
- 觉察 > 管控：提供建议而非指令，尊重用户自主权
- 简洁有力：回复控制在 3-5 句，除非用户要求展开
- 费曼精神：引导用户自己思考，而非直接给答案"""

_SCENE_TONE: dict[str, str] = {
    "study": "\n当前场景：用户正在专注学习，语气专业、简洁、聚焦。",
    "break": "\n当前场景：用户正在休息，语气轻松、幽默、关怀。",
    "idle": "\n当前场景：用户似乎有些迷茫或无聊，语气温和、启发、不施压。",
    "review": "\n当前场景：用户正在复习，语气鼓励、肯定进步、提醒薄弱点。",
}


# ============================================================
# 请求体
# ============================================================

class ChatHistoryItem(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str

class SystemContext(BaseModel):
    personality: str = "dynamic_adaptive"
    scene: str = "study"
    user_profile_summary: Optional[str] = None

class ChatStreamRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=40)
    system_context: SystemContext = Field(default_factory=SystemContext)


# ============================================================
# SSE 格式化
# ============================================================

def _sse_chunk(text: str) -> str:
    return f"data: {json.dumps({'chunk': text}, ensure_ascii=False)}\n\n"

def _sse_error(message: str) -> str:
    return f"data: {json.dumps({'error': message}, ensure_ascii=False)}\n\n"

def _sse_done() -> str:
    return "data: [DONE]\n\n"


# ============================================================
# 端点
# ============================================================

@router.post("/chat/stream")
async def chat_stream(body: ChatStreamRequest, request: Request):
    """学伴对话流式端点"""
    start = time.time()

    # 构建 system prompt
    system_prompt = _BASE_SYSTEM_PROMPT
    system_prompt += _SCENE_TONE.get(body.system_context.scene, "")
    if body.system_context.user_profile_summary:
        system_prompt += f"\n用户学习画像：{body.system_context.user_profile_summary}"

    # 拼接为单 prompt（适配现有 provider.generate_stream 接口）
    prompt = body.message
    if body.history:
        history_text = "\n".join(
            f"{'用户' if h.role == 'user' else '助手'}：{h.content}" for h in body.history[-20:]
        )
        prompt = f"以下是之前的对话：\n{history_text}\n\n用户最新消息：{body.message}"

    logger.info("[chat] Stream start: msg_len=%d, history=%d, scene=%s",
                len(body.message), len(body.history), body.system_context.scene)

    # 通过 fallback 链获取 provider 的流式生成器
    def _stream_fn(provider, model_name):
        return provider.generate_stream(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model_name,
            temperature=0.7,
            max_tokens=1024,
        )

    try:
        gen, used_provider, is_user_key = await call_with_fallback_stream(
            request.app, "chat", request, _stream_fn
        )
    except RuntimeError as e:
        logger.error("[chat] 流式服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    async def event_generator() -> AsyncGenerator[str, None]:
        agen = None
        try:
            agen = gen.__aiter__()
            is_first = True
            start_time = time.time()

            while True:
                # 总体存活时间检查
                if time.time() - start_time > _MAX_STREAM_DURATION:
                    logger.error(
                        "[chat] 流式总体超时: provider=%s, duration=%.1fs > %ds",
                        used_provider, time.time() - start_time, _MAX_STREAM_DURATION,
                    )
                    yield _sse_error(f"AI 响应超时（总体 {int(_MAX_STREAM_DURATION)}s）")
                    break
                if await request.is_disconnected():
                    break
                timeout = _FIRST_TOKEN_TIMEOUT if is_first else _CHUNK_IDLE_TIMEOUT
                try:
                    chunk_text = await asyncio.wait_for(agen.__anext__(), timeout=timeout)
                except StopAsyncIteration:
                    break
                except asyncio.TimeoutError:
                    phase = "首 token" if is_first else "chunk 间隔"
                    logger.error("[chat] 流式超时: provider=%s, %s 超时=%.1fs",
                                 used_provider, phase, timeout)
                    yield _sse_error(f"AI 响应超时（{phase} {timeout:.0f}s）")
                    return
                is_first = False
                if chunk_text:
                    yield _sse_chunk(chunk_text)

            yield _sse_done()
            elapsed = time.time() - start
            logger.info("[chat] Stream complete: provider=%s, %.1fs", used_provider, elapsed)

        except Exception as e:
            logger.error("[chat] Stream error: %s", e, exc_info=True)
            yield _sse_error("AI 服务响应异常，请稍后重试")
        finally:
            # GW-H4: 所有退出路径必须关闭上游生成器，释放连接、停止幽灵计费
            if agen is not None:
                try:
                    await agen.aclose()
                except Exception as close_err:
                    logger.debug("[chat] 流式生成器关闭失败（可忽略）: %s", close_err)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
