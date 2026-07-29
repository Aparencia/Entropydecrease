"""
测试 JWT HS256 认证中间件端到端验证

覆盖：
- 有效 Bearer token 正确解码并返回 user_id
- 无 Authorization 头返回 401
- 格式错误的 Authorization 头返回 401
- token 过期返回 401
- SUPABASE_JWT_SECRET 为空时使用开发降级模式
- OPTIONS 请求直接放行
- /health 路径直接放行
- 非 /api/ 路径直接放行
"""

import base64
import json
import sys
from pathlib import Path

import pytest
from unittest.mock import patch

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from config import APP_CONFIG
from middleware.auth import JWTAuthMiddleware, PUBLIC_PATHS


def _make_test_app():
    """创建携带 JWTAuthMiddleware 的测试 FastAPI 应用"""
    from fastapi import FastAPI

    app = FastAPI()
    app.add_middleware(JWTAuthMiddleware)

    @app.get("/api/v1/ai/test")
    async def test_endpoint():
        return {"ok": True}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/public-info")
    async def public_info():
        return {"info": "public"}

    return app


@pytest.fixture
def client():
    """携带 JWTAuthMiddleware 的测试客户端"""
    from fastapi.testclient import TestClient
    return TestClient(_make_test_app())


def _make_fake_jwt_token(sub: str = "test-user") -> str:
    """构造一个不验签的假 JWT token（仅用于 dev 模式解码测试）"""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"sub": sub}).encode()).decode().rstrip("=")
    signature = "fake-signature"
    return f"{header}.{payload}.{signature}"


# ────────────────────────────────────────────────────────────
# 正常 JWT 验证流程（jwt_secret 已配置）
# ────────────────────────────────────────────────────────────


class TestJWTNormalVerification:
    """jwt_secret 已配置时的正常 JWT 验证流程"""

    @pytest.fixture(autouse=True)
    def _set_secret(self, monkeypatch):
        """为该组测试设置非空 jwt_secret，启用正常验证流程"""
        monkeypatch.setitem(APP_CONFIG, "jwt_secret", "test-secret-key")
        monkeypatch.setitem(APP_CONFIG, "jwt_algorithm", "HS256")
        monkeypatch.setitem(APP_CONFIG, "supabase_url", "")

    def test_valid_bearer_token_decodes_user_id(self, client):
        """有有效 Bearer token 时应正确解码并返回 user_id"""
        with patch("jose.jwt.decode", return_value={"sub": "test-user"}):
            response = client.get(
                "/api/v1/ai/test",
                headers={"Authorization": "Bearer fake.jwt.token"},
            )
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    def test_no_authorization_header_returns_401(self, client):
        """无 Authorization 头时应返回 401"""
        response = client.get("/api/v1/ai/test")
        assert response.status_code == 401
        assert "Authorization" in response.json()["detail"]

    def test_malformed_authorization_header_returns_401(self, client):
        """格式错误的 Authorization 头应返回 401"""
        # 不是 Bearer 前缀
        response = client.get(
            "/api/v1/ai/test",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert response.status_code == 401
        assert "格式错误" in response.json()["detail"]

    def test_authorization_header_single_part_returns_401(self, client):
        """只有 token 没有方案的 Authorization 头应返回 401"""
        response = client.get(
            "/api/v1/ai/test",
            headers={"Authorization": "just-a-token-no-scheme"},
        )
        assert response.status_code == 401

    def test_expired_token_returns_401(self, client):
        """token 过期时应返回 401"""
        from jose import ExpiredSignatureError

        with patch("jose.jwt.decode", side_effect=ExpiredSignatureError("Token expired")):
            response = client.get(
                "/api/v1/ai/test",
                headers={"Authorization": "Bearer expired.jwt.token"},
            )
        assert response.status_code == 401
        assert "过期" in response.json()["detail"]

    def test_invalid_signature_returns_401(self, client):
        """token 签名验证失败时应返回 401"""
        from jose import JWTError

        with patch("jose.jwt.decode", side_effect=JWTError("Signature verification failed")):
            response = client.get(
                "/api/v1/ai/test",
                headers={"Authorization": "Bearer invalid.jwt.signature"},
            )
        assert response.status_code == 401
        assert "验证失败" in response.json()["detail"]

    def test_token_missing_sub_claim_returns_401(self, client):
        """token 中缺少 sub claim 时应返回 401"""
        with patch("jose.jwt.decode", return_value={"exp": 9999999999}):
            response = client.get(
                "/api/v1/ai/test",
                headers={"Authorization": "Bearer valid.but.no-sub.token"},
            )
        assert response.status_code == 401
        assert "sub" in response.json()["detail"] or "用户标识" in response.json()["detail"]

    def test_user_api_key_extracted_from_header(self, client):
        """X-User-API-Key 头应被提取到 request.state（通过中间件不报错验证）"""
        with patch("jose.jwt.decode", return_value={"sub": "test-user"}):
            response = client.get(
                "/api/v1/ai/test",
                headers={
                    "Authorization": "Bearer fake.jwt.token",
                    "X-User-API-Key": "sk-test-user-api-key-placeholder",
                },
            )
        assert response.status_code == 200


# ────────────────────────────────────────────────────────────
# 开发降级模式（jwt_secret 为空）
# ────────────────────────────────────────────────────────────


class TestJWTDevMode:
    """SUPABASE_JWT_SECRET 为空时的开发降级模式"""

    @pytest.fixture(autouse=True)
    def _clear_secret(self, monkeypatch):
        """清空全部密钥材料，启用开发降级模式

        必须同时清空 Supabase 端点并固定为 HS256：ES256 算法下
        _jwt_verification_configured() 检查的是 jwks_url/supabase_url，
        仅清空 jwt_secret 会让用例走真实验证路径去拉取 JWKS（依赖外网）。
        """
        monkeypatch.setitem(APP_CONFIG, "jwt_secret", "")
        monkeypatch.setitem(APP_CONFIG, "jwt_algorithm", "HS256")
        monkeypatch.setitem(APP_CONFIG, "supabase_jwks_url", "")
        monkeypatch.setitem(APP_CONFIG, "supabase_url", "")

    def test_no_token_returns_anonymous(self, client):
        """无 Bearer token 时应返回 anonymous 用户（放行请求）"""
        response = client.get("/api/v1/ai/test")
        assert response.status_code == 200
        assert response.json() == {"ok": True}

    def test_bearer_token_extracts_sub_in_dev_mode(self, client):
        """有 Bearer token 时应在开发模式下提取 sub（不验签）"""
        fake_token = _make_fake_jwt_token(sub="dev-user-123")
        response = client.get(
            "/api/v1/ai/test",
            headers={"Authorization": f"Bearer {fake_token}"},
        )
        assert response.status_code == 200

    def test_bearer_token_with_garbage_returns_dev_user(self, client):
        """Bearer token 格式无效时应回退到 dev-user"""
        response = client.get(
            "/api/v1/ai/test",
            headers={"Authorization": "Bearer not-a-valid-jwt"},
        )
        # 开发降级模式下，解码失败也返回 dev-user，请求放行
        assert response.status_code == 200


# ────────────────────────────────────────────────────────────
# 白名单与放行路径
# ────────────────────────────────────────────────────────────


class TestJWTPassthrough:
    """OPTIONS 预检、健康检查路径、非 API 路径应直接放行"""

    @pytest.fixture(autouse=True)
    def _set_secret(self, monkeypatch):
        """设置非空 jwt_secret 以确保这些路径不是因为 secret 为空而放行"""
        monkeypatch.setitem(APP_CONFIG, "jwt_secret", "test-secret-key")
        monkeypatch.setitem(APP_CONFIG, "jwt_algorithm", "HS256")
        monkeypatch.setitem(APP_CONFIG, "supabase_url", "")

    def test_options_request_passthrough(self, client):
        """OPTIONS 请求（CORS 预检）应直接放行，不检查 JWT"""
        response = client.options("/api/v1/ai/test")
        # OPTIONS 请求会被中间件放行，路由可能返回 405 或 200
        # 关键是不返回 401
        assert response.status_code != 401

    def test_health_path_passthrough(self, client):
        """/health 路径应直接放行，无需 JWT"""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_health_quick_path_passthrough(self, client):
        """/health/quick 路径在 PUBLIC_PATHS 中应放行"""
        # /health/quick 需要路由定义才能返回 200，但中间件不会拦截
        # 验证中间件不返回 401 即可
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        app = FastAPI()
        app.add_middleware(JWTAuthMiddleware)

        @app.get("/health/quick")
        async def health_quick():
            return {"status": "ok"}

        client = TestClient(app)
        response = client.get("/health/quick")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_non_api_path_passthrough(self, client):
        """非 /api/ 路径应直接放行，无需 JWT"""
        response = client.get("/public-info")
        assert response.status_code == 200
        assert response.json() == {"info": "public"}
