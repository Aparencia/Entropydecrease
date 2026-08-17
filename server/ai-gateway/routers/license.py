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
    # AI 额度包充值次数（AIINF=-1 不限量；非额度包为 None）
    quota_balance: int | None = None


class QuotaResponse(BaseModel):
    used_calls: int = 0
    total_calls: int = 0
    used_cost: float = 0.0
    cost_limit: float = 0.0
    tier: str = "free"
    expires_at: str | None = None
    # AI 额度包剩余次数（无额度包时为 0；AIINF 无限额度为 -1）
    quota_balance: int = 0


class ConsumeRequest(BaseModel):
    count: int = Field(1, ge=1, le=100, description="本次调用消耗次数（默认 1）")


class ConsumeResponse(BaseModel):
    success: bool
    remaining: int = 0
    message: str = ""


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
# 套餐目录（充值页数据源）
# ============================================================
# @ai-context: 公开套餐目录，供前端充值页拉取并渲染价格/周期/配额对比；
# 无需登录（auth.PUBLIC_PATHS 白名单）。会员时长 6 档 + AI 额度包 4 档。
# @ai-context: 额度包纯次数充值（不升级 tier）；会员含 AI 额度+模型档位+同步发布。

PLANS: list[Plan] = [
    # ── 会员时长（升级 tier）──
    Plan(
        id="mem_1d", name="Pro 体验日卡", price=1.0, period="day",
        duration_days=1, daily_quota=80, featured=False,
        models=["基础模型", "DeepSeek"], multimodal=False, early_access=0, sync_devices=2,
    ),
    Plan(
        id="mem_7d", name="Pro 周卡", price=6.0, period="week",
        duration_days=7, daily_quota=80, featured=False,
        models=["基础模型", "DeepSeek"], multimodal=False, early_access=0, sync_devices=2,
    ),
    Plan(
        id="mem_1m", name="Pro 月卡", price=12.0, period="month",
        duration_days=30, daily_quota=80, featured=True, badge="最受欢迎",
        models=["基础模型", "DeepSeek"], multimodal=False, early_access=0, sync_devices=2,
    ),
    Plan(
        id="mem_3m", name="Pro 季卡", price=30.0, period="quarter",
        duration_days=90, daily_quota=80, featured=False,
        models=["基础模型", "DeepSeek"], multimodal=False, early_access=0, sync_devices=2,
        savings="省 ¥6",
    ),
    Plan(
        id="mem_1y", name="Pro 年卡", price=99.0, period="year",
        duration_days=365, daily_quota=80, featured=False, badge="年度早鸟价",
        models=["基础模型", "DeepSeek"], multimodal=False, early_access=0, sync_devices=2,
        savings="省 ¥45",
    ),
    Plan(
        id="mem_life", name="终身 Pro", price=199.0, period="lifetime",
        duration_days=36500, daily_quota=120, featured=False, badge="终身早鸟价",
        models=["全部模型"], multimodal=True, early_access=5, sync_devices=3,
    ),
    # ── AI 额度包（纯次数，不升级 tier）──
    Plan(
        id="ai_50", name="AI 额度包 50 次", price=5.0, period="quota",
        duration_days=0, daily_quota=0, featured=False,
        models=[], multimodal=False, early_access=0, sync_devices=1,
    ),
    Plan(
        id="ai_200", name="AI 额度包 200 次", price=16.0, period="quota",
        duration_days=0, daily_quota=0, featured=True, badge="超值",
        models=[], multimodal=False, early_access=0, sync_devices=1,
    ),
    Plan(
        id="ai_500", name="AI 额度包 500 次", price=35.0, period="quota",
        duration_days=0, daily_quota=0, featured=False,
        models=[], multimodal=False, early_access=0, sync_devices=1,
        savings="省 ¥9",
    ),
    Plan(
        id="ai_inf", name="AI 额度包 不限量", price=99.0, period="quota",
        duration_days=0, daily_quota=0, featured=False,
        models=[], multimodal=False, early_access=0, sync_devices=1,
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
# @ai-context 类型前缀（新旧并存）：
#   会员时长：MEM1(1天)/MEM7(7天)/MEM30(1月)/MEM90(3月)/YEARS(1年)/LIFE(终身)
#   AI 额度包：AI50/AI200/AI500/AIINF(不限)
#   兼容旧码：PRO(月卡)/LIFE(终身)/SND1(音效包)/THM1(主题包)
_LICENSE_PATTERN = r"^ENTROPY-(MEM1|MEM7|MEM30|MEM90|YEARS|LIFE|AI50|AI200|AI500|AIINF|PRO|SND1|THM1)-[A-Z0-9]{4}-[A-Z0-9]{4}$"

# 类型 → tier 映射（内容包/额度包不升级 tier）
_LICENSE_TYPE_TIER = {
    "MEM1": "pro",
    "MEM7": "pro",
    "MEM30": "pro",
    "MEM90": "pro",
    "YEARS": "pro",
    "LIFE": "lifetime",
    "PRO": "pro",
    "SND1": "free",  # 音效包不升级 tier
    "THM1": "free",  # 主题包不升级 tier
}

# 内容包类型 → 解锁内容标识
_LICENSE_CONTENT_UNLOCKS = {
    "SND1": ["soundscape-v1"],
    "THM1": ["theme-pack"],
}

# AI 额度包 → 充值次数（AIINF=-1 表示不限量，consume 不扣减）
_LICENSE_QUOTA_BALANCE = {
    "AI50": 50,
    "AI200": 200,
    "AI500": 500,
    "AIINF": -1,
}

# 额度包类型集合（consume 扣减时只认这些）
_QUOTA_TYPES = set(_LICENSE_QUOTA_BALANCE.keys())


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

    # 4b. 计算到期时间（同类型订阅续费叠加；额度包无到期概念）
    duration_days = int(row.get("duration_days", 30))
    expires_at = compute_expires_at(
        _latest_expiry(user_rows, row.get("type")),
        duration_days,
    ).isoformat()

    # 4c. 额度包：携带充值次数（AIINF=-1 不限量），不参与到期计算
    quota_balance = _LICENSE_QUOTA_BALANCE.get(license_type)

    # 5. 绑定 + 写付费身份
    bound = await supabase_adapter.bind_license(
        req.code, user_id, req.machine_id, expires_at, quota_balance=quota_balance,
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
        "激活码验证成功: user=%s, code=%s, type=%s, tier=%s, expires=%s, quota=%s",
        user_id, req.code[:12] + "...", license_type, tier, expires_at, quota_balance,
    )

    return ActivateResponse(
        success=True,
        tier=tier,
        type=license_type.lower(),
        expires_at=expires_at,
        content_unlocks=_LICENSE_CONTENT_UNLOCKS.get(license_type, []),
        message="激活成功",
        quota_balance=quota_balance,
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

    # AI 额度包总余额（无额度包 0；AIINF 无限 -1，与开发者 total_calls=-1 语义一致）
    quota_balance = 0
    quota_rows = await supabase_adapter.list_quota_licenses_by_user(user_id)
    for r in quota_rows:
        if r.get("type", "").upper() not in _QUOTA_TYPES or r.get("status") != "bound":
            continue
        balance = int(r.get("quota_balance", 0) or 0)
        if balance == -1:
            quota_balance = -1
            break
        quota_balance += max(0, balance)

    return QuotaResponse(
        used_calls=used_calls,
        total_calls=int(limits.get("daily", 0)),
        used_cost=round(usage.get("yuan", 0.0), 4),
        cost_limit=float(limits.get("cost", 0.0)),
        tier=tier,
        expires_at=expires_at,
        quota_balance=quota_balance,
    )


@router.post("/consume", response_model=ConsumeResponse)
async def consume_quota(
    req: ConsumeRequest,
    user_id: str = Depends(verify_token),
):
    """
    扣减 AI 额度包余额（每次 AI 调用成功后由客户端调用）。

    规则：AIINF(-1) 不限量不扣减；有余额的额度包按余额降序扣减；
    余额不足返回 success=False（调用方降级提示，不拦截 AI 主流程）。
    """
    quota_rows = [
        r for r in await supabase_adapter.list_quota_licenses_by_user(user_id)
        if r.get("type", "").upper() in _QUOTA_TYPES and r.get("status") == "bound"
    ]
    if not quota_rows:
        return ConsumeResponse(success=False, remaining=0, message="无可用额度包")

    # 不限量额度包：不扣减直接返回
    if any(int(r.get("quota_balance", 0) or 0) == -1 for r in quota_rows):
        return ConsumeResponse(success=True, remaining=-1, message="不限量额度")

    # 按余额降序扣减（优先消耗余额最大的包）
    for r in sorted(
        quota_rows,
        key=lambda x: int(x.get("quota_balance", 0) or 0),
        reverse=True,
    ):
        balance = int(r.get("quota_balance", 0) or 0)
        if balance <= 0:
            continue
        ok = await supabase_adapter.decrement_quota_balance(r["code"], req.count)
        if ok:
            # 重算剩余（被扣包用扣减前快照，防 mock 池对象引用被原地修改导致双扣）
            remaining = 0
            for q in quota_rows:
                bal = balance - req.count if q["code"] == r["code"] else int(q.get("quota_balance", 0) or 0)
                remaining += max(0, bal)
            return ConsumeResponse(success=True, remaining=remaining, message="扣减成功")

    return ConsumeResponse(success=False, remaining=0, message="额度包余额不足")


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
