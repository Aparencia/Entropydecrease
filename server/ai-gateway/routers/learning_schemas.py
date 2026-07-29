"""
熵减 AI 网关 — 学习增强路由的请求/响应模型

@ai-context: 从 routers/learning.py 拆出的纯 Pydantic 数据契约（无副作用）。
覆盖四个学习增强端点：记忆锚点（anchor-point）、苏格拉底追问（socratic）、
预测驱动学习（predict）、卡壳三级救援（rescue）。各 Result 模型统一携带
status/model/tokens_used/latency_ms 观测字段。
"""

from typing import Optional

from pydantic import BaseModel, Field


# ============================================================
# 记忆锚点
# ============================================================


class AnchorPointRequest(BaseModel):
    """记忆锚点请求"""
    content: str = Field(..., description="笔记内容", min_length=1, max_length=8000)
    title: Optional[str] = Field(default="", description="笔记标题", max_length=200)


class AnchorPointItem(BaseModel):
    """单个记忆锚点"""
    concept: str = Field(..., description="关键概念")
    association: str = Field(default="", description="关联提示")
    memory_technique: str = Field(default="", description="记忆技巧")
    importance: float = Field(default=0.7, description="重要性 0.0-1.0")


class AnchorPointResult(BaseModel):
    """记忆锚点结果"""
    anchor_points: list[AnchorPointItem] = Field(default_factory=list)
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 苏格拉底追问
# ============================================================


class SocraticRequest(BaseModel):
    """苏格拉底追问请求"""
    topic: str = Field(..., description="学习主题", min_length=1, max_length=500)
    history: Optional[list[dict[str, str]]] = Field(
        default=None, description="对话历史 [{role, content}]"
    )


class SocraticResult(BaseModel):
    """苏格拉底追问结果"""
    question: str = Field(default="")
    hint: str = Field(default="")
    thinking_direction: str = Field(default="")
    depth_level: int = Field(default=1)
    turn_count: int = Field(default=0)
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 预测驱动学习
# ============================================================


class PredictRequest(BaseModel):
    """预测驱动学习请求"""
    content: str = Field(..., description="笔记内容", min_length=1, max_length=8000)


class PredictItem(BaseModel):
    """单个预测问题"""
    question: str = Field(..., description="预测性问题")
    type: str = Field(default="knowledge_next", description="类型")
    reason: str = Field(default="", description="为什么值得思考")
    curiosity_score: float = Field(default=0.7, description="好奇心评分")


class PredictResult(BaseModel):
    """预测驱动学习结果"""
    predictions: list[PredictItem] = Field(default_factory=list)
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 卡壳三级救援
# ============================================================


class RescueRequest(BaseModel):
    """卡壳救援请求"""
    content: str = Field(..., description="当前学习内容", min_length=1, max_length=4000)
    stuck_description: str = Field(..., description="卡壳描述", min_length=1, max_length=1000)
    attempted_methods: Optional[str] = Field(
        default="", description="已尝试的方法", max_length=1000
    )


class RescueLevelItem(BaseModel):
    """单级救援建议"""
    level: int = Field(..., description="级别 1-3")
    label: str = Field(..., description="级别标签")
    suggestion: str = Field(..., description="具体建议")
    hint_question: str = Field(default="", description="引导问题")


class RescueResult(BaseModel):
    """卡壳救援结果"""
    rescue_levels: list[RescueLevelItem] = Field(default_factory=list)
    encouragement: str = Field(default="继续加油！")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)
