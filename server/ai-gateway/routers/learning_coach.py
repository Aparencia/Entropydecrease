"""
熵减 AI 网关 —— AI 学习教练路由

POST /api/v1/ai/learning-coach
调用 LearningCoachChain 生成个性化学习计划。

@ai-context: 学习教练路由——输入学习数据、目标，输出周计划。
"""

import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.learning_coach_chain import LearningCoachChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["AI 学习教练"])


# ============================================================
# 请求/响应模型
# ============================================================


class CoachTaskItem(BaseModel):
    task: str = Field(..., description="任务描述")
    type: str = Field(..., description="任务类型：review/new/practice/reflect")
    estimated_minutes: int = Field(..., description="预计时长（分钟）")
    reason: str = Field(default="", description="安排理由")


class DailyPlanItem(BaseModel):
    day: str = Field(..., description="星期")
    tasks: list[CoachTaskItem] = Field(default_factory=list, description="当日任务列表")


class LearningCoachRequest(BaseModel):
    learning_stats: str = Field(default="", description="学习统计数据", max_length=2000)
    goals: str = Field(default="", description="学习目标", max_length=1000)


class LearningCoachResponse(BaseModel):
    weekly_plan: list[DailyPlanItem] = Field(default_factory=list, description="周计划")
    adjustments: str = Field(default="", description="调整说明")
    focus_advice: str = Field(default="", description="重点建议")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/learning-coach", response_model=LearningCoachResponse, summary="AI 学习教练")
async def learning_coach(request: Request, body: LearningCoachRequest) -> LearningCoachResponse:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("学习教练: user=%s, stats=%s", user_id, body.learning_stats[:80] or "无")

    async def _run_chain(provider, model_name):
        chain = LearningCoachChain(provider=provider, model=model_name)
        return await chain.run(
            learning_stats=body.learning_stats,
            goals=body.goals,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "learning_coach", request, _run_chain
        )
        weekly_plan = [
            DailyPlanItem(
                day=day.get("day", ""),
                tasks=[
                    CoachTaskItem(
                        task=t.get("task", ""),
                        type=t.get("type", ""),
                        estimated_minutes=t.get("estimated_minutes", 25),
                        reason=t.get("reason", ""),
                    )
                    for t in day.get("tasks", [])
                ],
            )
            for day in result.get("weekly_plan", [])
        ]
        response = LearningCoachResponse(
            weekly_plan=weekly_plan,
            adjustments=result.get("adjustments", ""),
            focus_advice=result.get("focus_advice", ""),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("学习教练完成: provider=%s, days=%d", used_provider, len(weekly_plan))
    except RuntimeError as e:
        logger.warning("学习教练服务不可用，降级响应: %s", str(e))
        response = LearningCoachResponse(
            weekly_plan=[
                DailyPlanItem(
                    day="周一",
                    tasks=[
                        CoachTaskItem(task="复习上周内容", type="review", estimated_minutes=25, reason="巩固知识"),
                        CoachTaskItem(task="学习新内容", type="new", estimated_minutes=25, reason="推进进度"),
                    ],
                ),
            ],
            adjustments="保持当前节奏",
            focus_advice="保持规律学习",
            status="fallback",
            model="local_rule",
        )
    return response