"""
熵减 AI 网关 — 自定义异常

统一异常体系，便于在异常处理器中映射到对应 HTTP 状态码。

@ai-context: 统一异常体系：AIError 基类派生出 Provider 不可用/模型响应/限流/鉴权等异常，各自映射 HTTP 状态码，由 main 全局处理器转 JSON。
"""


class AIError(Exception):
    """AI 服务通用异常基类"""

    def __init__(self, message: str, status_code: int = 500, detail: dict | None = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail or {}
        super().__init__(message)


class ProviderUnavailableError(AIError):
    """Provider 不可用（网络故障、API 下线等）"""

    def __init__(self, provider: str, reason: str = ""):
        super().__init__(
            message=f"AI 服务暂时不可用（{provider}）：{reason}",
            status_code=503,
            detail={"provider": provider, "reason": reason},
        )


class RateLimitExceededError(AIError):
    """频率限制超限"""

    def __init__(self, feature: str, limit: int):
        super().__init__(
            message=f"今日 {feature} 功能使用次数已达上限（{limit} 次），请明天再试",
            status_code=429,
            detail={"feature": feature, "limit": limit},
        )


class ModelResponseError(AIError):
    """模型返回异常响应（格式错误、内容审核等）"""

    def __init__(self, model: str, reason: str = ""):
        super().__init__(
            message=f"模型响应异常（{model}）：{reason}",
            status_code=502,
            detail={"model": model, "reason": reason},
        )


class AuthenticationError(AIError):
    """认证失败"""

    def __init__(self, reason: str = "无效的认证凭据"):
        super().__init__(
            message=reason,
            status_code=401,
            detail={"reason": reason},
        )
