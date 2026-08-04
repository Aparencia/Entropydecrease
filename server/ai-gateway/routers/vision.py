"""
熵减 AI 网关 — 视觉提取路由

POST /api/v1/vision/extract
调用多模态模型（GLM-4V-Flash / Qwen-VL-Plus）从截图中提取学习内容。

@ai-context: 视觉提取路由：单图多模态识别（板书/PPT），经 fallback 链。
"""

import time
import logging

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Request

from config import call_with_fallback_for_request
from chains.vision_extract_chain import VisionExtractChain

# 单张图片 base64 上限：10 MB（约 7.5 MB 二进制）
MAX_IMAGE_BASE64_CHARS = 10 * 1024 * 1024

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/vision", tags=["视觉提取"])


# ============================================================
# 请求/响应模型
# ============================================================


class VisionExtractRequest(BaseModel):
    """视觉提取请求"""
    image_base64: str = Field(..., description="PNG 图片 base64 编码（不含 data: 前缀）")
    prompt: str = Field(default="", description="可选的自定义提示词")
    language: str = Field(default="zh", description="识别语言：zh/en")
    mode: str = Field(
        default="auto",
        description="提取模式：auto(自动) | text(纯文本) | formula(公式) | diagram(图表) | code(代码) | full(全量)",
    )


class VisionExtractResponse(BaseModel):
    """视觉提取响应"""
    text: str = Field(..., description="提取的纯文本内容")
    formulas: list[str] = Field(default_factory=list, description="LaTeX 公式列表")
    diagrams: list[str] = Field(default_factory=list, description="图表描述列表")
    key_points: list[str] = Field(default_factory=list, description="关键要点列表")
    code_blocks: list[dict] = Field(default_factory=list, description="代码块列表 [{language, code}]")
    concepts: list[str] = Field(default_factory=list, description="识别到的概念和术语")
    confidence: float = Field(default=0.9, description="提取置信度 (0-1)")
    model_used: str = Field(..., description="使用的模型名称")
    processing_time_ms: int = Field(..., description="请求耗时（毫秒）")
    mode: str = Field(default="auto", description="实际使用的提取模式")


# ============================================================
# 路由处理
# ============================================================


@router.post("/extract", response_model=VisionExtractResponse, summary="视觉内容提取")
async def extract_vision(request: Request, body: VisionExtractRequest) -> VisionExtractResponse:
    """
    从截图中提取学习内容

    - 使用 GLM-4V-Flash（免费）/ Qwen-VL-Plus 多模态模型
    - 返回结构化提取结果：文本、公式、图表、要点
    - 支持自定义提示词覆盖默认提取策略
    """
    start_time = time.monotonic()
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "视觉提取请求: user=%s, image_size=%d chars",
        user_id, len(body.image_base64),
    )

    # 去除可能存在的 data URI 前缀
    image_base64 = body.image_base64.strip()
    if image_base64.startswith("data:image"):
        image_base64 = image_base64.split(",", 1)[-1]

    # 校验 base64 数据非空且大小合理
    if not image_base64:
        raise HTTPException(status_code=400, detail="image_base64 不能为空")
    if len(image_base64) > MAX_IMAGE_BASE64_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"图片过大（{len(image_base64)} 字符），请压缩后重试"
        )

    request_id = getattr(request.state, "request_id", "unknown")
    logger.info(
        "视觉提取请求: user=%s, request_id=%s, image_size=%d chars",
        user_id, request_id, len(image_base64),
    )

    # 通过 fallback 链自动选择 Provider 并在失败时降级
    async def _run_chain(provider, model_name):
        chain = VisionExtractChain(provider=provider, model=model_name)
        return await chain.run(
            image_base64=image_base64,
            custom_prompt=body.prompt,
            language=body.language,
            mode=body.mode,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "vision_extract", request, _run_chain
        )
    except RuntimeError as e:
        logger.error("视觉提取服务全部不可用: %s", str(e))
        raise HTTPException(status_code=503, detail="所有视觉 AI 服务暂时不可用，请稍后重试")

    latency_ms = result.get("latency_ms", int((time.monotonic() - start_time) * 1000))

    # 从结构化结果中提取字段
    structured = result.get("structured", {})
    text = structured.get("text", result.get("content", ""))
    formulas = structured.get("formulas", [])
    diagrams = structured.get("diagrams", [])
    key_points = structured.get("keyPoints", [])
    code_blocks = structured.get("codeBlocks", [])
    concepts = structured.get("concepts", [])

    # 确保列表类型安全
    if not isinstance(formulas, list):
        formulas = []
    if not isinstance(diagrams, list):
        diagrams = []
    if not isinstance(key_points, list):
        key_points = []
    if not isinstance(code_blocks, list):
        code_blocks = []
    if not isinstance(concepts, list):
        concepts = []

    # GW-2#11: confidence 语义定义为"结构化提取完整度"而非模型置信度——
    # 原实现按文本是否非空硬编码 0.9/0.3，数值无统计意义且误导前端
    #（低质量识别也显示 0.9）。完整度 = text 权重 0.5 + 辅助字段
    #（公式/图表/要点/代码/概念）非空比例权重 0.5，反映解析覆盖度
    filled_text = 1.0 if text.strip() else 0.0
    aux_fields = [formulas, diagrams, key_points, code_blocks, concepts]
    aux_filled = sum(1 for v in aux_fields if v) / len(aux_fields)
    confidence = round(filled_text * 0.5 + aux_filled * 0.5, 2)

    # 实际使用的模式
    effective_mode = result.get("mode", body.mode or "auto")

    logger.info(
        "视觉提取完成: provider=%s, model=%s, mode=%s, text_length=%d",
        used_provider, result.get("model", "unknown"), effective_mode, len(text),
    )

    return VisionExtractResponse(
        text=text,
        formulas=formulas,
        diagrams=diagrams,
        key_points=key_points,
        code_blocks=code_blocks,
        concepts=concepts,
        confidence=confidence,
        model_used=result.get("model", "unknown"),
        processing_time_ms=latency_ms,
        mode=effective_mode,
    )
