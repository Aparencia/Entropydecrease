"""
测试 JWT claims → tier 解析（extract_tiers 纯函数）

覆盖：
- 仅 beta 身份 / 仅付费身份 / 双身份并存
- paid.expires_at 过期 → 视为无付费身份
- claims 缺失 / tier 值非法 → None（配额 fail-closed 到 free）
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from middleware.auth import extract_tiers, _is_dev_user


def _payload_with_meta(meta: dict) -> dict:
    """构造含 user_metadata 的 JWT payload"""
    return {"sub": "test-user", "user_metadata": meta}


class TestIsDevUser:
    """开发者白名单识别（DEV_USER_IDS）"""

    def test_not_configured_returns_false(self, monkeypatch):
        monkeypatch.delenv("DEV_USER_IDS", raising=False)
        assert _is_dev_user({"sub": "u1"}, "u1") is False

    def test_match_by_user_id(self, monkeypatch):
        monkeypatch.setenv("DEV_USER_IDS", "u-abc-123, dev@example.com")
        assert _is_dev_user({"sub": "u-abc-123"}, "u-abc-123") is True

    def test_match_by_email_claim(self, monkeypatch):
        monkeypatch.setenv("DEV_USER_IDS", "dev@example.com")
        payload = {"sub": "u1", "email": "dev@example.com"}
        assert _is_dev_user(payload, "u1") is True

    def test_match_by_metadata_email(self, monkeypatch):
        monkeypatch.setenv("DEV_USER_IDS", "DEV@EXAMPLE.COM")
        payload = {"sub": "u1", "user_metadata": {"email": "dev@example.com"}}
        # 大小写不敏感
        assert _is_dev_user(payload, "u1") is True

    def test_non_dev_user_returns_false(self, monkeypatch):
        monkeypatch.setenv("DEV_USER_IDS", "dev@example.com")
        assert _is_dev_user({"sub": "u2", "email": "other@example.com"}, "u2") is False


class TestExtractTiers:
    """extract_tiers 纯函数解析测试"""

    def test_beta_only(self):
        """仅有 beta 身份时返回 (beta_tier, None)"""
        payload = _payload_with_meta({"beta": {"tier": "core"}})
        assert extract_tiers(payload) == ("core", None)

    def test_paid_only(self):
        """仅有付费身份（未过期）时返回 (None, paid_tier)"""
        future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        payload = _payload_with_meta({"paid": {"tier": "pro", "expires_at": future}})
        assert extract_tiers(payload) == (None, "pro")

    def test_both_identities(self):
        """内测与付费并存时两个 tier 都返回，由调用方取最高者"""
        future = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
        payload = _payload_with_meta({
            "beta": {"tier": "active"},
            "paid": {"tier": "lifetime", "expires_at": future},
        })
        assert extract_tiers(payload) == ("active", "lifetime")

    def test_paid_expired_returns_none(self):
        """paid.expires_at 已过期 → 付费身份失效（返回 None）"""
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        payload = _payload_with_meta({"paid": {"tier": "pro", "expires_at": past}})
        assert extract_tiers(payload) == (None, None)

    def test_paid_without_expires_is_ignored(self):
        """paid 缺少 expires_at（数据异常）→ 视为无付费身份"""
        payload = _payload_with_meta({"paid": {"tier": "pro"}})
        assert extract_tiers(payload) == (None, None)

    def test_missing_metadata_returns_none(self):
        """无 user_metadata 时返回 (None, None)"""
        assert extract_tiers({"sub": "test-user"}) == (None, None)

    def test_invalid_beta_tier_ignored(self):
        """beta.tier 非法值（伪造/损坏）→ 忽略该身份"""
        payload = _payload_with_meta({"beta": {"tier": "hacker"}})
        assert extract_tiers(payload) == (None, None)

    def test_empty_payload_returns_none(self):
        """空 payload 不抛异常"""
        assert extract_tiers({}) == (None, None)
