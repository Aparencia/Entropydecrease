"""
测试 AI 额度包 consume 扣减逻辑（充值系统重构新增）

覆盖：
- 无额度包 → success=False
- AIINF 不限量 → 不扣减返回 remaining=-1
- 有余额扣减成功 → remaining 正确（跨多包汇总）
- 余额不足 → success=False
- 多包并存：余额降序优先扣减
"""

import sys
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

import pytest

from routers.license import ConsumeRequest, consume_quota
from services import supabase_adapter


def _seed_quota(code: str, type_: str, balance: int, user: str = "u1") -> None:
    """向 mock 池写入一条已绑定的额度包记录。"""
    supabase_adapter._mock_pool[code] = {
        "code": code,
        "type": type_,
        "status": "bound",
        "bound_user_id": user,
        "machine_id": "m1",
        "quota_balance": balance,
        "expires_at": None,
    }


@pytest.fixture(autouse=True)
def _mock_env(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    supabase_adapter._reset_mock_pool()
    yield
    supabase_adapter._reset_mock_pool()


class TestConsumeQuota:
    """AI 额度包扣减"""

    @pytest.mark.asyncio
    async def test_no_quota_license_returns_false(self):
        result = await consume_quota(ConsumeRequest(count=1), user_id="u1")
        assert result.success is False
        assert result.remaining == 0

    @pytest.mark.asyncio
    async def test_unlimited_quota_not_decremented(self):
        _seed_quota("ENTROPY-AIINF-AAAA-BBBB", "AIINF", -1)
        result = await consume_quota(ConsumeRequest(count=5), user_id="u1")
        assert result.success is True
        assert result.remaining == -1
        # 不限量不扣减
        assert supabase_adapter._mock_pool["ENTROPY-AIINF-AAAA-BBBB"]["quota_balance"] == -1

    @pytest.mark.asyncio
    async def test_decrement_success(self):
        _seed_quota("ENTROPY-AI200-AAAA-BBBB", "AI200", 200)
        result = await consume_quota(ConsumeRequest(count=1), user_id="u1")
        assert result.success is True
        assert result.remaining == 199
        assert supabase_adapter._mock_pool["ENTROPY-AI200-AAAA-BBBB"]["quota_balance"] == 199

    @pytest.mark.asyncio
    async def test_multi_pack_aggregated_remaining(self):
        _seed_quota("ENTROPY-AI50-AAAA-BBBB", "AI50", 50)
        _seed_quota("ENTROPY-AI200-CCCC-DDDD", "AI200", 200)
        result = await consume_quota(ConsumeRequest(count=1), user_id="u1")
        assert result.success is True
        # 余额降序：先扣 200 的包 → 剩余 249
        assert result.remaining == 249
        assert supabase_adapter._mock_pool["ENTROPY-AI200-CCCC-DDDD"]["quota_balance"] == 199
        assert supabase_adapter._mock_pool["ENTROPY-AI50-AAAA-BBBB"]["quota_balance"] == 50

    @pytest.mark.asyncio
    async def test_insufficient_balance_returns_false(self):
        _seed_quota("ENTROPY-AI50-AAAA-BBBB", "AI50", 0)
        result = await consume_quota(ConsumeRequest(count=1), user_id="u1")
        assert result.success is False
        assert result.remaining == 0
