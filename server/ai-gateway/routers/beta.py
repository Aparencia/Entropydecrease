"""
熵减 AI 网关 — 内测专属 API

@ai-context: 提供内测邀请码使用、身份查询等接口。
"""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from middleware.auth import verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/beta", tags=["beta"])


# ============================================================
# 请求/响应模型
# ============================================================

class UseInviteRequest(BaseModel):
    code: str = Field(..., min_length=8, max_length=32, description="邀请码")


class UseInviteResponse(BaseModel):
    success: bool
    tier: str = "observer"
    cohort: int = 1
    message: str = ""


class BetaProfileResponse(BaseModel):
    tier: str = "free"
    cohort: int = 0
    joined_at: str | None = None
    lifetime_pro: bool = False
    badges: list[str] = []
    effective_tier: str = "free"


# ============================================================
# 邀请码验证逻辑
# ============================================================

_INVITE_PATTERN = r"^INVITE-[A-Z0-9]{4}-[A-Z0-9]{4}$"


@router.post("/use-invite", response_model=UseInviteResponse)
async def use_invite_code(
    req: UseInviteRequest,
    user_id: str = Depends(verify_token),
):
    """
    使用邀请码加入内测

    1. 校验格式
    2. 校验邀请码是否有效（未使用、未过期）
    3. 标记邀请码已使用
    4. 更新用户 beta 身份为 observer
    """
    if not re.match(_INVITE_PATTERN, req.code):
        raise HTTPException(status_code=400, detail="邀请码格式无效")

    # TODO: 查 Supabase invite_codes 表验证邀请码
    # TODO: 标记邀请码已使用（used_by_user_id, used_at）
    # TODO: 更新用户 user_metadata.beta.tier = 'observer'
    # TODO: 给邀请者增加贡献积分

    logger.info(
        "邀请码使用成功: user=%s, code=%s",
        user_id, req.code[:12] + "...",
    )

    return UseInviteResponse(
        success=True,
        tier="observer",
        cohort=1,
        message="欢迎加入内测！你的身份已更新为内测观察者",
    )


@router.get("/profile", response_model=BetaProfileResponse)
async def get_beta_profile(
    user_id: str = Depends(verify_token),
):
    """
    查询当前用户的内测身份信息
    """
    # TODO: 从 Supabase auth.users.user_metadata 读取 beta 信息
    # 当前为开发阶段占位实现

    return BetaProfileResponse(
        tier="free",
        cohort=0,
        lifetime_pro=False,
        badges=[],
        effective_tier="free",
    )