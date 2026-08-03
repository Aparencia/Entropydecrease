"""
熵减 AI 网关 — Prometheus 风格指标采集

@ai-context: 轻量级内存指标采集，不强制依赖 prometheus_client。
若安装了 prometheus_client 则注册真实 Counter/Histogram/Gauge，
否则降级为内存字典计数（通过 /health/metrics 端点暴露 JSON）。
@ai-context: 路由层在 AI 调用前后调用 record_* 函数即可，
无需关心底层是 Prometheus 还是内存计数。
"""

import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# 尝试导入 prometheus_client
try:
    from prometheus_client import Counter, Histogram, Gauge

    _HAS_PROMETHEUS = True

    ai_requests_total = Counter(
        "ai_gateway_requests_total",
        "Total AI requests",
        ["feature", "provider", "status"],
    )
    ai_latency_seconds = Histogram(
        "ai_gateway_latency_seconds",
        "AI request latency",
        ["feature", "provider"],
        buckets=[0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    )
    ai_tokens_total = Counter(
        "ai_gateway_tokens_total",
        "Total tokens consumed",
        ["feature", "model", "direction"],
    )
    ai_provider_health = Gauge(
        "ai_gateway_provider_health",
        "Provider health (1=healthy, 0=unhealthy)",
        ["provider"],
    )
    ai_circuit_state = Gauge(
        "ai_gateway_circuit_state",
        "Circuit breaker state (0=closed, 1=open, 2=half_open)",
        ["provider"],
    )

except ImportError:
    _HAS_PROMETHEUS = False
    logger.info("prometheus_client 未安装，指标降级为内存计数")

# ============================================================
# 内存降级计数器
# ============================================================

_memory_counters: dict[str, int] = defaultdict(int)
_memory_latency_sum: dict[str, float] = defaultdict(float)
_memory_latency_count: dict[str, int] = defaultdict(int)


def record_ai_request(feature: str, provider: str, status: str) -> None:
    """记录一次 AI 请求（成功/失败/降级）"""
    if _HAS_PROMETHEUS:
        ai_requests_total.labels(feature=feature, provider=provider, status=status).inc()
    else:
        _memory_counters[f"requests:{feature}:{provider}:{status}"] += 1


def record_ai_latency(feature: str, provider: str, latency_seconds: float) -> None:
    """记录 AI 请求延迟"""
    if _HAS_PROMETHEUS:
        ai_latency_seconds.labels(feature=feature, provider=provider).observe(latency_seconds)
    else:
        key = f"latency:{feature}:{provider}"
        _memory_latency_sum[key] += latency_seconds
        _memory_latency_count[key] += 1


def record_ai_tokens(feature: str, model: str, input_tokens: int, output_tokens: int) -> None:
    """记录 token 消耗"""
    if _HAS_PROMETHEUS:
        ai_tokens_total.labels(feature=feature, model=model, direction="input").inc(input_tokens)
        ai_tokens_total.labels(feature=feature, model=model, direction="output").inc(output_tokens)
    else:
        _memory_counters[f"tokens:{feature}:{model}:input"] += input_tokens
        _memory_counters[f"tokens:{feature}:{model}:output"] += output_tokens


def set_provider_health(provider: str, healthy: bool) -> None:
    """设置 Provider 健康状态"""
    if _HAS_PROMETHEUS:
        ai_provider_health.labels(provider=provider).set(1 if healthy else 0)
    else:
        _memory_counters[f"health:{provider}"] = 1 if healthy else 0


def set_circuit_state(provider: str, state_value: int) -> None:
    """设置熔断器状态（0=closed, 1=open, 2=half_open）"""
    if _HAS_PROMETHEUS:
        ai_circuit_state.labels(provider=provider).set(state_value)
    else:
        _memory_counters[f"circuit:{provider}"] = state_value


def get_metrics_snapshot() -> dict:
    """获取内存指标快照（供 /health/metrics 端点使用）"""
    latency_avg = {}
    for key, total in _memory_latency_sum.items():
        count = _memory_latency_count.get(key, 1)
        latency_avg[key] = round(total / max(count, 1), 3)

    return {
        "backend": "prometheus" if _HAS_PROMETHEUS else "memory",
        "counters": dict(_memory_counters),
        "latency_avg": latency_avg,
    }
