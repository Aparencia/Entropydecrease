"""
熵减 AI 网关 — 结构化 JSON 日志配置

@ai-context: 统一输出 JSON 行日志（timestamp/level/module/message），便于
生产环境日志采集系统解析。日志级别经 LOG_LEVEL 环境变量注入，默认 INFO。
"""

import logging
import os

from pythonjsonlogger import jsonlogger


def setup_json_logging() -> None:
    """配置结构化 JSON 日志"""
    log_handler = logging.StreamHandler()
    log_formatter = jsonlogger.JsonFormatter(
        fmt="%(timestamp)s %(level)s %(module)s %(message)s",
        rename_fields={
            "timestamp": "timestamp",
            "levelname": "level",
            "name": "module",
            "message": "message",
        },
    )
    log_handler.setFormatter(log_formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(log_handler)
    root_logger.setLevel(getattr(logging, os.getenv("LOG_LEVEL", "INFO")))
