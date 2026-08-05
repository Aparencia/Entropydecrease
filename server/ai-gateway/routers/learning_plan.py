"""
熵减 AI 网关 — 学习规划路由（P1 学习规划器）

POST /api/v1/ai/learning-plan — 根据客户端聚合的学习状态生成今日学习计划

@ai-context: 学习规划路由：输入为客户端本地聚合的摘要（掌握度/到期卡/节律/
周目标），输出每日任务计划；degraded 状态表示模型输出不可用时客户端应回退
本地规则规划。
"""

import logging

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator

from config import call_with_fallback_for_request
from chains.learning_plan_chain import LearningPlanChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["学习规划"])


# ============================================================
# 请求/响应模型
# ============================================================


class LearningPlanRequest(BaseModel):
    """学习状态摘要（客户端本地聚合，网关不接触原始数据）"""
    mastery_summary: str = Field(default="", max_length=3000, description="掌握度摘要文本（各主题档位）")
    due_counts: dict[str, int] | None = Field(default=None, description="各牌组到期卡数")
    peak_hours: list[int] | None = Field(default=None, description="个人高峰时段（0-23）")
    weekly_goal_minutes: int | None = Field(default=None, ge=0, le=10080, description="周目标学习分钟")
    today_minutes: int | None = Field(default=None, ge=0, le=1440, description="今日已学习分钟")

    @field_validator("peak_hours")
    @classmethod
    def _validate_peak_hours(cls, v: list[int] | None) -> list[int] | None:
        """高峰时段必须在 0-23 且去重（防御异常入参进入 prompt）"""
        if v is None:
            return None
        return sorted({h for h in v if 0 <= h <= 23})


class PlanItem(BaseModel):
    module: str = Field(description="任务模块：pomodoro/notes/flashcards/feynman/inspiration")
    title: str
    minutes: int
    task: str
    reason: str
    order: int


class LearningPlanResult(BaseModel):
    date: str
    items: list[PlanItem]
    note: str
    status: str
    model: str
    tokens_used: int = 0


# ============================================================
# 路由处理
# ============================================================


@router.post(
    "/learning-plan",
    response_model=LearningPlanResult,
    summary="今日学习计划生成",
)
async def learning_plan(
    request: Request, body: LearningPlanRequest
) -> LearningPlanResult:
    """根据学习状态生成今日任务计划（到期卡优先、节律匹配、掌握度导向）"""
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "学习计划请求: user=%s, mastery_len=%d, due_decks=%d",
        user_id, len(body.mastery_summary), len(body.due_counts or {}),
    )

    # 聚合上下文文本（所有字段可选，空则模型按默认规则生成）
    parts: list[str] = []
    if body.mastery_summary:
        parts.append(f"掌握度摘要：{body.mastery_summary}")
    if body.due_counts:
        due_text = "、".join(f"{k} {v} 张" for k, v in sorted(body.due_counts.items(), key=lambda x: -x[1]))
        parts.append(f"今日到期卡片：{due_text}")
    if body.peak_hours:
        parts.append(f"个人高峰时段：{body.peak_hours} 点")
    if body.weekly_goal_minutes is not None:
        parts.append(f"周目标：{body.weekly_goal_minutes} 分钟")
    if body.today_minutes is not None:
        parts.append(f"今日已学习：{body.today_minutes} 分钟")
    context_text = "\n".join(parts) if parts else "（无历史数据，生成一份轻量入门计划）"

    async def _run_chain(provider, model_name):
        chain = LearningPlanChain(provider=provider, model=model_name)
        return await chain.run(context_text=context_text)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "learning_plan", request, _run_chain
        )
    except Exception as exc:
        logger.error("学习计划生成失败: user=%s, error=%s", user_id, exc)
        return LearningPlanResult(
            date="",
            items=[],
            note="",
            status="degraded",
            model="none",
            tokens_used=0,
        )

    items = [
        PlanItem(
            module=item.get("module", ""),
            title=item.get("title", ""),
            minutes=int(item.get("minutes", 30)),
            task=item.get("task", ""),
            reason=item.get("reason", ""),
            order=int(item.get("order", i + 1)),
        )
        for i, item in enumerate(result.get("items", []))
        if item.get("module")
    ]
    return LearningPlanResult(
        date=result.get("date", ""),
        items=items,
        note=result.get("note", ""),
        status=result.get("status", "success"),
        model=result.get("model", "unknown"),
        tokens_used=result.get("tokens_used", 0),
    )
