"""
测试支付 webhook（license_webhook + payment_adapter）

覆盖：
- 签名验证：正确 HMAC 通过 / 错误签名拒绝 / 未配置 secret 拒绝
- 查询确认主闸：真实订单 → 标记 sold；伪造 order_id → 拒绝入队
- 幂等：重复通知仍 200（不重复入队不报错）
- 降级：查询失败 → 入队 pending，响应 200
- 订单未支付（签名有效时）→ 正常拒绝不入队
"""

import hashlib
import hmac
import json
import sys
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

import pytest


@pytest.fixture(autouse=True)
def _isolate_mocks(monkeypatch):
    """隔离 mock 订单与 mock 激活码池"""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    monkeypatch.delenv("PAYMENT_PROVIDER", raising=False)
    monkeypatch.delenv("PAYMENT_API_KEY", raising=False)
    monkeypatch.delenv("PAYMENT_API_SECRET", raising=False)
    monkeypatch.delenv("PAYMENT_WEBHOOK_SECRET", raising=False)

    from services import payment_adapter, supabase_adapter

    payment_adapter._reset_mock_orders()
    supabase_adapter._reset_mock_pool()
    yield
    payment_adapter._reset_mock_orders()
    supabase_adapter._reset_mock_pool()


def _seed_pool(code: str = "ENTROPY-PRO-AAAA-BBBB") -> None:
    """向 mock 激活码池写入一条 unsold 记录"""
    from services import supabase_adapter

    supabase_adapter._mock_pool[code] = {
        "id": "id-1", "code": code, "type": "pro", "status": "unsold",
        "order_id": None, "buyer_email": None, "duration_days": 30,
        "bound_user_id": None, "machine_id": None, "expires_at": None,
        "sold_at": None, "activated_at": None, "revoked_at": None, "created_at": "",
    }


class TestVerifySignature:
    """HMAC 签名验证"""

    def test_valid_signature_passes(self, monkeypatch):
        monkeypatch.setenv("PAYMENT_WEBHOOK_SECRET", "whsec-test")
        from services.payment_adapter import verify_signature

        payload = b'{"order_id": "MB-1"}'
        sig = hmac.new(b"whsec-test", payload, hashlib.sha256).hexdigest()
        assert verify_signature(payload, sig) is True

    def test_invalid_signature_rejected(self, monkeypatch):
        monkeypatch.setenv("PAYMENT_WEBHOOK_SECRET", "whsec-test")
        from services.payment_adapter import verify_signature

        assert verify_signature(b'{"order_id": "MB-1"}', "deadbeef") is False

    def test_missing_secret_rejected(self):
        from services.payment_adapter import verify_signature

        assert verify_signature(b"{}", "anything") is False
        assert verify_signature(b"{}", None) is False


class TestWebhookFlow:
    """webhook 处理流程"""

    @pytest.mark.asyncio
    async def test_valid_order_marks_sold(self):
        from routers.license_webhook import _handle_webhook
        from services import payment_adapter, supabase_adapter

        _seed_pool()
        payment_adapter._seed_mock_order("MB-1001", "ENTROPY-PRO-AAAA-BBBB", status="paid")

        result = await _handle_webhook({"order_id": "MB-1001", "code": "ENTROPY-PRO-AAAA-BBBB"})
        assert result["code"] == 200
        assert result["message"] == "ok"
        assert supabase_adapter._mock_pool["ENTROPY-PRO-AAAA-BBBB"]["status"] == "sold"
        assert supabase_adapter._mock_pool["ENTROPY-PRO-AAAA-BBBB"]["order_id"] == "MB-1001"

    @pytest.mark.asyncio
    async def test_fake_order_rejected_and_queued(self):
        from routers.license_webhook import _handle_webhook, get_pending_orders
        from services import payment_adapter, supabase_adapter

        _seed_pool()

        result = await _handle_webhook({"order_id": "FAKE-9999", "code": "ENTROPY-PRO-AAAA-BBBB"})
        # 先应答 200 避免重试风暴，但订单入队待对账，激活码未被标记
        assert result["code"] == 200
        assert result["message"] == "accepted"
        assert supabase_adapter._mock_pool["ENTROPY-PRO-AAAA-BBBB"]["status"] == "unsold"
        assert any(p["order_id"] == "FAKE-9999" for p in get_pending_orders())

    @pytest.mark.asyncio
    async def test_duplicate_notification_idempotent(self):
        from routers.license_webhook import _handle_webhook
        from services import payment_adapter, supabase_adapter

        _seed_pool()
        payment_adapter._seed_mock_order("MB-1001", "ENTROPY-PRO-AAAA-BBBB", status="paid")

        first = await _handle_webhook({"order_id": "MB-1001", "code": "ENTROPY-PRO-AAAA-BBBB"})
        second = await _handle_webhook({"order_id": "MB-1001", "code": "ENTROPY-PRO-AAAA-BBBB"})
        assert first["code"] == 200
        assert second["code"] == 200
        assert supabase_adapter._mock_pool["ENTROPY-PRO-AAAA-BBBB"]["status"] == "sold"

    @pytest.mark.asyncio
    async def test_unpaid_order_rejected_when_signature_valid(self, monkeypatch):
        monkeypatch.setenv("PAYMENT_WEBHOOK_SECRET", "whsec-test")
        from routers.license_webhook import _handle_webhook, get_pending_orders
        from services import payment_adapter, supabase_adapter

        _seed_pool()
        payment_adapter._seed_mock_order("MB-1002", "ENTROPY-PRO-AAAA-BBBB", status="pending")
        sig = hmac.new(b"whsec-test", b"", hashlib.sha256).hexdigest()

        result = await _handle_webhook({"order_id": "MB-1002", "code": "ENTROPY-PRO-AAAA-BBBB"}, signature=sig)
        assert result["code"] == 200
        assert "未支付" in result["message"]
        # 正常拒绝不入队
        assert not any(p["order_id"] == "MB-1002" for p in get_pending_orders())
        assert supabase_adapter._mock_pool["ENTROPY-PRO-AAAA-BBBB"]["status"] == "unsold"

    @pytest.mark.asyncio
    async def test_missing_order_id_rejected(self):
        from routers.license_webhook import _handle_webhook

        result = await _handle_webhook({})
        assert result["code"] == 400
