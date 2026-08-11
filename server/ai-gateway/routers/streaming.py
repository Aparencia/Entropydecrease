"""
熵减 AI 网关 — 流式输出路由（SSE）

为全部 19 个 AI 功能提供 /stream SSE 端点。
格式：data: {"chunk": "..."}\n\n
结束：data: [DONE]\n\n
错误：data: {"error": "..."}\n\n

@ai-context: 流式输出路由（SSE）：以 Server-Sent Events 流式返回全量 AI 功能结果。
@ai-context: P2-13 超时保护——event_generator 以手动 __anext__ + asyncio.wait_for
 enforce 首 token 超时与 chunk 间空闲超时，避免 provider 挂起导致流无限等待；
 超时后下发 error 事件并结束，客户端据此降级非流式。
"""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config import call_with_fallback_stream
from middleware.rate_limit import check_rate_limit, warn_missing_feature_config

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["流式输出"])

# ============================================================
# P2-13 流式超时保护（秒）
# ============================================================
# 首 token 超时：从开始到第一个 chunk 的最长等待（含模型冷启动/排队）
_FIRST_TOKEN_TIMEOUT = 30.0
# chunk 间空闲超时：相邻 chunk 的最长间隔（防中途挂起）
_CHUNK_IDLE_TIMEOUT = 30.0
# 流式端点总体存活时间上限（秒），超时后强制结束
_MAX_STREAM_DURATION = 300.0

# ============================================================
# Prompt 模板目录
# ============================================================

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

# 功能 → (prompt模板文件名, system_prompt)
_FEATURE_PROMPT_REGISTRY: dict[str, dict] = {
    "summarize": {
        "template": "summarize_v1.txt",
        "system": "你是一个专业的学习笔记摘要助手，擅长从学习内容中提取核心知识点并生成结构化摘要。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 1024,
    },
    "generate-cards": {
        "template": "card_gen_v1.txt",
        "system": "你是一个专业的闪卡生成助手。请严格按照 JSON 格式输出。",
        "temperature": 0.3,
        "max_tokens": 2048,
    },
    "evaluate-explanation": {
        "template": "evaluation_v1.txt",
        "system": "你是一个专业的费曼学习评估助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 2048,
    },
    "recommend-duration": {
        "template": "recommend_v1.txt",
        "system": "你是一个番茄钟学习助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 512,
    },
    "tag-content": {
        "template": "tag_content_v1.txt",
        "system": "你是一个内容分类助手。请严格按照 JSON 格式输出。",
        "temperature": 0.2,
        "max_tokens": 512,
    },
    "optimize-card": {
        "template": "optimize_card_v1.txt",
        "system": "你是一个闪卡优化助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 1024,
    },
    "sort-inspiration": {
        "template": "sort_inspiration_v1.txt",
        "system": "你是一个灵感分拣助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 1024,
    },
    "feynman-question": {
        "template": "feynman_question_v1.txt",
        "system": "你是一个费曼学习法追问助手。请用中文输出。",
        "temperature": 0.5,
        "max_tokens": 1024,
    },
    "feynman-evaluate-answers": {
        "template": "feynman_evaluate_v1.txt",
        "system": "你是一个费曼学习回答评估助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 2048,
    },
    "anchor-point": {
        "template": "anchor_point_v1.txt",
        "system": "你是一个知识锚点提取助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 1024,
    },
    "socratic": {
        "template": "socratic_v1.txt",
        "system": "你是一个苏格拉底式追问助手，善于引导深度思考。请用中文输出。",
        "temperature": 0.5,
        "max_tokens": 1024,
    },
    "socratic/evaluate": {
        "template": "socratic_evaluate_v1.txt",
        "system": "你是一个苏格拉底式学习评估助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 1024,
    },
    "socratic/deepening": {
        "template": "socratic_deepening_v1.txt",
        "system": "你是一个苏格拉底深化角度生成助手。请用中文输出。",
        "temperature": 0.4,
        "max_tokens": 1024,
    },
    "predict": {
        "template": "predict_v1.txt",
        "system": "你是一个学习预测助手。请用中文输出。",
        "temperature": 0.3,
        "max_tokens": 1024,
    },
    "rescue": {
        "template": "rescue_v1.txt",
        "system": "你是一个学习救援助手，当用户卡住时提供提示。请用中文输出。",
        "temperature": 0.5,
        "max_tokens": 2048,
    },
    "inspiration-draft": {
        "template": "inspiration_draft_v1.txt",
        "system": "你是一个灵感草稿生成助手。请用中文输出。",
        "temperature": 0.5,
        "max_tokens": 2048,
    },
}

# 功能标识 → config.py 中的 feature key（用于 fallback 链查找）
_FEATURE_TO_CONFIG_KEY: dict[str, str] = {
    "summarize": "summarize",
    "generate-cards": "generate_cards",
    "evaluate-explanation": "evaluate",
    "recommend-duration": "recommend",
    "tag-content": "tag_content",
    "optimize-card": "optimize_card",
    "sort-inspiration": "sort_inspiration",
    "feynman-question": "feynman_question",
    "feynman-evaluate-answers": "feynman_evaluate",
    "anchor-point": "anchor_point",
    "socratic": "socratic",
    "socratic/evaluate": "socratic_evaluate",
    "socratic/deepening": "socratic_deepening",
    "predict": "predict",
    "rescue": "rescue",
    "inspiration-draft": "inspiration_draft",
}

# GW-3(X6): 启动校验——流式 feature 同样必须登记 TIMEOUT_CONFIG/RATE_LIMITS
#（原校验只覆盖中间件 PATH_TO_FEATURE，流式注册表漏配不告警）
warn_missing_feature_config(set(_FEATURE_TO_CONFIG_KEY.values()), "streaming")


# ============================================================
# 通用请求体（流式请求统一使用）
# ============================================================


class StreamRequest(BaseModel):
    """通用流式请求体"""
    # 主文本内容（必填）
    text: str = Field(default="", description="主要文本内容")
    # 辅助文本（如 concept、explanation、front/back 等）
    text2: str = Field(default="", description="辅助文本内容")
    # 额外参数（JSON 对象）
    params: dict = Field(default_factory=dict, description="功能特定参数")


# ============================================================
# Prompt 构建辅助函数
# ============================================================


def _load_template(template_name: str) -> str:
    """加载 prompt 模板"""
    template_path = _PROMPTS_DIR / template_name
    if template_path.exists():
        return template_path.read_text(encoding="utf-8")
    logger.warning("Prompt 模板不存在: %s，使用通用模板", template_path)
    return "请根据以下内容完成任务：\n\n{text}"


def _build_prompt(feature: str, body: StreamRequest) -> tuple[str, str, float, int]:
    """
    根据功能构建 prompt 和 system_prompt

    Returns:
        (prompt, system_prompt, temperature, max_tokens)
    """
    feature_cfg = _FEATURE_PROMPT_REGISTRY.get(feature)
    if not feature_cfg:
        raise HTTPException(status_code=404, detail=f"不支持的流式功能: {feature}")

    template_name = feature_cfg["template"]
    system_prompt = feature_cfg["system"]
    temperature = feature_cfg.get("temperature", 0.3)
    max_tokens = feature_cfg.get("max_tokens", 2048)

    template = _load_template(template_name)

    # 通用模板变量注入
    try:
        # 显式分离 param 与保留占位符，防止 params 覆盖 text/text2
        safe_params = {k: str(v) for k, v in body.params.items() if k not in ("text", "text2")}
        prompt = template.format(
            text=body.text[:8000] if body.text else "",
            text2=body.text2[:4000] if body.text2 else "",
            **safe_params,
        )
    except (KeyError, IndexError, ValueError):
        # 模板变量不匹配时，降级为简单拼接
        prompt = f"{template}\n\n{body.text}"
        if body.text2:
            prompt += f"\n\n{body.text2}"

    return prompt, system_prompt, temperature, max_tokens


# ============================================================
# SSE 格式化
# ============================================================


def _sse_chunk(text: str) -> str:
    """格式化 SSE data chunk"""
    payload = json.dumps({"chunk": text}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _sse_error(message: str) -> str:
    """格式化 SSE 错误"""
    payload = json.dumps({"error": message}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _sse_done() -> str:
    """格式化 SSE 结束标记"""
    return "data: [DONE]\n\n"


# ============================================================
# 流式端点
# ============================================================


@router.post("/{feature}/stream", summary="AI 流式输出（SSE）")
async def stream_ai(request: Request, feature: str, body: StreamRequest):
    """
    通用流式 AI 端点

    通过 URL 中的 feature 参数路由到对应的 prompt 模板和 Provider。
    返回 SSE 格式：data: {"chunk": "..."}\n\n
    结束标记：data: [DONE]\n\n
    """
    config_key = _FEATURE_TO_CONFIG_KEY.get(feature)
    if not config_key:
        raise HTTPException(status_code=404, detail=f"不支持的流式功能: {feature}")

    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("流式请求: user=%s, feature=%s, text_length=%d", user_id, feature, len(body.text))

    # GW-H3: 流式通配路径 /{feature}/stream 无法被中间件精确匹配，
    # 此处复用与中间件一致的 Redis 限流逻辑（含功能级 + 全局每日总量）
    is_allowed, detail = await check_rate_limit(user_id, config_key)
    if not is_allowed:
        # GW-2#2: 超限时禁止再次 rollback——Lua 脚本已在超限分支内原子 DECR，
        # 路由层再 rollback 会双重回滚（feature 减到负数、global 被无条件 DECR），
        # 恶意用户可反复刷超限请求把自己的配额刷低甚至清零
        raise HTTPException(status_code=429, detail=detail)

    try:
        prompt, system_prompt, temperature, max_tokens = _build_prompt(feature, body)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("流式 prompt 构建失败: feature=%s, error=%s", feature, str(e))
        raise HTTPException(status_code=400, detail=f"请求参数错误: {e}")

    # 通过 fallback 链获取 provider 的流式生成器
    def _stream_fn(provider, model_name):
        return provider.generate_stream(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model_name,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    try:
        gen, used_provider, is_user_key = await call_with_fallback_stream(
            request.app, config_key, request, _stream_fn
        )
    except RuntimeError as e:
        logger.error("流式服务全部不可用: feature=%s, error=%s", feature, str(e))
        raise HTTPException(status_code=503, detail="所有 AI 服务暂时不可用，请稍后重试")

    async def event_generator() -> AsyncGenerator[str, None]:
        """将 provider 的 async generator 包装为 SSE 事件流（P2-13：带首 token/空闲超时）"""
        start_time = time.monotonic()
        agen = gen.__aiter__()
        is_first = True
        try:
            while True:
                # 客户端断连检测：立即终止并释放上游生成器，避免幽灵计费
                if await request.is_disconnected():
                    logger.info(
                        "流式客户端断连: feature=%s, provider=%s, duration=%.1fs",
                        feature, used_provider, time.monotonic() - start_time,
                    )
                    break
                # 总体存活时间检查
                if time.monotonic() - start_time > _MAX_STREAM_DURATION:
                    logger.error(
                        "流式总体超时: feature=%s, provider=%s, duration=%.1fs > %ds",
                        feature, used_provider, time.monotonic() - start_time, _MAX_STREAM_DURATION,
                    )
                    yield _sse_error(f"AI 响应超时（总体 {int(_MAX_STREAM_DURATION)}s）")
                    break
                timeout = _FIRST_TOKEN_TIMEOUT if is_first else _CHUNK_IDLE_TIMEOUT
                try:
                    chunk_text = await asyncio.wait_for(agen.__anext__(), timeout=timeout)
                except StopAsyncIteration:
                    break
                except asyncio.TimeoutError:
                    phase = "首 token" if is_first else "chunk 间隔"
                    logger.error(
                        "流式超时: feature=%s, provider=%s, %s 超时=%.1fs",
                        feature, used_provider, phase, timeout,
                    )
                    yield _sse_error(f"AI 响应超时（{phase} {timeout:.0f}s）")
                    break
                is_first = False
                if chunk_text:
                    yield _sse_chunk(chunk_text)
            yield _sse_done()
            latency_ms = int((time.monotonic() - start_time) * 1000)
            logger.info(
                "流式完成: feature=%s, provider=%s, latency=%dms",
                feature, used_provider, latency_ms,
            )
        except Exception as e:
            logger.error("流式生成异常: feature=%s, error=%s", feature, str(e))
            yield _sse_error("AI 服务响应异常，请稍后重试")
            yield _sse_done()
        finally:
            # GW-H4: 所有退出路径（完成/超时/断连/异常）必须关闭上游生成器，
            # 否则上游 HTTP 连接保持打开、模型继续生成并按 token 计费（幽灵计费）
            try:
                await agen.aclose()
            except Exception as close_err:
                logger.debug("流式生成器关闭失败（可忽略）: %s", close_err)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 告知 Nginx 不要缓冲
        },
    )
