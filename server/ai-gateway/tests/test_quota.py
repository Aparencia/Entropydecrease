"""
测试配额端点（GET /api/v1/license/quota）——重点覆盖开发者白名单豁免分支

@ai-context: is_dev 用户（DEV_USER_IDS 白名单）返回 total_calls=-1 /
cost_limit=-1（客户端渲染 ∞，避免误导性显示 120 次/天），普通用户返回
tier 对应实际限额（free=15 次/0.5 元）。
"""

import sys
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from fastapi import FastAPI
from fastapi.testclient import TestClient

from middleware.auth import verify_token
from routers.license import router as license_router


def _create_app(is_dev: bool) -> FastAPI:
    """构造仅含 license 路由的测试 app：覆写 token 依赖 + 注入 request.state"""
    app = FastAPI()
    app.include_router(license_router)

    async def override_verify_token():
        return "test-user"

    app.dependency_overrides[verify_token] = override_verify_token

    @app.middleware("http")
    async def inject_state(request, call_next):
        # 模拟 auth 中间件注入的身份信息
        request.state.user_id = "test-user"
        request.state.is_dev = is_dev
        request.state.beta_tier = None
        request.state.paid_tier = None
        return await call_next(request)

    return app


class TestQuotaDeveloperExemption:
    """开发者白名单：无限配额展示（-1 = 不限）"""

    def test_dev_returns_unlimited(self):
        client = TestClient(_create_app(is_dev=True))
        resp = client.get("/api/v1/license/quota")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_calls"] == -1
        assert data["cost_limit"] == -1
        assert data["tier"] == "lifetime"
        assert data["expires_at"] is None

    def test_regular_user_returns_free_limits(self):
        client = TestClient(_create_app(is_dev=False))
        resp = client.get("/api/v1/license/quota")
        assert resp.status_code == 200
        data = resp.json()
        # free tier 每日 15 次 / 0.5 元（TIER_LIMITS 默认档）
        assert data["total_calls"] == 15
        assert data["cost_limit"] == 0.5
