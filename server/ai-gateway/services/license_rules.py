"""
熵减 AI 网关 — 激活码规则层（纯函数，无副作用）

@ai-context: 激活码状态机判定与到期计算的唯一权威实现：
unsold → sold → bound → revoked；续费叠加 max(now, old) + duration。
纯函数层不依赖任何外部服务，可安全重构与单测。
"""

from datetime import datetime, timedelta, timezone
from typing import Any


# 各类型激活码的设备绑定上限（一码多设备权益）
MAX_DEVICES: dict[str, int] = {
    "pro": 2,
    "lifetime": 3,
    "snd1": 1,
    "thm1": 1,
}


def compute_expires_at(
    current: str | None,
    duration_days: int,
    now: datetime | None = None,
) -> datetime:
    """计算激活后的到期时间（续费叠加规则）。

    @ai-context: 纯函数。续费时有效期在旧到期日基础上顺延，避免"提前续费亏天数"；
    旧记录为空或已过期时从当前时间起算。

    Args:
        current: 旧到期时间（ISO 8601 字符串），可为空
        duration_days: 激活码时长（天，以池记录为准）
        now: 当前时间（测试注入用），默认 UTC now

    Returns:
        datetime: 新的到期时间（UTC）
    """
    base = now or datetime.now(timezone.utc)
    if current:
        try:
            old = datetime.fromisoformat(current.replace("Z", "+00:00"))
            if old > base:
                base = old
        except ValueError:
            # 旧记录格式异常视为无旧有效期
            pass
    return base + timedelta(days=duration_days)


def check_bindable(
    row: dict[str, Any] | None,
    user_id: str,
    machine_id: str,
    bound_devices: list[str] | None = None,
    now: datetime | None = None,
) -> tuple[bool, str]:
    """检查激活码是否可绑定到 (user_id, machine_id)。

    @ai-context: 纯函数。状态机判定：
    - 不存在/unsold/revoked → 拒绝
    - sold（未绑定）→ 允许首次激活
    - bound + 同用户同设备 → 幂等允许（返回现有有效期）
    - bound + 同用户不同设备 → 设备数 < 上限才允许（多设备权益）
    - bound + 其他用户 → 拒绝（一码一主）
    - bound + 已过期 → 拒绝（过期码需购买新码）

    Args:
        row: 激活码池记录（None 表示不存在）
        user_id: 激活用户 ID
        machine_id: 设备标识
        bound_devices: 该用户同类型已绑定设备列表（不含当前设备）
        now: 当前时间（测试注入用）

    Returns:
        tuple: (是否可绑定, 拒绝原因或空串)
    """
    if not row:
        return False, "激活码不存在"

    status = row.get("status")
    if status == "revoked":
        return False, "激活码已被撤销"
    if status == "unsold":
        return False, "激活码尚未售出，无法激活"
    if status == "sold":
        return True, ""

    # status == "bound"：检查既有绑定
    if row.get("bound_user_id") != user_id:
        return False, "激活码已被其他用户绑定"

    base = now or datetime.now(timezone.utc)
    expires_at = row.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at.replace("Z", "+00:00")) <= base:
                return False, "激活码已过期"
        except ValueError:
            return False, "激活码有效期数据异常"

    # 同设备幂等（重复激活返回成功，沿用现有有效期）
    if row.get("machine_id") == machine_id:
        return True, ""

    # 跨设备：受设备上限约束（bound_devices 不含当前设备，+1 为本次绑定）
    license_type = row.get("type", "pro")
    max_devices = MAX_DEVICES.get(license_type, 1)
    if len(bound_devices or []) + 1 > max_devices:
        return False, f"激活码设备数已达上限（{max_devices} 台）"

    return True, ""
