"""
熵减 AI 网关 — API 余额查询路由

GET /api/v1/ai/balance
查询各 AI 服务提供商的 API 余额/配额信息。
支持 Provider：智谱(GLM)、深度求索(DeepSeek)、通义千问/百炼(Qwen)
暂不支持：Gemini（无公开余额 API）

缓存策略：Redis 缓存 5 分钟，减少对各 Provider 计费 API 的频繁调用。

@ai-context: API 余额查询路由：聚合各 Provider 账户余额（阿里云百炼经 AK/SK 查询），供设置页展示。
"""

import asyncio
import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Request

from cache.redis_cache import get_cache
from config import AI_PROVIDERS, is_valid_api_key, ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET
from config.key_pool import get_primary_key

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["余额查询"])

# 缓存键与 TTL
CACHE_KEY = "ai_balance:all"
CACHE_TTL = 300  # 5 分钟

# GW-M13: 共享 HTTP 客户端（连接池复用，避免每请求新建 TCP/TLS 连接）
_balance_client: httpx.AsyncClient | None = None
# GW-M13: 缓存击穿锁——缓存过期瞬间多个并发请求同时回源时只放行一个
_refresh_lock: asyncio.Lock = asyncio.Lock()


def _get_balance_client() -> httpx.AsyncClient:
    global _balance_client
    if _balance_client is None:
        _balance_client = httpx.AsyncClient(timeout=10)
    return _balance_client


# ============================================================
# Provider 余额查询实现
# ============================================================


async def _query_glm_balance(api_key: str) -> dict:
    """查询智谱 GLM 余额

    API: GET https://open.bigmodel.cn/api/paas/v4/finance/balance
    返回格式: {"code": 200, "data": {"balance": "xx.xx"}}
    """
    # GW-M13: 共享客户端直接使用（不可用 async with——退出会关闭连接池）
    client = _get_balance_client()
    resp = await client.get(
        "https://open.bigmodel.cn/api/paas/v4/finance/balance",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != 200:
        raise ValueError(f"GLM 返回错误: {data.get('msg', '未知错误')}")

    balance_info = data.get("data", {})
    balance = float(balance_info.get("balance", 0))
    return {
        "provider": "glm",
        "display_name": "智谱 GLM",
        "currency": "CNY",
        "total_balance": balance,
        "granted_balance": None,  # GLM 不区分赠送/充值
        "topped_up_balance": None,
        "supported": True,
    }


async def _query_deepseek_balance(api_key: str) -> dict:
    """查询 DeepSeek 余额

    API: GET https://api.deepseek.com/user/balance
    返回格式: {"code": 0, "data": {"currency": "CNY", "total_balance": "xx.xx", ...}}
    """
    # GW-M13: 共享客户端直接使用（不可用 async with——退出会关闭连接池）
    client = _get_balance_client()
    resp = await client.get(
        "https://api.deepseek.com/user/balance",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != 0:
        raise ValueError(f"DeepSeek 返回错误: {data.get('message', '未知错误')}")

    balance_info = data.get("data", {})
    return {
        "provider": "deepseek",
        "display_name": "深度求索 DeepSeek",
        "currency": balance_info.get("currency", "CNY"),
        "total_balance": float(balance_info.get("total_balance", 0)),
        "granted_balance": float(balance_info.get("granted_balance", 0)),
        "topped_up_balance": float(balance_info.get("topped_up_balance", 0)),
        "supported": True,
    }


# ============================================================
# 阿里云 V3 签名机制（用于百炼平台余额查询）
# ============================================================

_ALIYUN_BSS_ENDPOINT = "business.aliyuncs.com"
_ALIYUN_BSS_VERSION = "2017-12-14"
_EMPTY_BODY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def _aliyun_v3_sign(access_key_id: str, access_key_secret: str, action: str) -> dict:
    """生成阿里云 OpenAPI V3 签名请求头（RPC 风格，GET 无参数）

    返回可直接用于 httpx 请求的 headers 字典。
    """
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    nonce = uuid.uuid4().hex

    # 参与签名的 headers（按字母序）
    signed_headers_map = {
        "host": _ALIYUN_BSS_ENDPOINT,
        "x-acs-action": action,
        "x-acs-content-sha256": _EMPTY_BODY_SHA256,
        "x-acs-date": now_utc,
        "x-acs-signature-nonce": nonce,
        "x-acs-version": _ALIYUN_BSS_VERSION,
    }
    sorted_keys = sorted(signed_headers_map.keys())
    signed_headers_str = ";".join(sorted_keys)

    # 步骤一：构造规范化请求
    canonical_headers = "".join(
        f"{k}:{signed_headers_map[k]}\n" for k in sorted_keys
    )
    canonical_request = "\n".join([
        "GET",                    # HTTPRequestMethod
        "/",                      # CanonicalURI（RPC 风格固定为 /）
        "",                       # CanonicalQueryString（无参数）
        canonical_headers,        # CanonicalHeaders（已包含尾部 \n）
        signed_headers_str,       # SignedHeaders
        _EMPTY_BODY_SHA256,      # HashedRequestPayload（空 body）
    ])

    # 步骤二：构造待签名字符串
    hashed_canonical = hashlib.sha256(canonical_request.encode("utf-8")).hexdigest()
    string_to_sign = f"ACS3-HMAC-SHA256\n{hashed_canonical}"

    # 步骤三：计算签名
    signature = hmac.new(
        access_key_secret.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    # 步骤四：构造 Authorization
    authorization = (
        f"ACS3-HMAC-SHA256 "
        f"Credential={access_key_id},"
        f"SignedHeaders={signed_headers_str},"
        f"Signature={signature}"
    )

    return {
        "host": _ALIYUN_BSS_ENDPOINT,
        "x-acs-action": action,
        "x-acs-content-sha256": _EMPTY_BODY_SHA256,
        "x-acs-date": now_utc,
        "x-acs-signature-nonce": nonce,
        "x-acs-version": _ALIYUN_BSS_VERSION,
        "Authorization": authorization,
    }


async def _query_qwen_balance(api_key: str) -> dict:
    """查询通义千问/百炼平台账户余额

    通过阿里云 BSS OpenAPI QueryAccountBalance 查询账户可用额度。
    需要配置 ALIYUN_ACCESS_KEY_ID 和 ALIYUN_ACCESS_KEY_SECRET 环境变量。
    注意：此处查询的是阿里云账户总余额，非百炼免费额度。
    """
    if not ALIYUN_ACCESS_KEY_ID or not ALIYUN_ACCESS_KEY_SECRET:
        raise ValueError("未配置阿里云 AK/SK（ALIYUN_ACCESS_KEY_ID / ALIYUN_ACCESS_KEY_SECRET）")

    headers = _aliyun_v3_sign(
        access_key_id=ALIYUN_ACCESS_KEY_ID,
        access_key_secret=ALIYUN_ACCESS_KEY_SECRET,
        action="QueryAccountBalance",
    )

    # GW-M13: 共享客户端直接使用（不可用 async with——退出会关闭连接池）
    client = _get_balance_client()
    resp = await client.get(
        f"https://{_ALIYUN_BSS_ENDPOINT}/",
        headers=headers,
    )
    resp.raise_for_status()
    data = resp.json()

    if data.get("Code") != "200" or not data.get("Success"):
        raise ValueError(f"阿里云返回错误: {data.get('Message', '未知错误')}")

    balance_data = data.get("Data", {})
    return {
        "provider": "qwen",
        "display_name": "通义千问 百炼",
        "currency": balance_data.get("Currency", "CNY"),
        "total_balance": float(balance_data.get("AvailableAmount", 0)),
        "granted_balance": None,
        "topped_up_balance": float(balance_data.get("AvailableCashAmount", 0)),
        "supported": True,
    }


def _unsupported_provider(provider_key: str, display_name: str) -> dict:
    """返回不支持余额查询的 Provider 信息"""
    return {
        "provider": provider_key,
        "display_name": display_name,
        "currency": None,
        "total_balance": None,
        "granted_balance": None,
        "topped_up_balance": None,
        "supported": False,
        "reason": "该服务商暂无公开余额查询 API",
    }


# Provider 查询映射
_PROVIDER_QUERIES = {
    "glm": ("智谱 GLM", _query_glm_balance),
    "deepseek": ("深度求索 DeepSeek", _query_deepseek_balance),
    "qwen": ("通义千问 百炼", _query_qwen_balance),
}

# 不支持余额查询的 Provider
_UNSUPPORTED_PROVIDERS = {
    "gemini": "Google Gemini",
}


# ============================================================
# 路由端点
# ============================================================


@router.get("/balance")
async def get_balance(request: Request):
    """查询所有已配置 Provider 的 API 余额

    返回各 Provider 的余额信息，包含：
    - 已配置且支持查询的 Provider：返回实际余额
    - 已配置但不支持查询的 Provider：标记为 unsupported
    - 未配置的 Provider：不返回

    缓存策略：结果缓存 5 分钟，减少对各 Provider 计费 API 的调用频率。
    """
    start_time = time.time()
    cache = get_cache()

    # 尝试读取缓存
    cached = await cache.get(CACHE_KEY)
    if cached:
        try:
            result = json.loads(cached)
            result["from_cache"] = True
            return result
        except (json.JSONDecodeError, TypeError):
            pass  # 缓存损坏，重新查询

    # GW-M13: 防缓存击穿——缓存过期瞬间只放行一个回源请求，
    # 其余请求等待锁后直接复用首个请求写回的缓存
    async with _refresh_lock:
        cached = await cache.get(CACHE_KEY)
        if cached:
            try:
                result = json.loads(cached)
                result["from_cache"] = True
                return result
            except (json.JSONDecodeError, TypeError):
                pass
        return await _query_all_balances(cache, start_time)


async def _query_all_balances(cache, start_time: float) -> dict:
    """查询全部 Provider 余额并写缓存（在防击穿锁内调用）"""
    # 逐个查询 Provider 余额
    results = []

    for provider_key, (display_name, query_fn) in _PROVIDER_QUERIES.items():
        cfg = AI_PROVIDERS.get(provider_key, {})
        # GW-2#7: 优先从 Key 池取主 Key（复数环境变量 DEEPSEEK_API_KEYS 的
        # 首 Key）——原实现只读 AI_PROVIDERS 的单数变量 DEEPSEEK_API_KEY，
        # 部署仅配置复数变量时余额查询被静默跳过（余额面板缺 DeepSeek 条目）
        api_key = get_primary_key(provider_key) or cfg.get("api_key", "")

        # 跳过未配置的 Provider
        if not is_valid_api_key(api_key):
            continue

        try:
            info = await query_fn(api_key)
            info["status"] = "ok"
            results.append(info)
        except httpx.TimeoutException:
            results.append({
                "provider": provider_key,
                "display_name": display_name,
                "status": "error",
                "error": "查询超时",
                "supported": True,
            })
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code}"
            if e.response.status_code == 401:
                error_msg = "API Key 无效或已过期"
            results.append({
                "provider": provider_key,
                "display_name": display_name,
                "status": "error",
                "error": error_msg,
                "supported": True,
            })
        except Exception as e:
            logger.warning("查询 %s 余额失败: %s", provider_key, str(e))
            results.append({
                "provider": provider_key,
                "display_name": display_name,
                "status": "error",
                "error": str(e),
                "supported": True,
            })

    # 添加不支持余额查询但已配置的 Provider
    for provider_key, display_name in _UNSUPPORTED_PROVIDERS.items():
        cfg = AI_PROVIDERS.get(provider_key, {})
        api_key = cfg.get("api_key", "")
        if is_valid_api_key(api_key):
            info = _unsupported_provider(provider_key, display_name)
            info["status"] = "ok"
            results.append(info)

    latency_ms = round((time.time() - start_time) * 1000)
    response = {
        "status": "ok",
        "providers": results,
        "latency_ms": latency_ms,
        "from_cache": False,
        "queried_at": int(time.time()),
    }

    # 写入缓存（仅在至少有一个成功结果时缓存）
    if any(r.get("status") == "ok" and r.get("supported") for r in results):
        await cache.set(CACHE_KEY, json.dumps(response, ensure_ascii=False), expire=CACHE_TTL)

    return response
