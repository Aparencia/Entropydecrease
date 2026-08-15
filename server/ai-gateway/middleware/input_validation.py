"""
熵减 AI 网关 — 输入验证中间件

对 AI 端点的请求体进行大小和字段长度限制：
- Content-Length ≤ 1MB
- 文本字段 ≤ 50000 字符
- 超限返回 HTTP 422

@ai-context: 输入校验中间件：对请求体做基础合法性与体积防御，拦截明显恶意载荷。
"""

import json
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# 需要输入验证的路径前缀 → 各前缀允许的最大请求体字节数
# GW-H7: 多模态/ASR/视觉端点原不在校验范围，base64 大载荷可致内存 DoS；
# 各前缀按业务实际载荷设定独立上限（文本端点 1MB，多模态 64MB，音频/视觉 32MB）
VALIDATED_PATHS: dict[str, int] = {
    "/api/v1/ai/": 1 * 1024 * 1024,          # 1MB
    "/api/v1/multimodal/": 64 * 1024 * 1024,  # 64MB（多图联合分析，100 帧 × ≤10MB 编码）
    "/api/v1/asr/": 32 * 1024 * 1024,         # 32MB（音频转写）
    "/api/v1/vision/": 32 * 1024 * 1024,      # 32MB（视觉提取）
}

MAX_TEXT_FIELD_LENGTH = 50000  # 字符


class InputValidationMiddleware(BaseHTTPMiddleware):
    """AI 端点输入长度限制中间件"""

    async def dispatch(self, request: Request, call_next):
        # 仅对 AI 功能 API 进行输入验证
        max_content_length = None
        for prefix, limit in VALIDATED_PATHS.items():
            if request.url.path.startswith(prefix):
                max_content_length = limit
                break
        if max_content_length is None:
            return await call_next(request)

        # 仅检查有请求体的方法
        if request.method in ("POST", "PUT", "PATCH"):
            # 检查 Content-Length 头（chunked 编码无此头时跳过，由 JSON 解析兜底）
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    if int(content_length) > max_content_length:
                        return JSONResponse(
                            status_code=413,
                            content={
                                "detail": f"request body exceeds {max_content_length} bytes",
                            },
                        )
                except (ValueError, TypeError):
                    # 畸形 Content-Length 头，忽略该检查（后续 JSON 解析会进一步校验）
                    pass

            # GW-M8: 流式读取请求体并实时计数——chunked 编码（无 Content-Length 头）
            # 无法预检，逐块累计超限立即拒绝，防止大载荷全量读入内存
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body_bytes = bytearray()
                    async for chunk in request.stream():
                        body_bytes.extend(chunk)
                        if len(body_bytes) > max_content_length:
                            return JSONResponse(
                                status_code=413,
                                content={
                                    "detail": f"request body exceeds {max_content_length} bytes",
                                },
                            )
                    if not body_bytes:
                        return await call_next(request)
                    # 缓存回请求对象，保证下游路由仍能读取 body
                    request._body = bytes(body_bytes)
                    body = json.loads(body_bytes)
                    validation_error = self._check_fields(body, "")
                    if validation_error:
                        return JSONResponse(
                            status_code=422,
                            content={"detail": validation_error},
                        )
                except Exception:
                    # JSON 解析失败交给后续路由处理。
                    # GW-SEC: 校验路径异常留痕——静默放行会让长度校验被绕过
                    # 而不可观测（2026-08 审计 C7）。
                    logger.warning(
                        "InputValidation 异常已放行（校验路径需人工关注）: path=%s",
                        request.url.path,
                    )

        return await call_next(request)

    def _check_fields(self, data, prefix: str) -> str | None:
        """
        递归检查 JSON 数据中的文本字段长度。

        Args:
            data: 要检查的数据（dict/list/str/其他）
            prefix: 字段路径前缀（用于错误信息）

        Returns:
            错误信息字符串，或 None 表示通过
        """
        if isinstance(data, str):
            if len(data) > MAX_TEXT_FIELD_LENGTH:
                field_name = prefix or "field"
                return f"{field_name} exceeds {MAX_TEXT_FIELD_LENGTH} characters"
        elif isinstance(data, dict):
            for key, value in data.items():
                field_path = f"{prefix}.{key}" if prefix else key
                error = self._check_fields(value, field_path)
                if error:
                    return error
        elif isinstance(data, list):
            for i, item in enumerate(data):
                field_path = f"{prefix}[{i}]"
                error = self._check_fields(item, field_path)
                if error:
                    return error
        return None
