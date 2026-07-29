"""
熵减 AI 网关 — 运行时基础设施

@ai-context: 配置包的地基模块。负责 .env 加载、日志器、feature 上下文变量
与 API Key 有效性校验。所有其它配置子模块都依赖本模块，故 __init__.py 必须
最先导入本模块以确保 load_dotenv 在任何 os.getenv 之前执行。
@ai-context: _FEATURE_CONTEXT 用于在 fallback 链路中透传当前 feature 名称，
使 with_retry_and_timeout 装饰器无需改动 router/chain 签名即可按功能超时。
"""

import contextvars
import logging
from pathlib import Path

from dotenv import load_dotenv

# 加载 server/.env（位于 ai-gateway 的上级目录）
_env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

logger = logging.getLogger("config")

# 用于在 fallback 链路中透传当前 feature 名称的上下文变量
_FEATURE_CONTEXT: contextvars.ContextVar[str] = contextvars.ContextVar("_feature", default="")

# ============================================================
# API Key 有效性校验
# ============================================================

PLACEHOLDER_PREFIXES = ("sk-your-", "your-", "change-this", "placeholder")


def is_valid_api_key(key: str) -> bool:
    """检查 API Key 是否为有效配置（非占位符）"""
    return bool(key) and not any(key.startswith(p) for p in PLACEHOLDER_PREFIXES)
