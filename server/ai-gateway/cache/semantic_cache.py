"""
熵减 AI 网关 — 语义缓存（L2）

@ai-context: 在精确 hash 缓存（L1）之上，提供基于文本相似度的语义缓存（L2）。
使用轻量级字符级 n-gram 指纹计算相似度（无需外部 embedding 模型依赖），
相似度超过阈值时命中缓存。适用于 prompt 微变但语义相同的场景。
@ai-context: 当前实现为内存 LRU（进程级），后续可升级为 Redis + RediSearch
向量索引。设计为可选增强：未启用时不影响现有 L1 精确缓存。
"""

import hashlib
import logging
import time
from collections import OrderedDict
from typing import Any

logger = logging.getLogger(__name__)

# 语义缓存配置
SEMANTIC_CACHE_MAX_SIZE = 200       # 最大缓存条目数
SEMANTIC_CACHE_TTL_SECONDS = 1800   # 默认 TTL（30 分钟）
SIMILARITY_THRESHOLD = 0.85         # 相似度命中阈值


def _ngram_fingerprint(text: str, n: int = 3) -> set[str]:
    """计算文本的字符级 n-gram 指纹集合

    用于快速相似度估算（Jaccard 系数）。
    比 embedding 轻量，适合网关侧低延迟场景。
    """
    # 归一化：去空白、转小写
    normalized = "".join(text.lower().split())
    if len(normalized) < n:
        return {normalized}
    return {normalized[i:i + n] for i in range(len(normalized) - n + 1)}


def jaccard_similarity(set_a: set[str], set_b: set[str]) -> float:
    """计算两个集合的 Jaccard 相似度"""
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


class SemanticCacheEntry:
    """语义缓存条目"""

    __slots__ = ("fingerprint", "prompt_hash", "response", "created_at", "ttl", "feature")

    def __init__(self, fingerprint: set[str], prompt_hash: str, response: dict, feature: str, ttl: int):
        self.fingerprint = fingerprint
        self.prompt_hash = prompt_hash
        self.response = response
        self.feature = feature
        self.created_at = time.time()
        self.ttl = ttl

    @property
    def is_expired(self) -> bool:
        return (time.time() - self.created_at) > self.ttl


class SemanticCache:
    """语义缓存（L2）— 基于 n-gram Jaccard 相似度

    特性：
    - LRU 淘汰 + TTL 过期
    - 按 feature 隔离（不同功能的缓存不互相命中）
    - 相似度阈值可配置
    - 线程安全（单进程 asyncio 环境下无需锁）
    """

    def __init__(
        self,
        max_size: int = SEMANTIC_CACHE_MAX_SIZE,
        default_ttl: int = SEMANTIC_CACHE_TTL_SECONDS,
        threshold: float = SIMILARITY_THRESHOLD,
    ):
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.threshold = threshold
        self._store: OrderedDict[str, SemanticCacheEntry] = OrderedDict()
        self._hits = 0
        self._misses = 0

    def get(self, prompt: str, feature: str) -> dict[str, Any] | None:
        """尝试语义匹配缓存

        Args:
            prompt: 用户 prompt 文本
            feature: 功能标识（隔离不同功能）

        Returns:
            缓存的响应 dict，未命中返回 None
        """
        query_fp = _ngram_fingerprint(prompt)
        best_score = 0.0
        best_key: str | None = None

        for key, entry in self._store.items():
            # 过期清理
            if entry.is_expired:
                del self._store[key]
                continue
            # 功能隔离
            if entry.feature != feature:
                continue
            # 相似度计算
            score = jaccard_similarity(query_fp, entry.fingerprint)
            if score > best_score:
                best_score = score
                best_key = key

        if best_key and best_score >= self.threshold:
            # LRU：移到末尾
            self._store.move_to_end(best_key)
            self._hits += 1
            entry = self._store[best_key]
            logger.debug(
                "SemanticCache HIT: feature=%s, similarity=%.3f, age=%.0fs",
                feature, best_score, time.time() - entry.created_at,
            )
            return entry.response

        self._misses += 1
        return None

    def put(self, prompt: str, feature: str, response: dict, ttl: int | None = None) -> None:
        """写入语义缓存

        Args:
            prompt: 用户 prompt 文本
            feature: 功能标识
            response: AI 响应 dict
            ttl: 过期时间（秒），None 使用默认值
        """
        prompt_hash = hashlib.sha256(prompt.encode()).hexdigest()[:16]
        fingerprint = _ngram_fingerprint(prompt)
        actual_ttl = ttl or self.default_ttl

        # LRU 淘汰
        while len(self._store) >= self.max_size:
            self._store.popitem(last=False)

        self._store[prompt_hash] = SemanticCacheEntry(
            fingerprint=fingerprint,
            prompt_hash=prompt_hash,
            response=response,
            feature=feature,
            ttl=actual_ttl,
        )

    @property
    def hit_rate(self) -> float:
        """缓存命中率"""
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0

    @property
    def size(self) -> int:
        return len(self._store)

    def get_stats(self) -> dict:
        """获取缓存统计"""
        return {
            "size": self.size,
            "max_size": self.max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": round(self.hit_rate, 3),
            "threshold": self.threshold,
        }

    def clear(self) -> None:
        """清空缓存"""
        self._store.clear()
        self._hits = 0
        self._misses = 0


# ============================================================
# 全局单例
# ============================================================

_semantic_cache: SemanticCache | None = None


def get_semantic_cache() -> SemanticCache:
    """获取全局语义缓存实例"""
    global _semantic_cache
    if _semantic_cache is None:
        _semantic_cache = SemanticCache()
    return _semantic_cache
