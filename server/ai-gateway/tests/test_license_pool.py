"""
测试激活码规则层（license_rules 纯函数）

覆盖：
- compute_expires_at：无旧记录 / 旧记录未过期叠加 / 旧记录已过期 / 格式异常
- check_bindable：sold 可绑 / unsold 拒绝 / revoked 拒绝 / 不存在拒绝 /
  他用户绑定拒绝 / 同用户同设备幂等 / 跨设备上限 / 已过期拒绝
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from services.license_rules import check_bindable, compute_expires_at

NOW = datetime(2026, 8, 7, 12, 0, 0, tzinfo=timezone.utc)


def _row(**overrides) -> dict:
    base = {
        "code": "ENTROPY-PRO-AAAA-BBBB",
        "type": "pro",
        "status": "sold",
        "order_id": "MB-1001",
        "duration_days": 30,
        "bound_user_id": None,
        "machine_id": None,
        "expires_at": None,
    }
    base.update(overrides)
    return base


class TestComputeExpiresAt:
    """续费叠加规则"""

    def test_no_current_starts_from_now(self):
        expires = compute_expires_at(None, 30, now=NOW)
        assert expires == NOW + timedelta(days=30)

    def test_current_valid_stacks(self):
        """旧有效期未过期 → 在旧到期日基础上顺延"""
        old = (NOW + timedelta(days=10)).isoformat()
        expires = compute_expires_at(old, 30, now=NOW)
        assert expires == datetime.fromisoformat(old) + timedelta(days=30)

    def test_current_expired_starts_from_now(self):
        """旧有效期已过期 → 从当前时间起算"""
        old = (NOW - timedelta(days=5)).isoformat()
        expires = compute_expires_at(old, 30, now=NOW)
        assert expires == NOW + timedelta(days=30)

    def test_malformed_current_ignored(self):
        expires = compute_expires_at("not-a-date", 30, now=NOW)
        assert expires == NOW + timedelta(days=30)


class TestCheckBindable:
    """激活码状态机绑定判定"""

    def test_sold_allows_first_bind(self):
        ok, reason = check_bindable(_row(status="sold"), "u1", "m1", now=NOW)
        assert ok is True
        assert reason == ""

    def test_unknown_code_rejected(self):
        ok, reason = check_bindable(None, "u1", "m1", now=NOW)
        assert ok is False
        assert "不存在" in reason

    def test_unsold_rejected(self):
        ok, reason = check_bindable(_row(status="unsold"), "u1", "m1", now=NOW)
        assert ok is False
        assert "未售出" in reason

    def test_revoked_rejected(self):
        ok, reason = check_bindable(_row(status="revoked"), "u1", "m1", now=NOW)
        assert ok is False
        assert "撤销" in reason

    def test_bound_by_other_user_rejected(self):
        row = _row(status="bound", bound_user_id="u2", machine_id="m9")
        ok, reason = check_bindable(row, "u1", "m1", now=NOW)
        assert ok is False
        assert "其他用户" in reason

    def test_same_user_same_machine_idempotent(self):
        row = _row(status="bound", bound_user_id="u1", machine_id="m1",
                   expires_at=(NOW + timedelta(days=20)).isoformat())
        ok, reason = check_bindable(row, "u1", "m1", now=NOW)
        assert ok is True
        assert reason == ""

    def test_same_user_new_machine_within_limit(self):
        row = _row(status="bound", bound_user_id="u1", machine_id="m1",
                   expires_at=(NOW + timedelta(days=20)).isoformat())
        # pro 上限 2 台：已有 1 台（m1），新设备 m2 允许
        ok, reason = check_bindable(row, "u1", "m2", bound_devices=["m1"], now=NOW)
        assert ok is True
        assert reason == ""

    def test_same_user_new_machine_over_limit(self):
        row = _row(status="bound", bound_user_id="u1", machine_id="m1",
                   expires_at=(NOW + timedelta(days=20)).isoformat())
        # pro 上限 2 台：已有 2 台，第三台拒绝
        ok, reason = check_bindable(row, "u1", "m3", bound_devices=["m1", "m2"], now=NOW)
        assert ok is False
        assert "上限" in reason

    def test_expired_bound_rejected(self):
        row = _row(status="bound", bound_user_id="u1", machine_id="m1",
                   expires_at=(NOW - timedelta(days=1)).isoformat())
        ok, reason = check_bindable(row, "u1", "m1", now=NOW)
        assert ok is False
        assert "过期" in reason

    def test_content_pack_single_device(self):
        row = _row(type="snd1", status="bound", bound_user_id="u1", machine_id="m1",
                   expires_at=(NOW + timedelta(days=36500)).isoformat())
        ok, reason = check_bindable(row, "u1", "m2", bound_devices=["m1"], now=NOW)
        assert ok is False
        assert "上限" in reason
