"""
熵减 AI 网关 — Provider 熔断器

@ai-context: 每个 Provider 独立熔断器实例，连续失败超阈值后快速失败（OPEN），
冷却期后进入 HALF_OPEN 试探，成功则恢复 CLOSED。与 KeyPool 联动：
熔断开启时标记当前 Key 不可用，避免浪费请求配额。
@ai-context: 全局注册表 circuit_registry 供 fallback 链查询 Provider 是否可用，
跳过已熔断的 Provider 以节省超时预算。
"""

import asyncio
import logging
import time
from enum import Enum

logger = logging.getLogger(__name__)


class CircuitState(str, Enum):
    CLOSED = "closed"        # 正常放行
    OPEN = "open"            # 熔断（快速失败）
    HALF_OPEN = "half_open"  # 试探恢复


class CircuitOpenError(Exception):
    """熔断器开启时抛出"""

    def __init__(self, provider: str, remaining_cooldown: float):
        self.provider = provider
        self.remaining_cooldown = remaining_cooldown
        super().__init__(
            f"Provider [{provider}] 熔断中，剩余冷却 {remaining_cooldown:.0f}s"
        )


class CircuitBreaker:
    """Provider 级熔断器

    状态机：
        CLOSED --[连续失败 >= threshold]--> OPEN
        OPEN --[冷却期过后]--> HALF_OPEN
        HALF_OPEN --[成功]--> CLOSED
        HALF_OPEN --[失败]--> OPEN（重置冷却计时）
    """

    def __init__(
        self,
        provider: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 60.0,
        half_open_max_calls: int = 2,
    ):
        self.provider = provider
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float = 0.0
        self._half_open_calls = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        """获取当前状态（含 OPEN→HALF_OPEN 自动转换）"""
        if self._state == CircuitState.OPEN:
            elapsed = time.time() - self._last_failure_time
            if elapsed >= self.recovery_timeout:
                return CircuitState.HALF_OPEN
        return self._state

    @property
    def is_available(self) -> bool:
        """是否允许请求通过"""
        return self.state != CircuitState.OPEN

    async def before_call(self) -> None:
        """调用前检查，熔断时抛出 CircuitOpenError"""
        state = self.state
        if state == CircuitState.OPEN:
            remaining = self.recovery_timeout - (time.time() - self._last_failure_time)
            raise CircuitOpenError(self.provider, max(remaining, 0))

        if state == CircuitState.HALF_OPEN:
            async with self._lock:
                if self._half_open_calls >= self.half_open_max_calls:
                    raise CircuitOpenError(self.provider, 1.0)
                self._half_open_calls += 1

    async def on_success(self) -> None:
        """调用成功回调"""
        async with self._lock:
            if self._state == CircuitState.OPEN or self.state == CircuitState.HALF_OPEN:
                logger.info("CircuitBreaker [%s]: HALF_OPEN → CLOSED（恢复正常）", self.provider)
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count += 1
            self._half_open_calls = 0

    async def on_failure(self) -> None:
        """调用失败回调"""
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self.state == CircuitState.HALF_OPEN:
                # 试探失败，重新熔断
                self._state = CircuitState.OPEN
                self._half_open_calls = 0
                logger.warning(
                    "CircuitBreaker [%s]: HALF_OPEN → OPEN（试探失败，重新熔断 %ds）",
                    self.provider, self.recovery_timeout,
                )
            elif self._failure_count >= self.failure_threshold:
                self._state = CircuitState.OPEN
                logger.warning(
                    "CircuitBreaker [%s]: CLOSED → OPEN（连续失败 %d 次，熔断 %ds）",
                    self.provider, self._failure_count, self.recovery_timeout,
                )

    def get_stats(self) -> dict:
        """获取熔断器统计信息"""
        return {
            "provider": self.provider,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "success_count": self._success_count,
            "last_failure_time": self._last_failure_time,
        }


# ============================================================
# 全局熔断器注册表
# ============================================================

circuit_registry: dict[str, CircuitBreaker] = {}


def init_circuit_breakers(
    providers: list[str],
    failure_threshold: int = 5,
    recovery_timeout: float = 60.0,
) -> None:
    """为所有 Provider 初始化熔断器"""
    global circuit_registry
    for provider in providers:
        circuit_registry[provider] = CircuitBreaker(
            provider=provider,
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
        )
    logger.info("CircuitBreaker: 已为 %d 个 Provider 初始化熔断器", len(providers))


def get_circuit(provider: str) -> CircuitBreaker | None:
    """获取 Provider 的熔断器"""
    return circuit_registry.get(provider)


def is_provider_available(provider: str) -> bool:
    """检查 Provider 是否可用（未熔断）"""
    cb = circuit_registry.get(provider)
    if cb is None:
        return True  # 未注册熔断器的 Provider 默认可用
    return cb.is_available
