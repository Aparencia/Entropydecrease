"""
熵减 AI 网关 — 安全头与请求 ID 中间件

@ai-context: 纵深防御——FastAPI 层补充安全头（X-Content-Type-Options /
X-Frame-Options / Referrer-Policy / CSP），与 Nginx 互为补充。HSTS 由 Nginx
独占管理（此处不重复）；X-XSS-Protection 已废弃不再添加。
RequestIdMiddleware 生成/透传 x-request-id 并回写响应头，用于全链路追踪。
"""

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """为每个响应添加安全头（纵深防御，与 Nginx 互为补充）"""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'"
        )
        return response


class RequestIdMiddleware(BaseHTTPMiddleware):
    """为每个请求生成/透传 request_id，并写入响应头"""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        response.headers["ai-gateway-request-id"] = request_id
        return response
