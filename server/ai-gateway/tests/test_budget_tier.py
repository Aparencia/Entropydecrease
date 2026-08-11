"""
测试预算中间件按 tier 分级（resolve_cost_limit 纯函数）

覆盖：
- 各 tier 费用上限映射（free ¥0.5 / observer ¥1.5 / active ¥2.0 / pro ¥2.0 / core ¥3.0 / lifetime ¥3.0）
- beta 与 paid 并存取最高者
- 非法 tier 回落 free
"""

import sys
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from cost.budget import resolve_cost_limit


class TestResolveCostLimit:
    """resolve_cost_limit 按 tier 解析每日费用上限"""

    def test_free_tier(self):
        """免费档费用上限 ¥0.5"""
        assert resolve_cost_limit(None, None) == 0.5

    def test_observer_tier(self):
        """内测观察者 ¥1.5"""
        assert resolve_cost_limit("observer", None) == 1.5

    def test_active_tier(self):
        """内测活跃者 ¥2.0"""
        assert resolve_cost_limit("active", None) == 2.0

    def test_pro_tier(self):
        """Pro 订阅 ¥2.0"""
        assert resolve_cost_limit(None, "pro") == 2.0

    def test_core_tier(self):
        """核心共创层 ¥3.0"""
        assert resolve_cost_limit("core", None) == 3.0

    def test_lifetime_tier(self):
        """终身 Pro ¥3.0"""
        assert resolve_cost_limit(None, "lifetime") == 3.0

    def test_paid_higher_than_beta(self):
        """内测 active + Pro → 取 pro ¥2.0"""
        assert resolve_cost_limit("active", "pro") == 2.0

    def test_beta_higher_than_paid(self):
        """内测 core + Pro → 取 core ¥3.0"""
        assert resolve_cost_limit("core", "pro") == 3.0

    def test_invalid_tier_falls_back_free(self):
        """非法 tier 值回落 free ¥0.5"""
        assert resolve_cost_limit("hacker", None) == 0.5
        assert resolve_cost_limit(None, "hacker") == 0.5
