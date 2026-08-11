"""
熵减 AI 网关 — 多 Key 池化管理

@ai-context: 同一 Provider 支持配置多个 API Key（逗号分隔），通过 Round-Robin
轮询分散供应商侧 RPM/TPM 限速压力。环境变量格式：QWEN_API_KEYS=sk-a,sk-b,sk-c
兼容原有单 Key 变量（QWEN_API_KEY），优先使用复数形式。
@ai-context: KeyPool 线程安全（asyncio.Lock），支持运行时标记 Key 不可用（熔断联动）。
"""

import asyncio
import logging
import os
import time

logger = logging.getLogger(__name__)

# 环境变量映射：provider_key → (复数变量名, 单数变量名)
_KEY_ENV_MAP: dict[str, tuple[str, str]] = {
    "qwen": ("QWEN_API_KEYS", "QWEN_API_KEY"),
    "deepseek": ("DEEPSEEK_API_KEYS", "DEEPSEEK_API_KEY"),
    "glm": ("GLM_API_KEYS", "GLM_API_KEY"),
    "gemini": ("GEMINI_API_KEYS", "GEMINI_API_KEY"),
}

# Key 冷却时间（秒）：被标记不可用后暂时跳过
_KEY_COOLDOWN_SECONDS = 60


class KeyPool:
    """同一 Provider 的多 Key 轮询池

    特性：
    - Round-Robin 轮询分散 RPM 压力
    - 支持标记 Key 暂时不可用（熔断联动）
    - 冷却后自动恢复
    - 兼容单 Key 配置
    """

    def __init__(self, provider: str, keys: list[str]):
        self.provider = provider
        self._keys = [k.strip() for k in keys if k.strip()]
        self._index = 0
        self._lock = asyncio.Lock()
        # key → 不可用到期时间戳
        self._disabled_until: dict[str, float] = {}

    @property
    def size(self) -> int:
        return len(self._keys)

    @property
    def available_count(self) -> int:
        now = time.time()
        return sum(
            1 for k in self._keys
            if self._disabled_until.get(k, 0) <= now
        )

    async def next_key(self) -> str | None:
        """轮询获取下一个可用 Key

        Returns:
            可用的 API Key，全部不可用时返回 None（调用方据此跳过该 Provider）
        """
        if not self._keys:
            return None

        async with self._lock:
            now = time.time()
            # 最多遍历一圈
            for _ in range(len(self._keys)):
                key = self._keys[self._index % len(self._keys)]
                self._index += 1
                if self._disabled_until.get(key, 0) <= now:
                    return key
            # GW-M4: 全部不可用时返回 None 而非冷却中的 Key——
            # 返回冷却 Key 会让调用方对必失败的 Key 发起请求（429 重试风暴）
            logger.warning(
                "KeyPool [%s]: 所有 %d 个 Key 均处于冷却期",
                self.provider, len(self._keys),
            )
            return None

    def mark_unavailable(self, key: str, cooldown: int = _KEY_COOLDOWN_SECONDS) -> None:
        """标记 Key 暂时不可用（供应商返回 429/401 时调用）"""
        self._disabled_until[key] = time.time() + cooldown
        logger.warning(
            "KeyPool [%s]: Key ...%s 标记不可用 %ds（剩余可用 %d/%d）",
            self.provider, key[-4:], cooldown,
            self.available_count - 1, self.size,
        )

    def mark_available(self, key: str) -> None:
        """恢复 Key 可用状态"""
        self._disabled_until.pop(key, None)

    def get_all_keys(self) -> list[str]:
        """获取所有 Key（用于健康检查）"""
        return list(self._keys)


# ============================================================
# 全局 Key 池注册表
# ============================================================

_pools: dict[str, KeyPool] = {}


def load_key_pools() -> dict[str, KeyPool]:
    """从环境变量加载所有 Provider 的 Key 池

    优先读取复数变量（逗号分隔），不存在时回退到单数变量。
    """
    global _pools
    _pools = {}

    for provider_key, (plural_env, singular_env) in _KEY_ENV_MAP.items():
        raw = os.getenv(plural_env, "")
        if not raw:
            # 兼容单 Key 变量
            single = os.getenv(singular_env, "")
            if single:
                raw = single

        if raw:
            keys = [k.strip() for k in raw.split(",") if k.strip()]
            _pools[provider_key] = KeyPool(provider_key, keys)
            logger.info(
                "KeyPool [%s]: 加载 %d 个 Key",
                provider_key, len(keys),
            )
        else:
            logger.warning("KeyPool [%s]: 未配置任何 API Key", provider_key)

    return _pools


def get_key_pool(provider: str) -> KeyPool | None:
    """获取指定 Provider 的 Key 池"""
    return _pools.get(provider)


def get_primary_key(provider: str) -> str:
    """获取 Provider 的主 Key（兼容原有单 Key 逻辑）

    用于 Provider 初始化时的 api_key 参数。
    """
    pool = _pools.get(provider)
    if pool and pool.size > 0:
        return pool.get_all_keys()[0]
    return ""
