"""
测试 Supabase REST 适配层（supabase_adapter）

覆盖：
- 未配置 SUPABASE_URL/SERVICE_KEY 时进入内存 mock 池模式（本地开发/测试）
- 激活码池：查询命中/未命中、sold 回填、绑定、撤销、幂等
- 未配置模式下的 user_metadata.paid 写入（mock 记录）
- 已配置但请求失败时降级返回（不抛异常）
"""

import sys
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

import pytest


@pytest.fixture(autouse=True)
def _mock_mode_env(monkeypatch):
    """强制 mock 模式：清空 Supabase 配置"""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    from services import supabase_adapter
    supabase_adapter._reset_mock_pool()
    yield
    supabase_adapter._reset_mock_pool()


def _seed_license(adapter, code: str = "ENTROPY-PRO-AAAA-BBBB", status: str = "unsold", **overrides) -> dict:
    """向 mock 池写入一条激活码记录"""
    row = {
        "id": "00000000-0000-0000-0000-000000000001",
        "code": code,
        "type": "pro",
        "status": status,
        "order_id": None,
        "buyer_email": None,
        "duration_days": 30,
        "bound_user_id": None,
        "machine_id": None,
        "expires_at": None,
        "sold_at": None,
        "activated_at": None,
        "revoked_at": None,
        "created_at": "2026-08-07T00:00:00Z",
        **overrides,
    }
    adapter._mock_pool[code] = row
    return row


class TestMockPoolMode:
    """未配置 Supabase 时的内存 mock 池"""

    @pytest.mark.asyncio
    async def test_get_license_hit(self):
        from services.supabase_adapter import get_license_by_code
        adapter = sys.modules["services.supabase_adapter"]
        _seed_license(adapter)
        row = await get_license_by_code("ENTROPY-PRO-AAAA-BBBB")
        assert row is not None
        assert row["status"] == "unsold"

    @pytest.mark.asyncio
    async def test_get_license_miss(self):
        from services.supabase_adapter import get_license_by_code
        assert await get_license_by_code("ENTROPY-PRO-XXXX-XXXX") is None

    @pytest.mark.asyncio
    async def test_mark_sold(self):
        from services.supabase_adapter import get_license_by_code, mark_license_sold
        adapter = sys.modules["services.supabase_adapter"]
        _seed_license(adapter)
        ok = await mark_license_sold("ENTROPY-PRO-AAAA-BBBB", order_id="MB-1001", buyer_email="a@b.com")
        assert ok is True
        row = await get_license_by_code("ENTROPY-PRO-AAAA-BBBB")
        assert row["status"] == "sold"
        assert row["order_id"] == "MB-1001"
        assert row["buyer_email"] == "a@b.com"

    @pytest.mark.asyncio
    async def test_mark_sold_unknown_code_returns_false(self):
        from services.supabase_adapter import mark_license_sold
        assert await mark_license_sold("ENTROPY-PRO-XXXX-XXXX", order_id="MB-1") is False

    @pytest.mark.asyncio
    async def test_bind_license(self):
        from services.supabase_adapter import bind_license, get_license_by_code
        adapter = sys.modules["services.supabase_adapter"]
        _seed_license(adapter, status="sold", order_id="MB-1002")
        ok = await bind_license(
            "ENTROPY-PRO-AAAA-BBBB",
            user_id="user-1",
            machine_id="mach-1",
            expires_at="2026-09-06T00:00:00Z",
        )
        assert ok is True
        row = await get_license_by_code("ENTROPY-PRO-AAAA-BBBB")
        assert row["status"] == "bound"
        assert row["bound_user_id"] == "user-1"
        assert row["machine_id"] == "mach-1"
        assert row["expires_at"] == "2026-09-06T00:00:00Z"

    @pytest.mark.asyncio
    async def test_bind_unknown_code_returns_false(self):
        from services.supabase_adapter import bind_license
        assert await bind_license("ENTROPY-PRO-XXXX-XXXX", user_id="u", machine_id="m", expires_at="2026-09-06T00:00:00Z") is False

    @pytest.mark.asyncio
    async def test_revoke_license(self):
        from services.supabase_adapter import get_license_by_code, revoke_license
        adapter = sys.modules["services.supabase_adapter"]
        _seed_license(adapter, status="bound")
        assert await revoke_license("ENTROPY-PRO-AAAA-BBBB") is True
        assert (await get_license_by_code("ENTROPY-PRO-AAAA-BBBB"))["status"] == "revoked"

    @pytest.mark.asyncio
    async def test_update_paid_metadata_records_in_mock(self):
        from services.supabase_adapter import update_paid_metadata
        adapter = sys.modules["services.supabase_adapter"]
        ok = await update_paid_metadata("user-1", {"tier": "pro", "expires_at": "2026-09-06T00:00:00Z"})
        assert ok is True
        assert adapter._mock_metadata["user-1"] == {"tier": "pro", "expires_at": "2026-09-06T00:00:00Z"}


class TestConfiguredDegradation:
    """已配置 Supabase 但请求失败时降级返回（不抛异常）"""

    @pytest.mark.asyncio
    async def test_http_error_returns_none(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "service-key")

        import services.supabase_adapter as module

        # 模拟 httpx 请求抛异常（保留 _http_request 的 try/except 降级保护）
        class FakeClient:
            def __init__(self, timeout):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return False

            async def request(self, *args, **kwargs):
                raise RuntimeError("Supabase 不可达")

        class FakeHttpx:
            AsyncClient = FakeClient

        monkeypatch.setattr(module, "httpx", FakeHttpx())
        assert await module.get_license_by_code("ENTROPY-PRO-AAAA-BBBB") is None
        assert await module.mark_license_sold("ENTROPY-PRO-AAAA-BBBB", order_id="MB-1") is False
        assert await module.update_paid_metadata("user-1", {"tier": "pro"}) is False
