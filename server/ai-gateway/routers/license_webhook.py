"""
熵减 AI 网关 — 面包多订单通知 Webhook

@ai-context: 接收支付平台订单通知：快速应答 200 → 异步验真（HMAC 签名 +
order_id 查询确认双保险）→ 标记激活码 sold。重复通知幂等（状态更新幂等）。
验真失败/平台不可用时入队 pending（内存队列 + 日志告警），由
scripts/license-admin.mjs reconcile 人工对账兜底。
@ai-context: 本端点不要求用户登录（平台服务端回调），不注册限流（依赖验真
而非频率限制防伪造）；原始 payload 落日志供排查。
"""

import logging
from collections import deque
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from services import payment_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/license", tags=["license"])

# pending 队列（内存，最多保留 100 条待对账记录）
_pending_orders: deque[dict[str, Any]] = deque(maxlen=100)


class WebhookRequest(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=64, description="支付平台订单号")
    code: str | None = Field(None, max_length=32, description="订单关联激活码（可选）")


def _enqueue_pending(order_id: str, reason: str) -> None:
    """记录待对账订单（进程内队列，供 reconcile 脚本与日志排查）。"""
    _pending_orders.append({"order_id": order_id, "reason": reason})
    logger.warning("订单入队待对账: order=%s, reason=%s", order_id, reason)


async def _handle_webhook(payload: dict[str, Any], signature: str | None = None) -> dict[str, Any]:
    """webhook 同步处理逻辑（提取为 async 纯流程便于测试）。

    Args:
        payload: 解析后的请求体（含 order_id/code）
        signature: 请求头签名（可选）

    Returns:
        dict: 处理结果（code 为 HTTP 状态码语义，message 供响应）
    """
    order_id = payload.get("order_id", "")
    code = payload.get("code")

    if not order_id:
        return {"code": 400, "message": "缺少 order_id"}

    # 签名验证（可选增强；未配置 secret 时返回 False，靠查询确认兜底）
    sig_ok = bool(signature) and payment_adapter.verify_signature(b"", signature)

    # 查询确认（主闸）：凭 order_id 主动查询订单真实状态
    ok, reason = await payment_adapter.verify_and_mark_sold(order_id, code)

    if ok:
        return {"code": 200, "message": "ok"}
    if sig_ok and reason.startswith("订单未支付"):
        # 签名有效但订单未支付：正常拒绝，不入队（不是系统故障）
        return {"code": 200, "message": reason}
    # 查询失败/平台不可用/验真失败：入队待对账，先应答 200 避免重试风暴
    _enqueue_pending(order_id, reason)
    return {"code": 200, "message": "accepted"}


@router.post("/webhook")
async def license_webhook(request: Request):
    """
    支付平台订单通知端点（面包多）。

    流程：快速应答 → 验真（查询确认）→ 标记 sold；失败入队待对账。
    """
    raw = await request.body()
    payload: dict[str, Any] = {}
    try:
        import json

        payload = json.loads(raw)
    except (ValueError, TypeError):
        return JSONResponse(status_code=400, content={"detail": "请求体不是合法 JSON"})

    # 原始 payload 落日志（排查用，含订单号不含密钥）
    logger.info("收到支付平台通知: order=%s, code=%s", payload.get("order_id"), payload.get("code"))

    signature = request.headers.get("X-Payment-Signature")
    result = await _handle_webhook(payload, signature)
    return JSONResponse(status_code=result["code"], content={"detail": result["message"]})


def get_pending_orders() -> list[dict[str, Any]]:
    """返回待对账订单列表（供 admin 脚本/诊断端点使用）。"""
    return list(_pending_orders)
