"""
熵减 AI 网关 — 应用级配置

@ai-context: 汇聚运行环境、CORS、JWT 与中间件连接串等应用级配置。
Supabase JWKS 端点从 SUPABASE_URL 推导（标准路径含 /auth/v1 前缀），
亦可经 SUPABASE_JWKS_URL 显式覆盖。所有值均经环境变量注入，无硬编码密钥。
@ai-context: GW-2#1——jwt_algorithm 由 SUPABASE_JWT_ALGORITHM 注入，默认 HS256
（Supabase 默认对称密钥签发机制）；ES256 仅在开启自定义 JWT 时选用。
"""

import os

# Supabase 项目地址，提前读取以推导 JWKS 端点等配置
_supabase_url = os.getenv("SUPABASE_URL", "")

APP_CONFIG = {
    "app_env": os.getenv("APP_ENV", "development"),
    "title": "熵减 AI 网关",
    "version": "0.1.0-alpha",
    "description": "熵减(Entropydecrease) AI 增强服务网关 — MVP-2 Alpha",
    "cors_origins": [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    "jwt_secret": os.getenv("SUPABASE_JWT_SECRET", ""),
    # GW-2#1: 算法由环境变量注入（默认 HS256 与 Supabase 默认签发机制对齐）；
    # 原硬编码 ES256 导致默认 HS256 项目（无 JWKS 端点）全站 401
    # GW-3: strip().upper() 规范化——小写 hs256/es256 配置也能正确匹配
    "jwt_algorithm": os.getenv("SUPABASE_JWT_ALGORITHM", "HS256").strip().upper(),
    "supabase_url": _supabase_url,
    "supabase_jwks_url": os.getenv(
        "SUPABASE_JWKS_URL",
        # 从 SUPABASE_URL 推导 JWKS 端点（Supabase 标准路径需含 /auth/v1 前缀）
        f"{_supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json" if _supabase_url else "",
    ),
    "redis_url": os.getenv("REDIS_URL", "redis://localhost:6379/0"),
}
