"""
课伴 AI 网关 — 课程识别端点

POST /api/v1/multimodal/detect-course

@ai-context 可选 AI 模式：客户端采集首帧关键帧后调用此端点，
从截图中推断课程名称、学科、专业术语。
轻量级单图分析，响应 <3s，失败时客户端静默降级到规则模式。
"""

import time
import logging

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/multimodal", tags=["多模态分析"])

# ============================================================
# Prompt
# ============================================================

COURSE_DETECT_SYSTEM = (
    "你是一个课程识别助手。根据课堂截图推断课程信息。"
    "仅输出 JSON，不要添加任何其他文字。"
)

COURSE_DETECT_USER = (
    "根据这张课堂截图，推断课程信息。仅输出 JSON：\n"
    '{"course_name": "...", "subject": "math|physics|cs|english|other", '
    '"suggested_terms": ["...", "..."]}\n'
    "要求：\n"
    "- course_name: 课程名称（如"高等数学""数据结构"），无法判断时留空字符串\n"
    "- subject: 学科分类，仅限 math/physics/cs/english/other\n"
    "- suggested_terms: 列出 3-5 个图中出现的专业术语\n"
    "无法判断时字段留空。"
)


# ============================================================
# 请求/响应模型
# ============================================================


class DetectCourseRequest(BaseModel):
    """课程识别请求"""
    image_base64: str = Field(..., description="关键帧 JPEG base64 编码（不含 data: 前缀）")


class DetectCourseResponse(BaseModel):
    """课程识别响应"""
    course_name: str = Field(default="", description="推断的课程名称")
    subject: str = Field(default="", description="学科分类")
    suggested_terms: list[str] = Field(default_factory=list, description="建议术语列表")


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/detect-course",
    response_model=DetectCourseResponse,
    summary="AI 课程识别（可选）",
)
async def detect_course(
    request: Request,
    body: DetectCourseRequest,
) -> DetectCourseResponse:
    """
    从单张课堂截图推断课程名称、学科、术语

    - 轻量级单图分析，超时 8s
    - 客户端可选启用，失败时静默降级
    """
    import json as json_module

    start_time = time.monotonic()

    if not body.image_base64:
        raise HTTPException(status_code=400, detail="image_base64 不能为空")

    async def _run_detect(provider: AIProvider, model_name: str):
        messages = [
            {"role": "system", "content": COURSE_DETECT_SYSTEM},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{body.image_base64}",
                        },
                    },
                    {"type": "text", "text": COURSE_DETECT_USER},
                ],
            },
        ]

        response = await provider.chat(
            messages=messages,
            model=model_name,
            max_tokens=256,
            temperature=0.1,
        )
        return response

    try:
        result, used_provider, _ = await call_with_fallback_for_request(
            request.app, "multimodal_analyze", request, _run_detect
        )
    except RuntimeError as e:
        logger.warning("课程识别服务不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="AI 服务暂时不可用")

    latency_ms = int((time.monotonic() - start_time) * 1000)

    # 解析模型返回的 JSON
    raw_content = ""
    if isinstance(result, dict):
        raw_content = result.get("content", "")
    elif isinstance(result, str):
        raw_content = result

    # 尝试提取 JSON（模型可能包裹在代码块中）
    raw_content = raw_content.strip()
    if raw_content.startswith("```"):
        lines = raw_content.split("\n")
        raw_content = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        parsed = json_module.loads(raw_content)
    except (json_module.JSONDecodeError, ValueError):
        logger.warning("课程识别 JSON 解析失败: %s", raw_content[:200])
        parsed = {}

    logger.info(
        "课程识别完成: provider=%s, course=%s, subject=%s, latency=%dms",
        used_provider,
        parsed.get("course_name", ""),
        parsed.get("subject", ""),
        latency_ms,
    )

    return DetectCourseResponse(
        course_name=parsed.get("course_name", ""),
        subject=parsed.get("subject", ""),
        suggested_terms=parsed.get("suggested_terms", []),
    )
