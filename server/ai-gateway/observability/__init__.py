"""
熵减 AI 网关 — 可观测性包

@ai-context: 提供 Prometheus 指标采集和 OpenTelemetry 追踪能力。
metrics 为轻量级内置指标（无需额外依赖时降级为日志输出），
tracing 为可选 OTel 集成（需安装 opentelemetry-sdk）。
"""

from observability.metrics import (  # noqa: F401
    record_ai_request,
    record_ai_latency,
    record_ai_tokens,
    get_metrics_snapshot,
)
