"""
熵减 AI 网关 — OpenTelemetry 追踪集成（可选）

@ai-context: 提供 W3C Trace Context 传播和 span 创建能力。
若安装了 opentelemetry-sdk 则启用真实追踪，否则降级为 no-op。
路由层通过 trace_span 上下文管理器包裹 AI 调用即可自动记录。
@ai-context: 追踪后端通过 OTEL_EXPORTER_OTLP_ENDPOINT 环境变量配置，
未配置时仅记录到日志（不导出）。
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Any

logger = logging.getLogger(__name__)

# 尝试导入 OpenTelemetry
try:
    from opentelemetry import trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.trace import StatusCode

    _HAS_OTEL = True

    # 初始化 TracerProvider
    _resource = Resource.create({"service.name": "entropydecrease-ai-gateway"})
    _provider = TracerProvider(resource=_resource)

    # 如果配置了 OTLP 端点，添加导出器
    _otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if _otlp_endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            from opentelemetry.sdk.trace.export import BatchSpanProcessor

            _exporter = OTLPSpanExporter(endpoint=_otlp_endpoint)
            _provider.add_span_processor(BatchSpanProcessor(_exporter))
            logger.info("OTel: OTLP 导出器已配置 → %s", _otlp_endpoint)
        except ImportError:
            logger.warning("OTel: opentelemetry-exporter-otlp 未安装，仅本地追踪")

    trace.set_tracer_provider(_provider)
    _tracer = trace.get_tracer("ai-gateway")

except ImportError:
    _HAS_OTEL = False
    _tracer = None
    logger.info("opentelemetry-sdk 未安装，追踪降级为日志模式")


@asynccontextmanager
async def trace_span(
    name: str,
    attributes: dict[str, Any] | None = None,
):
    """创建一个追踪 span（异步上下文管理器）

    用法：
        async with trace_span("ai_call", {"feature": "summarize", "provider": "glm"}):
            result = await provider.generate(...)

    未安装 OTel 时降级为日志记录。
    """
    if _HAS_OTEL and _tracer:
        with _tracer.start_as_current_span(name) as span:
            if attributes:
                for k, v in attributes.items():
                    span.set_attribute(k, str(v))
            try:
                yield span
            except Exception as e:
                span.set_status(StatusCode.ERROR, str(e))
                span.record_exception(e)
                raise
    else:
        # 降级：仅记录日志
        import time
        start = time.monotonic()
        try:
            yield None
        except Exception:
            elapsed = (time.monotonic() - start) * 1000
            logger.warning("SPAN_ERROR [%s] %.1fms attrs=%s", name, elapsed, attributes)
            raise
        else:
            elapsed = (time.monotonic() - start) * 1000
            logger.debug("SPAN [%s] %.1fms attrs=%s", name, elapsed, attributes)


def inject_trace_headers(headers: dict[str, str]) -> dict[str, str]:
    """将当前 trace context 注入到请求头（W3C traceparent）"""
    if _HAS_OTEL:
        from opentelemetry.propagate import inject
        inject(headers)
    return headers


def get_trace_id() -> str | None:
    """获取当前 trace ID（用于日志关联）"""
    if _HAS_OTEL:
        span = trace.get_current_span()
        ctx = span.get_span_context()
        if ctx and ctx.trace_id:
            return format(ctx.trace_id, "032x")
    return None
