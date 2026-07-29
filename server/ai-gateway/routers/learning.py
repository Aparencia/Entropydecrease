"""
熵减 AI 网关 — 学习增强路由

POST /api/v1/ai/anchor-point     — 记忆锚点生成
POST /api/v1/ai/socratic         — 苏格拉底追问
POST /api/v1/ai/predict          — 预测驱动学习
POST /api/v1/ai/rescue           — 卡壳三级救援

@ai-context: 学习增强路由：记忆锚点/苏格拉底追问/预测驱动/卡壳救援四端点，模型契约见 learning_schemas。
"""

import logging
from typing import Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, Request

from config import call_with_fallback_for_request
from chains.anchor_point_chain import AnchorPointChain
from chains.socratic_chain import SocraticChain
from chains.predict_chain import PredictChain
from chains.rescue_chain import RescueChain
from routers.learning_schemas import (
    AnchorPointRequest,
    AnchorPointResult,
    SocraticRequest,
    SocraticResult,
    PredictRequest,
    PredictResult,
    RescueRequest,
    RescueResult,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["学习增强"])


# ============================================================
# 路由处理 — 记忆锚点
# ============================================================


@router.post(
    "/anchor-point",
    response_model=AnchorPointResult,
    summary="记忆锚点生成",
)
async def anchor_point(
    request: Request, body: AnchorPointRequest
) -> AnchorPointResult:
    """从笔记中提取 3-5 个记忆锚点（关键概念 + 关联提示 + 记忆技巧）"""
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "记忆锚点请求: user=%s, title=%s, content_length=%d",
        user_id, body.title, len(body.content),
    )

    async def _run_chain(provider, model_name):
        chain = AnchorPointChain(provider=provider, model=model_name)
        return await chain.run(content=body.content, title=body.title or "")

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "anchor_point", request, _run_chain
        )
        anchor_points = [
            AnchorPointItem(
                concept=ap.get("concept", ""),
                association=ap.get("association", ""),
                memory_technique=ap.get("memory_technique", ""),
                importance=ap.get("importance", 0.7),
            )
            for ap in result.get("anchor_points", [])
        ]
        response = AnchorPointResult(
            anchor_points=anchor_points,
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("记忆锚点完成: provider=%s, count=%d", used_provider, len(anchor_points))
    except RuntimeError as e:
        logger.warning("记忆锚点服务不可用，降级响应: %s", str(e))
        response = AnchorPointResult(
            anchor_points=[],
            status="error",
            model="fallback",
        )

    return response


# ============================================================
# 路由处理 — 苏格拉底追问
# ============================================================


@router.post(
    "/socratic",
    response_model=SocraticResult,
    summary="苏格拉底式追问",
)
async def socratic(
    request: Request, body: SocraticRequest
) -> SocraticResult:
    """生成启发式追问，引导学习者自主思考（不直接给答案）"""
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "苏格拉底请求: user=%s, topic=%s, history_count=%d",
        user_id, body.topic[:50], len(body.history or []),
    )

    async def _run_chain(provider, model_name):
        chain = SocraticChain(provider=provider, model=model_name)
        return await chain.run(topic=body.topic, history=body.history)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "socratic", request, _run_chain
        )
        response = SocraticResult(
            question=result.get("question", ""),
            hint=result.get("hint", ""),
            thinking_direction=result.get("thinking_direction", ""),
            depth_level=result.get("depth_level", 1),
            turn_count=result.get("turn_count", 0),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("苏格拉底完成: provider=%s", used_provider)
    except RuntimeError as e:
        logger.warning("苏格拉底服务不可用，降级响应: %s", str(e))
        response = SocraticResult(
            question="你能用自己的话解释一下这个概念吗？",
            hint="试着从你已知的部分开始",
            thinking_direction="自由表达",
            status="error",
            model="fallback",
        )

    return response


# ============================================================
# 路由处理 — 预测驱动学习
# ============================================================


@router.post(
    "/predict",
    response_model=PredictResult,
    summary="预测驱动学习",
)
async def predict(
    request: Request, body: PredictRequest
) -> PredictResult:
    """从笔记中生成 3-5 个预测性问题（后续知识 / 应用场景 / 跨学科连接）"""
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("预测请求: user=%s, content_length=%d", user_id, len(body.content))

    async def _run_chain(provider, model_name):
        chain = PredictChain(provider=provider, model=model_name)
        return await chain.run(content=body.content)

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "predict", request, _run_chain
        )
        predictions = [
            PredictItem(
                question=p.get("question", ""),
                type=p.get("type", "knowledge_next"),
                reason=p.get("reason", ""),
                curiosity_score=p.get("curiosity_score", 0.7),
            )
            for p in result.get("predictions", [])
        ]
        response = PredictResult(
            predictions=predictions,
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("预测完成: provider=%s, count=%d", used_provider, len(predictions))
    except RuntimeError as e:
        logger.warning("预测服务不可用，降级响应: %s", str(e))
        response = PredictResult(
            predictions=[],
            status="error",
            model="fallback",
        )

    return response


# ============================================================
# 路由处理 — 卡壳三级救援
# ============================================================


@router.post(
    "/rescue",
    response_model=RescueResult,
    summary="卡壳三级救援",
)
async def rescue(
    request: Request, body: RescueRequest
) -> RescueResult:
    """提供三级递进帮助：提示线索 → 简化问题 → 替代路径"""
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info(
        "救援请求: user=%s, content_length=%d, stuck_length=%d",
        user_id, len(body.content), len(body.stuck_description),
    )

    async def _run_chain(provider, model_name):
        chain = RescueChain(provider=provider, model=model_name)
        return await chain.run(
            content=body.content,
            stuck_description=body.stuck_description,
            attempted_methods=body.attempted_methods or "",
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "rescue", request, _run_chain
        )
        rescue_levels = [
            RescueLevelItem(
                level=lv.get("level", 1),
                label=lv.get("label", ""),
                suggestion=lv.get("suggestion", ""),
                hint_question=lv.get("hint_question", ""),
            )
            for lv in result.get("rescue_levels", [])
        ]
        response = RescueResult(
            rescue_levels=rescue_levels,
            encouragement=result.get("encouragement", "继续加油！"),
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("救援完成: provider=%s, levels=%d", used_provider, len(rescue_levels))
    except RuntimeError as e:
        logger.warning("救援服务不可用，降级响应: %s", str(e))
        response = RescueResult(
            rescue_levels=[
                RescueLevelItem(level=1, label="提示线索", suggestion="回顾基础概念，寻找遗漏", hint_question="最核心的定义是什么？"),
                RescueLevelItem(level=2, label="简化问题", suggestion="将问题拆解为更小的子问题", hint_question="最简单的情况会怎样？"),
                RescueLevelItem(level=3, label="替代路径", suggestion="换一种方式重新整理问题", hint_question="能用另一种方式表达吗？"),
            ],
            encouragement="AI 救援暂时不可用，但请继续加油！",
            status="error",
            model="fallback",
        )

    return response
