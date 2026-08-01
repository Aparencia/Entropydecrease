"""
熵减 AI 网关 — 成本追踪包

@ai-context: 按 用户/功能/模型/日期 维度追踪 token 消耗与费用，
支持预算硬限制和告警。tracker 负责记录，budget 负责拦截。
"""

from cost.tracker import CostTracker, get_cost_tracker  # noqa: F401
from cost.budget import BudgetMiddleware  # noqa: F401
