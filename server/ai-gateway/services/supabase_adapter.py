"""
熵减 AI 网关 — Supabase REST 数据适配层

@ai-context: 网关访问 Supabase 的唯一数据通道（PostgREST + Auth Admin API）。
负责激活码池（licenses 表）查询/状态更新与 user_metadata.paid 写入。
未配置 SUPABASE_URL/SUPABASE_SERVICE_KEY 时进入内存 mock 池模式
（本地开发/测试用，生产必须配置）。
@ai-context: 所有外部调用 5s 超时；Supabase 不可用时返回 None/False
（fail-open 于查询、fail-safe 于写入——调用方负责降级提示）。
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# ============================================================
# 配置（动态读取环境变量，支持测试隔离与运行时调整）
# ============================================================

# PostgREST 请求头模板（service key 绕过 RLS，仅服务端持有）
_TIMEOUT = float(os.getenv("SUPABASE_TIMEOUT_MS", "5000")) / 1000.0


def _config() -> tuple[str, str]:
    """读取 Supabase 连接配置（每次调用动态读取，便于测试 monkeypatch）。"""
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    return url, key


def _headers(key: str) -> dict[str, str]:
    """构造 PostgREST 请求头（含 service key）。"""
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

# ============================================================
# 内存 mock 池（未配置 Supabase 时）
# ============================================================

_mock_pool: dict[str, dict[str, Any]] = {}
_mock_metadata: dict[str, dict[str, Any]] = {}


def _reset_mock_pool() -> None:
    """清空 mock 池（测试隔离用）"""
    _mock_pool.clear()
    _mock_metadata.clear()


def _is_mock_mode() -> bool:
    """未配置 Supabase 连接信息时进入内存 mock 池模式（本地开发/测试）。"""
    url, key = _config()
    return not (url and key)


# ============================================================
# 底层 HTTP 封装（集中超时/异常处理，供测试 monkeypatch）
# ============================================================


async def _http_request(method: str, url: str, json_body: dict | None = None) -> dict | None:
    """执行一次 Supabase REST 请求，失败返回 None（不抛异常）。

    @ai-context: 所有 Supabase 访问的唯一出口；5s 超时，异常统一吞掉并记录日志，
    由调用方决定降级策略（查询降级返回 None，写入降级返回 False）。
    """
    _, key = _config()
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.request(method, url, headers=_headers(key), json=json_body)
            if resp.status_code >= 400:
                logger.warning("Supabase 请求失败: %s %s → %s %s", method, url, resp.status_code, resp.text[:200])
                return None
            if resp.status_code == 204 or not resp.content:
                return {}
            return resp.json()
    except Exception as exc:
        logger.warning("Supabase 请求异常: %s %s → %s", method, url, exc)
        return None


# ============================================================
# 激活码池操作
# ============================================================


async def get_license_by_code(code: str) -> dict[str, Any] | None:
    """按激活码查询池记录；不存在返回 None。"""
    if _is_mock_mode():
        return _mock_pool.get(code)

    data = await _http_request(
        "GET",
        f"{_config()[0]}/rest/v1/licenses?code=eq.{code}&select=*",
    )
    if not data:
        return None
    if isinstance(data, list):
        return data[0] if data else None
    return data


async def list_licenses_by_user(user_id: str) -> list[dict[str, Any]]:
    """查询某用户全部激活码记录（含已绑定与已过期，供 /status 复核与设备数检查）。"""
    if _is_mock_mode():
        return [r for r in _mock_pool.values() if r.get("bound_user_id") == user_id]

    data = await _http_request(
        "GET",
        f"{_config()[0]}/rest/v1/licenses?bound_user_id=eq.{user_id}&select=*",
    )
    if not data:
        return []
    if isinstance(data, list):
        return data
    return [data]


async def mark_license_sold(code: str, order_id: str, buyer_email: str | None = None) -> bool:
    """webhook 确认订单后回填 sold 状态；未知激活码返回 False。"""
    if _is_mock_mode():
        row = _mock_pool.get(code)
        if not row:
            return False
        row["status"] = "sold"
        row["order_id"] = order_id
        row["buyer_email"] = buyer_email
        row["sold_at"] = datetime.now(timezone.utc).isoformat()
        return True

    now = datetime.now(timezone.utc).isoformat()
    patch = {"status": "sold", "order_id": order_id, "buyer_email": buyer_email, "sold_at": now}
    data = await _http_request(
        "PATCH",
        f"{_config()[0]}/rest/v1/licenses?code=eq.{code}",
        json_body=patch,
    )
    return bool(data)


async def bind_license(
    code: str,
    user_id: str,
    machine_id: str,
    expires_at: str,
    quota_balance: int | None = None,
) -> bool:
    """激活绑定：sold → bound，回填用户/设备/到期时间；额度包回填 quota_balance。"""
    if _is_mock_mode():
        row = _mock_pool.get(code)
        if not row:
            return False
        row["status"] = "bound"
        row["bound_user_id"] = user_id
        row["machine_id"] = machine_id
        row["expires_at"] = expires_at
        row["activated_at"] = datetime.now(timezone.utc).isoformat()
        if quota_balance is not None:
            row["quota_balance"] = quota_balance
        return True

    now = datetime.now(timezone.utc).isoformat()
    patch: dict[str, Any] = {
        "status": "bound",
        "bound_user_id": user_id,
        "machine_id": machine_id,
        "expires_at": expires_at,
        "activated_at": now,
    }
    if quota_balance is not None:
        patch["quota_balance"] = quota_balance
    data = await _http_request(
        "PATCH",
        f"{_config()[0]}/rest/v1/licenses?code=eq.{code}",
        json_body=patch,
    )
    return bool(data)


async def list_quota_licenses_by_user(user_id: str) -> list[dict[str, Any]]:
    """查询用户全部额度包激活记录（type 由调用方过滤，此处返回含 quota_balance 的完整行）。"""
    if _is_mock_mode():
        return [
            r for r in _mock_pool.values()
            if r.get("bound_user_id") == user_id and r.get("quota_balance") is not None
        ]

    data = await _http_request(
        "GET",
        f"{_config()[0]}/rest/v1/licenses?bound_user_id=eq.{user_id}&quota_balance=not.is.null&select=*",
    )
    if not data:
        return []
    if isinstance(data, list):
        return data
    return [data]


async def decrement_quota_balance(code: str, count: int) -> bool:
    """条件扣减额度包余额（读-扣-写 + gt.0 条件防并发超扣）；AIINF(-1) 不扣。"""
    if _is_mock_mode():
        row = _mock_pool.get(code)
        if not row or row.get("quota_balance", 0) <= 0:
            return False
        row["quota_balance"] = int(row["quota_balance"]) - count
        return True

    # 读-扣-写：先取当前余额，再带条件更新（quota_balance=gt.0 保证并发下不会扣成负数）
    row = await get_license_by_code(code)
    if not row:
        return False
    current = int(row.get("quota_balance", 0) or 0)
    if current <= 0:
        return False
    data = await _http_request(
        "PATCH",
        f"{_config()[0]}/rest/v1/licenses?code=eq.{code}&quota_balance=gt.0",
        json_body={"quota_balance": current - count},
    )
    return bool(data)


async def revoke_license(code: str) -> bool:
    """撤销激活码（退款/违规处理）；幂等。"""
    if _is_mock_mode():
        row = _mock_pool.get(code)
        if not row:
            return False
        row["status"] = "revoked"
        row["revoked_at"] = datetime.now(timezone.utc).isoformat()
        return True

    now = datetime.now(timezone.utc).isoformat()
    data = await _http_request(
        "PATCH",
        f"{_config()[0]}/rest/v1/licenses?code=eq.{code}",
        json_body={"status": "revoked", "revoked_at": now},
    )
    return bool(data)


# ============================================================
# user_metadata.paid 写入（Auth Admin API）
# ============================================================


async def update_paid_metadata(user_id: str, paid: dict[str, Any]) -> bool:
    """写入/更新用户的 user_metadata.paid（与现有 user_metadata 合并）。"""
    if _is_mock_mode():
        _mock_metadata[user_id] = paid
        return True

    data = await _http_request(
        "PUT",
        f"{_config()[0]}/auth/v1/admin/users/{user_id}",
        json_body={"user_metadata": {"paid": paid}},
    )
    return bool(data)
