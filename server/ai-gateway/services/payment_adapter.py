"""
熵减 AI 网关 — 支付适配层（面包多）

@ai-context: 业务代码（license_webhook）只依赖本模块接口，不直接触碰支付平台：
未来替换 Gumroad/Stripe 仅需重写本模块实现。遵循 third-party-integration.md：
外部调用 5s 超时、失败熔断、平台不可用时降级（pending 队列 + 人工对账兜底）。
@ai-context: webhook 验真采用"双保险"：HMAC 签名（PAYMENT_WEBHOOK_SECRET，平台
支持时）+ order_id 主动查询确认（凭 PAYMENT_API_KEY/SECRET 调平台订单 API）。
未配置平台凭证时进入 mock 模式（本地开发/测试）。
"""

import hashlib
import hmac
import logging
import os
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ============================================================
# 配置（动态读取，支持测试隔离）
# ============================================================

_TIMEOUT = float(os.getenv("PAYMENT_TIMEOUT_MS", "5000")) / 1000.0
_RETRY_COUNT = int(os.getenv("PAYMENT_RETRY_COUNT", "3"))

# 熔断阈值：连续失败 5 次 → 熔断 60s
_CIRCUIT_BREAK_FAILURES = 5
_CIRCUIT_BREAK_SECONDS = 60

# 熔断状态（进程内简单实现，单实例网关够用）
_failure_count = 0
_circuit_open_until = 0.0

# ============================================================
# 内存 mock 订单（未配置平台凭证时）
# ============================================================

_mock_orders: dict[str, dict[str, Any]] = {}


def _reset_mock_orders() -> None:
    """清空 mock 订单（测试隔离用）"""
    _mock_orders.clear()


def _seed_mock_order(order_id: str, code: str, status: str = "paid") -> None:
    """写入一条 mock 订单（测试/本地开发用）"""
    _mock_orders[order_id] = {"order_id": order_id, "code": code, "status": status}


def _provider_configured() -> bool:
    """面包多凭证是否已配置（未配置 → mock 模式）"""
    return bool(
        os.getenv("PAYMENT_PROVIDER") == "mianbaoduo"
        and os.getenv("PAYMENT_API_KEY")
        and os.getenv("PAYMENT_API_SECRET")
    )


# ============================================================
# 熔断控制
# ============================================================

def _circuit_open() -> bool:
    """熔断是否开启"""
    return time.monotonic() < _circuit_open_until


def _record_failure() -> None:
    """记录一次失败；达到阈值开启熔断"""
    global _failure_count, _circuit_open_until
    _failure_count += 1
    if _failure_count >= _CIRCUIT_BREAK_FAILURES:
        _circuit_open_until = time.monotonic() + _CIRCUIT_BREAK_SECONDS
        logger.warning("支付平台熔断开启：连续失败 %d 次，暂停 %ds", _failure_count, _CIRCUIT_BREAK_SECONDS)


def _record_success() -> None:
    """成功后重置失败计数"""
    global _failure_count
    _failure_count = 0


# ============================================================
# 签名验证
# ============================================================

def verify_signature(payload: bytes, signature: str | None) -> bool:
    """HMAC-SHA256 签名验证（PAYMENT_WEBHOOK_SECRET）。

    @ai-context: 未配置 secret 时返回 False（fail-closed）——调用方仍可经
    order_id 查询确认兜底，不依赖签名单点。

    Args:
        payload: 原始请求体字节（HMAC 计算对象）
        signature: 请求头携带的签名

    Returns:
        bool: 签名是否有效
    """
    secret = os.getenv("PAYMENT_WEBHOOK_SECRET", "")
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


# ============================================================
# 订单查询确认（核心验真手段）
# ============================================================

async def query_order(order_id: str) -> dict[str, Any] | None:
    """查询订单真实状态；未支付/不存在/查询失败返回 None。

    @ai-context: 查询确认模式是 webhook 防伪造的主闸：伪造者无法提供真实
    order_id。面包多订单查询 API 的具体路径/参数在适配层收敛，业务层只消费
    {order_id, code, status} 统一结构。

    Args:
        order_id: 订单号（webhook 携带）

    Returns:
        dict | None: 订单信息（status=paid 表示已支付），查询失败返回 None
    """
    if not _provider_configured():
        return _mock_orders.get(order_id)

    if _circuit_open():
        logger.warning("支付平台熔断中，拒绝订单查询: %s", order_id)
        return None

    api_key = os.getenv("PAYMENT_API_KEY", "")
    api_secret = os.getenv("PAYMENT_API_SECRET", "")
    base_url = os.getenv("PAYMENT_API_BASE_URL", "https://api.mianbaoduo.com")
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(
                f"{base_url}/v1/orders/{order_id}",
                params={"api_key": api_key},
                headers={"X-Api-Secret": api_secret},
            )
            if resp.status_code != 200:
                logger.warning("订单查询失败: order=%s → HTTP %s", order_id, resp.status_code)
                _record_failure()
                return None
            data = resp.json()
            _record_success()
            return {
                "order_id": data.get("order_id", order_id),
                "code": data.get("code"),
                "status": data.get("status", "paid"),
            }
    except Exception as exc:
        logger.warning("订单查询异常: order=%s → %s", order_id, exc)
        _record_failure()
        return None


async def verify_and_mark_sold(order_id: str, code: str | None = None) -> tuple[bool, str]:
    """订单查询确认 + 激活码标记 sold（webhook 主流程）。

    Args:
        order_id: 订单号
        code: webhook 携带的激活码（可与查询结果交叉校验）

    Returns:
        tuple: (是否成功, 说明)
    """
    order = await query_order(order_id)
    if not order:
        return False, "订单查询失败或订单不存在"

    if order.get("status") != "paid":
        return False, f"订单未支付（status={order.get('status')}）"

    sold_code = order.get("code") or code
    if not sold_code:
        return False, "订单未关联激活码"

    # 交叉校验：webhook 携带的码与订单实际发卡码一致（防串码）
    if code and sold_code != code:
        return False, "激活码与订单不匹配"

    from services.supabase_adapter import mark_license_sold

    ok = await mark_license_sold(sold_code, order_id=order_id)
    if not ok:
        return False, "激活码池标记失败（激活码不存在或已绑定）"

    logger.info("订单已确认并标记 sold: order=%s, code=%s", order_id, sold_code[:12] + "...")
    return True, "ok"


# ============================================================
# 买家信息提取（Webhook 自动绑定闭环）
# ============================================================


def extract_buyer_info(payload: dict) -> dict:
    """从 webhook payload 提取用户标识信息。

    面包多卡密模式的自定义参数通过回调参数回传（from_user / buyer_email）。
    缺失时返回空 dict，调用方回落手动激活码模式。

    @ai-context: 用户标识不参与签名验真（平台回调原样透传），因此自动绑定
    仅作为体验增强：绑定失败不阻塞订单确认，回落手动激活码流程兜底。

    Args:
        payload: 解析后的 webhook 请求体

    Returns:
        dict: {"user_id": str, "email": str}，均为空串表示无用户标识
    """
    from_user = payload.get("from_user") or ""
    email = payload.get("buyer_email") or payload.get("email") or ""
    return {
        "user_id": from_user,
        "email": email,
    }
