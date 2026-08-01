"""
熵减 AI 网关 — Token 成本追踪器

@ai-context: 按 用户/功能/模型/日期 维度记录 token 消耗并计算费用。
使用 Redis 聚合计数器实现实时统计，异步落盘供报表使用。
PRICE_TABLE 维护各模型的千 token 单价（元），免费模型为 0。
@ai-context: record() 在每次 AI 调用成功后由路由层调用；
get_usage() 供余额查询路由和预算中间件使用。
"""

import logging
from datetime import datetime

from cache.redis_cache import get_cache

logger = logging.getLogger(__name__)

# ============================================================
# 模型定价表（元/千 token）
# ============================================================

PRICE_TABLE: dict[str, dict[str, float]] = {
    "qwen-plus":              {"input": 0.004, "output": 0.012},
    "qwen2.5-vl-72b-instruct": {"input": 0.02, "output": 0.06},
    "qwen3-asr-flash":        {"input": 0.0,   "output": 0.008},
    "glm-4.6v-flash":         {"input": 0.0,   "output": 0.0},
    "glm-asr":                {"input": 0.0,   "output": 0.0},
    "deepseek-chat":          {"input": 0.001, "output": 0.002},
    "gemini-2.0-flash":       {"input": 0.0005, "output": 0.0015},
    "fallback":               {"input": 0.0,   "output": 0.0},
}


class CostTracker:
    """Token 成本追踪器（基于 Redis 聚合计数）"""

    async def record(
        self,
        user_id: str,
        feature: str,
        model: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> float:
        """记录一次 AI 调用的 token 消耗

        Args:
            user_id: 用户 ID
            feature: 功能标识
            model: 实际使用的模型名
            input_tokens: 输入 token 数
            output_tokens: 输出 token 数

        Returns:
            本次调用费用（元）
        """
        total_tokens = input_tokens + output_tokens
        cost = self._calculate_cost(model, input_tokens, output_tokens)
        today = datetime.now().strftime("%Y-%m-%d")

        cache = get_cache()
        if not cache._client:
            return cost

        try:
            pipe = cache._client.pipeline()
            # 用户维度：日 token 总量
            pipe.incrby(f"cost:{user_id}:tokens:{today}", total_tokens)
            # 用户维度：日费用（毫元精度，避免浮点）
            pipe.incrbyfloat(f"cost:{user_id}:yuan:{today}", cost)
            # 功能维度：日调用次数
            pipe.incr(f"cost:feature:{feature}:count:{today}")
            # 功能维度：日 token 总量
            pipe.incrby(f"cost:feature:{feature}:tokens:{today}", total_tokens)
            # 模型维度：日 token 总量
            pipe.incrby(f"cost:model:{model}:tokens:{today}", total_tokens)
            # 设置过期（48 小时，留余量）
            for key_pattern in [
                f"cost:{user_id}:tokens:{today}",
                f"cost:{user_id}:yuan:{today}",
                f"cost:feature:{feature}:count:{today}",
                f"cost:feature:{feature}:tokens:{today}",
                f"cost:model:{model}:tokens:{today}",
            ]:
                pipe.expire(key_pattern, 172800)
            await pipe.execute()
        except Exception as exc:
            logger.warning("CostTracker 记录失败: %s", exc)

        return cost

    async def get_user_daily_usage(self, user_id: str) -> dict:
        """获取用户当日的 token 用量和费用"""
        today = datetime.now().strftime("%Y-%m-%d")
        cache = get_cache()
        if not cache._client:
            return {"tokens": 0, "yuan": 0.0}

        try:
            tokens_raw = await cache.get(f"cost:{user_id}:tokens:{today}")
            yuan_raw = await cache.get(f"cost:{user_id}:yuan:{today}")
            return {
                "tokens": int(tokens_raw) if tokens_raw else 0,
                "yuan": float(yuan_raw) if yuan_raw else 0.0,
                "date": today,
            }
        except Exception as exc:
            logger.warning("CostTracker 查询失败: %s", exc)
            return {"tokens": 0, "yuan": 0.0, "date": today}

    @staticmethod
    def _calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
        """根据模型定价计算费用（元）"""
        price = PRICE_TABLE.get(model, {"input": 0.01, "output": 0.03})
        return (input_tokens / 1000.0) * price["input"] + (output_tokens / 1000.0) * price["output"]


# ============================================================
# 全局单例
# ============================================================

_tracker_instance: CostTracker | None = None


def get_cost_tracker() -> CostTracker:
    """获取全局 CostTracker 实例"""
    global _tracker_instance
    if _tracker_instance is None:
        _tracker_instance = CostTracker()
    return _tracker_instance
