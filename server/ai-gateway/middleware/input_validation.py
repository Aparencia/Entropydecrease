"""
熵减 AI 网关 — 输入验证中间件

对 AI 端点的请求体进行大小和字段长度限制：
- Content-Length ≤ 1MB
- 文本字段 ≤ 50000 字符
- 超限返回 HTTP 422

@ai-context: 输入校验中间件：对请求体做基础合法性与体积防御，拦截明显恶意载荷。
"""

import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# 需要输入验证的路径前缀
VALIDATED_PATHS = ("/api/v1/ai/",)

# 限制常量
MAX_CONTENT_LENGTH = 1 * 1024 * 1024  # 1MB
MAX_TEXT_FIELD_LENGTH = 50000  # 字符


class InputValidationMiddleware(BaseHTTPMiddleware):
    """AI 端点输入长度限制中间件"""

    async def dispatch(self, request: Request, call_next):
        # 仅对 AI 功能 API 进行输入验证
        if not request.url.path.startswith(VALIDATED_PATHS):
            return await call_next(request)

        # 仅检查有请求体的方法
        if request.method in ("POST", "PUT", "PATCH"):
            # 检查 Content-Length 头
            content_length = request.headers.get("content-length")
            if content_length and int(content_length) > MAX_CONTENT_LENGTH:
                return JSONResponse(
                    status_code=422,
                    content={
                        "detail": f"request body exceeds {MAX_CONTENT_LENGTH} bytes (max 1MB)",
                    },
                )

            # 解析 JSON 请求体并检查文本字段
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    body = await request.json()
                    validation_error = self._check_fields(body, "")
                    if validation_error:
                        return JSONResponse(
                            status_code=422,
                            content={"detail": validation_error},
                        )
                except Exception:
                    # JSON 解析失败交给后续路由处理
                    pass

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
