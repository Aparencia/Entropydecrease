"""
熵减 AI 网关 —— 学习叙事 RPG 路由

POST /api/v1/ai/learning-narrative
调用 LearningNarrativeChain 将每周学习数据编织成深海冒险章节（叙事心理学）。

@ai-context: 学习叙事 RPG 路由——输入周统计/当前章节/成就，输出章节名、故事、
角色进化、里程碑与下一章悬念；复用 call_with_fallback_for_request 降级链。
"""
import logging
from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.learning_narrative_chain import LearningNarrativeChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["学习叙事 RPG"])


# ============================================================
# 请求/响应模型
# ============================================================


class LearningNarrativeRequest(BaseModel):
    """学习叙事 RPG 请求"""
    learning_stats: str = Field(default="", description="本周学习统计（如：学习5天，正确率65%）", max_length=2000)
    current_chapter: str = Field(default="", description="当前章节（上次返回的章节名）", max_length=200)
    achievements: list[str] = Field(default_factory=list, description="本周成就列表", max_length=50)


class MilestoneItem(BaseModel):
    """里程碑项"""
    title: str = Field(..., description="里程碑标题")
    description: str = Field(default="", description="里程碑描述")


class LearningNarrativeResponse(BaseModel):
    """学习叙事 RPG 响应"""
    chapter_title: str = Field(..., description="本章节名")
    chapter_story: str = Field(default="", description="本章冒险故事")
    role_evolution: str = Field(default="", description="当前角色称号")
    milestones: list[MilestoneItem] = Field(default_factory=list, description="里程碑列表")
    next_chapter_hint: str = Field(default="", description="下一章悬念")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/learning-narrative", response_model=LearningNarrativeResponse, summary="生成本周学习叙事章节")
async def learning_narrative(request: Request, body: LearningNarrativeRequest) -> LearningNarrativeResponse:
    """
    基于本周学习数据生成叙事化章节（章节名/冒险故事/角色进化/里程碑/悬念）
    """
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "学习叙事 RPG: user=%s, chapter=%s, achievements=%d",
        user_id, body.current_chapter[:50], len(body.achievements),
    )

    async def _run_chain(provider, model_name):
        chain = LearningNarrativeChain(provider=provider, model=model_name)
        return await chain.run(
            learning_stats=body.learning_stats,
            current_chapter=body.current_chapter,
            achievements=body.achievements,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "learning_narrative", request, _run_chain
        )
        response = LearningNarrativeResponse(
            chapter_title=result.get("chapter_title", ""),
            chapter_story=result.get("chapter_story", ""),
            role_evolution=result.get("role_evolution", ""),
            milestones=[
                MilestoneItem(
                    title=ms.get("title", ""),
                    description=ms.get("description", ""),
                )
                for ms in result.get("milestones", [])
            ],
            next_chapter_hint=result.get("next_chapter_hint", ""),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("学习叙事 RPG 完成: provider=%s, chapter=%s", used_provider, response.chapter_title[:30])
    except RuntimeError as e:
        logger.warning("学习叙事 RPG 服务不可用，降级响应: %s", str(e))
        response = LearningNarrativeResponse(
            chapter_title="深海启航",
            chapter_story="本周你继续在知识之海中深潜。每一次复习都是向更深处的探索，每一道错题都是暗礁上的警示灯。",
            role_evolution="新手潜航员",
            milestones=[
                MilestoneItem(title="首次深潜完成", description="完成本周的学习任务，向知识之海迈出坚实一步"),
            ],
            next_chapter_hint="下周的海流将带你驶向更深的领域，保持节奏，继续下潜",
            status="fallback",
            model="local_rule",
        )
    return response
