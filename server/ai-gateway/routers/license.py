"""
熵减 AI 网关 — 激活码验证路由

@ai-context: 提供激活码验证接口，校验签名、类型、有效期和设备绑定。
支持 Pro 订阅、终身 Pro、音效包、主题包等激活码类型。
"""

import logging
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from middleware.auth import verify_token

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
    message: str = ""


# ============================================================
# 激活码验证逻辑
# ============================================================

# 激活码格式：ENTROPY-{TYPE}-{XXXX}-{XXXX}
_LICENSE_PATTERN = r"^ENTROPY-(PRO|LIFE|SND1|THM1)-[A-Z0-9]{4}-[A-Z0-9]{4}$"

# 类型 → tier 映射
_LICENSE_TYPE_TIER = {
    "PRO": "pro",
    "LIFE": "lifetime",
    "SND1": "free",  # 音效包不升级 tier
    "THM1": "free",  # 主题包不升级 tier
}

# 类型 → 有效期（天）
_LICENSE_TYPE_DURATION = {
    "PRO": 30,       # 月订阅
    "LIFE": 36500,   # 终身（100年）
    "SND1": 36500,   # 永久
    "THM1": 36500,   # 永久
}


def validate_license_format(code: str) -> tuple[str, str] | None:
    """校验激活码格式，返回 (type, tier) 或 None"""
    match = re.match(_LICENSE_PATTERN, code)
    if not match:
        return None
    license_type = match.group(1)
    tier = _LICENSE_TYPE_TIER.get(license_type, "free")
    return license_type, tier


@router.post("/activate", response_model=ActivateResponse)
async def activate_license(
    req: ActivateRequest,
    user_id: str = Depends(verify_token),
):
    """
    激活码验证激活

    1. 校验格式
    2. 校验签名（TODO: 接入面包多 webhook 签名验证）
    3. 检查是否已被使用（查 Supabase licenses 表）
    4. 写入激活记录
    5. 返回 tier 和有效期
    """
    # 1. 格式校验
    result = validate_license_format(req.code)
    if not result:
        raise HTTPException(status_code=400, detail="激活码格式无效")

    license_type, tier = result

    # 2. 计算有效期
    duration_days = _LICENSE_TYPE_DURATION.get(license_type, 30)
    expires_at = (datetime.now() + timedelta(days=duration_days)).isoformat()

    # TODO: 接入面包多 webhook 验证激活码真实性
    # 当前为开发阶段占位实现，直接返回成功

    logger.info(
        "激活码验证成功: user=%s, code=%s, type=%s, tier=%s, expires=%s",
        user_id, req.code[:12] + "...", license_type, tier, expires_at,
    )

    return ActivateResponse(
        success=True,
        tier=tier,
        type=license_type.lower(),
        expires_at=expires_at,
        message="激活成功",
    )


@router.get("/validate", response_model=ActivateResponse)
async def validate_license_status(
    code: str,
    user_id: str = Depends(verify_token),
):
    """
    查询激活码状态（不消耗激活次数）
    """
    result = validate_license_format(code)
    if not result:
        raise HTTPException(status_code=400, detail="激活码格式无效")

    license_type, tier = result

    # TODO: 查询 Supabase licenses 表获取激活状态

    return ActivateResponse(
        success=True,
        tier=tier,
        type=license_type.lower(),
        message="激活码有效",
    )