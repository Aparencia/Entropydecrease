"""
熵减 AI 网关 — 激活码验证路由

@ai-context: 激活码池验真：查 Supabase licenses 池（sold 状态 + 用户/设备绑定），
不再接受"格式合法即成功"的占位验证。支持 Pro 订阅、终身 Pro、音效包、主题包。
@ai-context: 续费叠加 max(now, old) + duration（规则层 license_rules 实现）；
snd1/thm1 内容包不升级 tier，仅解锁内容。
@ai-context: Supabase 不可用时激活请求返回 503（验真是安全关键操作，fail-closed）；
已激活用户不受影响（本地缓存 7 天宽限）。
"""

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from cache.redis_cache import get_cache
from config.providers import get_effective_tier
from cost.tracker import get_cost_tracker
from middleware.auth import verify_token
from middleware.rate_limit import get_tier_limits
from services import supabase_adapter
from services.license_rules import check_bindable, compute_expires_at

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/license", tags=["license"])


# ============================================================
# 请求/响应模型
# ============================================================

class ActivateRequest(BaseModel):
    code: str = Field(..., min_length=16, max_length=32, description="激活码")
    machine_id: str = Field(..., min_length=1, max_length=128, description="设备标识")


class ActivateResponse(BaseModel):
    success: bool
    tier: str | None = None
    type: str | None = None
    expires_at: str | None = None
    content_unlocks: list[str] = []
    message: str = ""


class QuotaResponse(BaseModel):
    used_calls: int = 0
    total_calls: int = 0
    used_cost: float = 0.0
    cost_limit: float = 0.0
    tier: str = "free"
    expires_at: str | None = None


class StatusResponse(BaseModel):
    licenses: list[dict] = []


class Plan(BaseModel):
    id: str
    name: str
    price: float
    period: str  # "month" | "year" | "lifetime"
    duration_days: int
    daily_quota: int
    featured: bool = False
    badge: str | None = None
    models: list[str] = []
    multimodal: bool = False
    early_access: int = 0
    sync_devices: int = 1
    savings: str | None = None


class PlanListResponse(BaseModel):
    plans: list[Plan]


# ============================================================
# 套餐目录（PlanCompareModal 数据源）
# ============================================================
# @ai-context: 公开套餐目录，供前端 PlanCompareModal 拉取并渲染价格/周期/
# 配额对比；无需登录（auth.PUBLIC_PATHS 白名单）。

PLANS: list[Plan] = [
    Plan(
        id="pro_monthly", name="Pro 月卡", price=12.0, period="month",
        duration_days=30, daily_quota=80, featured=False,
        models=["基础模型", "DeepSeek"], multimodal=False, early_access=0, sync_devices=2,
    ),
    Plan(
        id="pro_yearly", name="Pro 年卡", price=99.0, period="year",
        duration_days=365, daily_quota=80, featured=True, badge="最受欢迎",
        models=["基础模型", "DeepSeek"], multimodal=False, early_access=0, sync_devices=2,
        savings="省 ¥45",
    ),
    Plan(
        id="lifetime", name="终身 Pro", price=199.0, period="lifetime",
        duration_days=36500, daily_quota=120, featured=False, badge="终身早鸟价",
        models=["全部模型"], multimodal=True, early_access=5, sync_devices=3,
    ),
]


@router.get("/plans", response_model=PlanListResponse)
async def get_plans():
    """返回当前可购买套餐列表（公开接口，无需登录）。"""
    return PlanListResponse(plans=PLANS)


# ============================================================
# 激活码验证逻辑
# ============================================================

# 激活码格式：ENTROPY-{TYPE}-{XXXX}-{XXXX}
_LICENSE_PATTERN = r"^ENTROPY-(PRO|LIFE|SND1|THM1)-[A-Z0-9]{4}-[A-Z0-9]{4}$"

# 类型 → tier 映射（内容包不升级 tier）
_LICENSE_TYPE_TIER = {
    "PRO": "pro",
    "LIFE": "lifetime",
    "SND1": "free",  # 音效包不升级 tier
    "THM1": "free",  # 主题包不升级 tier
}

# 内容包类型 → 解锁内容标识
_LICENSE_CONTENT_UNLOCKS = {
    "SND1": ["soundscape-v1"],
    "THM1": ["theme-pack"],
    "PRO": [],
    "LIFE": [],
}


def validate_license_format(code: str) -> tuple[str, str] | None:
    """校验激活码格式，返回 (type, tier) 或 None"""
    match = re.match(_LICENSE_PATTERN, code)
    if not match:
        return None
    license_type = match.group(1)
    tier = _LICENSE_TYPE_TIER.get(license_type, "free")
    return license_type, tier


def _latest_expiry(rows: list[dict], license_type: str) -> str | None:
    """取用户同类型激活码中最高的到期时间（ISO 8601 字符串比较对 UTC 有效）。"""
    candidates = [r["expires_at"] for r in rows if r.get("type") == license_type and r.get("expires_at")]
    return max(candidates) if candidates else None


@router.post("/activate", response_model=ActivateResponse)
async def activate_license(
    req: ActivateRequest,
    user_id: str = Depends(verify_token),
):
    """
    激活码池验真激活

    1. 格式校验
    2. 查 Supabase 激活码池（必须存在）
    3. 状态机判定（sold 才可绑 / 幂等 / 设备上限 / 撤销拒绝）
    4. 绑定 + 到期叠加计算
    5. 写入 user_metadata.paid（仅 pro/lifetime）
    """
    # 1. 格式校验
    result = validate_license_format(req.code)
    if not result:
        raise HTTPException(status_code=400, detail="激活码格式无效")
    license_type, _ = result

    # 2. 查池
    row = await supabase_adapter.get_license_by_code(req.code)
    if row is None:
        # 池查询失败与"码不存在"统一按不可激活处理（fail-closed 于验真）
        raise HTTPException(status_code=400, detail="激活码无效")

    # 3. 绑定判定（设备上限需该用户同类型已绑定设备清单）
    user_rows = await supabase_adapter.list_licenses_by_user(user_id)
    bound_devices = [
        r["machine_id"] for r in user_rows
        if r.get("type") == row.get("type")
        and r.get("machine_id")
        and r.get("machine_id") != req.machine_id
    ]
    ok, reason = check_bindable(row, user_id, req.machine_id, bound_devices)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)

    # 4a. 幂等：同码同设备已绑定 → 直接返回现有有效期
    if row.get("status") == "bound" and row.get("machine_id") == req.machine_id:
        return ActivateResponse(
            success=True,
            tier=_LICENSE_TYPE_TIER.get(license_type, "free"),
            type=license_type.lower(),
            expires_at=row.get("expires_at"),
            content_unlocks=_LICENSE_CONTENT_UNLOCKS.get(license_type, []),
            message="该激活码此前已激活，有效期不变",
        )

    # 4b. 计算到期时间（同类型订阅续费叠加）
    duration_days = int(row.get("duration_days", 30))
    expires_at = compute_expires_at(
        _latest_expiry(user_rows, row.get("type")),
        duration_days,
    ).isoformat()

    # 5. 绑定 + 写付费身份
    bound = await supabase_adapter.bind_license(
        req.code, user_id, req.machine_id, expires_at,
    )
    if not bound:
        raise HTTPException(status_code=503, detail="激活服务暂不可用，请稍后重试")

    tier = _LICENSE_TYPE_TIER.get(license_type, "free")
    if tier in ("pro", "lifetime"):
        paid = {"tier": tier, "updated_at": datetime.now(timezone.utc).isoformat()}
        if tier == "pro":
            paid["expires_at"] = expires_at
        await supabase_adapter.update_paid_metadata(user_id, paid)

    logger.info(
        "激活码验证成功: user=%s, code=%s, type=%s, tier=%s, expires=%s",
        user_id, req.code[:12] + "...", license_type, tier, expires_at,
    )

    return ActivateResponse(
        success=True,
        tier=tier,
        type=license_type.lower(),
        expires_at=expires_at,
        content_unlocks=_LICENSE_CONTENT_UNLOCKS.get(license_type, []),
        message="激活成功",
    )


@router.get("/quota", response_model=QuotaResponse)
async def get_quota(
    request: Request,
    user_id: str = Depends(verify_token),
):
    """
    当日 AI 配额与费用使用情况（服务端权威计数，供设置页展示）。
    """
    cache = get_cache()
    today = datetime.now().strftime("%Y-%m-%d")

    # 今日调用次数（全局每日键；Redis 不可用按 0 处理）
    used_calls = 0
    if cache._client:
        try:
            raw = await cache.get(f"rate_limit:{user_id}:global:{today}")
            used_calls = int(raw) if raw else 0
        except Exception as exc:
            logger.debug("配额次数查询失败: %s", exc)

    # 今日费用与 token（cost tracker）
    usage = await get_cost_tracker().get_user_daily_usage(user_id)

    # 当前有效 tier 与限额
    beta_tier = getattr(request.state, "beta_tier", None)
    paid_tier = getattr(request.state, "paid_tier", None)
    tier = get_effective_tier(beta_tier, paid_tier)
    limits = get_tier_limits(beta_tier, paid_tier)

    # 开发者白名单（DEV_USER_IDS）：实际完全豁免限流/费用，
    # 展示层用 -1 表示无限配额（客户端渲染为 ∞，避免误导性显示 120 次/天）
    if getattr(request.state, "is_dev", False):
        return QuotaResponse(
            used_calls=used_calls,
            total_calls=-1,
            used_cost=round(usage.get("yuan", 0.0), 4),
            cost_limit=-1,
            tier="lifetime",
            expires_at=None,
        )

    # 服务端权威到期时间（用户全部绑定记录中的最高值）
    expires_at = None
    rows = await supabase_adapter.list_licenses_by_user(user_id)
    candidates = [r["expires_at"] for r in rows if r.get("expires_at")]
    if candidates:
        expires_at = max(candidates)

    return QuotaResponse(
        used_calls=used_calls,
        total_calls=int(limits.get("daily", 0)),
        used_cost=round(usage.get("yuan", 0.0), 4),
        cost_limit=float(limits.get("cost", 0.0)),
        tier=tier,
        expires_at=expires_at,
    )


@router.get("/status", response_model=StatusResponse)
async def license_status(
    user_id: str = Depends(verify_token),
):
    """
    服务端激活状态复核：返回该用户全部激活码记录。
    客户端联网时调用，校正本地缓存（跨设备同步订阅状态 / revoked / 过期）。
    """
    rows = await supabase_adapter.list_licenses_by_user(user_id)
    licenses = [
        {
            "code": r.get("code"),
            "type": r.get("type"),
            "status": r.get("status"),
            "machine_id": r.get("machine_id"),
            "expires_at": r.get("expires_at"),
        }
        for r in rows
    ]
    return StatusResponse(licenses=licenses)
