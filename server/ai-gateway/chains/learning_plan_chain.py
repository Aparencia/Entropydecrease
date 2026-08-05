"""
熵减 AI 网关 — 学习计划 Chain（P1 学习规划器）

将客户端聚合的学习状态（掌握度摘要/到期卡数/节律偏好/周目标）转化为
一份今日学习计划：
- 输入为客户端本地聚合的摘要文本（本地优先，网关不接触原始数据）
- 输出 JSON {"date", "items": [...], "note"}，解析失败时 status=degraded
- 模块白名单校验：pomodoro/notes/flashcards/feynman/inspiration

@ai-context: Learning plan chain: turns a client-aggregated learning state
snapshot into a daily plan. Output modules are whitelisted.
"""

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# 状态摘要文本最大长度（字符数，防御异常入参）
MAX_CONTEXT_LENGTH = 3000

# 允许输出的模块白名单（与客户端 features/planner 类型保持一致）
ALLOWED_MODULES = frozenset({"pomodoro", "notes", "flashcards", "feynman", "inspiration"})

# 计划项时长上限（分钟，防御模型输出异常值）
MAX_ITEM_MINUTES = 120

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "learning_plan_v1.txt"

with open(PROMPT_TEMPLATE_PATH, encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read().strip()

USER_PROMPT_TEMPLATE = """用户今日学习状态：

{context_text}

请生成今日学习计划，严格按系统要求返回 JSON。"""


class LearningPlanChain:
    """今日学习计划生成链"""

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model

    def _parse_items(self, content: str) -> tuple[list[dict[str, Any]], str]:
        """容错解析计划 JSON（标准 JSON / markdown 代码块），返回 (items, note)"""
        data = None

        # 尝试 1：直接解析
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        # 尝试 2：提取 markdown 代码块
        if data is None and "```" in content:
            fence = "```json" if "```json" in content else "```"
            try:
                start = content.index(fence) + len(fence)
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                pass

        if not isinstance(data, dict):
            logger.warning("学习计划 JSON 解析失败")
            return [], ""

        raw_items = data.get("items", [])
        items: list[dict[str, Any]] = []
        for raw in raw_items if isinstance(raw_items, list) else []:
            if not isinstance(raw, dict):
                continue
            module = str(raw.get("module", "")).strip()
            if module not in ALLOWED_MODULES:
                continue
            try:
                minutes = max(1, min(int(raw.get("minutes", 30)), MAX_ITEM_MINUTES))
            except (TypeError, ValueError):
                minutes = 30
            items.append({
                "module": module,
                "title": str(raw.get("title", "")).strip()[:60],
                "minutes": minutes,
                "task": str(raw.get("task", "")).strip()[:200],
                "reason": str(raw.get("reason", "")).strip()[:200],
                "order": len(items) + 1,
            })

        note = str(data.get("note", "")).strip()[:120]
        return items, note

    async def run(self, context_text: str) -> dict[str, Any]:
        """
        执行学习计划生成

        Args:
            context_text: 客户端聚合的学习状态摘要文本

        Returns:
            dict: {date, items, note, status, model, tokens_used, latency_ms}
        """
        processed = context_text.strip()
        if len(processed) > MAX_CONTEXT_LENGTH:
            processed = processed[:MAX_CONTEXT_LENGTH]
        # 空上下文自兜底（chain 独立可测）：与路由层拼接逻辑保持同一文案
        if not processed:
            processed = "（无历史数据，生成一份轻量入门计划）"

        logger.info("LearningPlanChain.run: context_length=%d", len(processed))

        prompt = USER_PROMPT_TEMPLATE.format(context_text=processed)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            model=self.model,
            temperature=0.6,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="learning_plan",
        )

        items, note = self._parse_items(result["content"])
        status = "success" if items else "degraded"

        return {
            "date": date.today().isoformat(),
            "items": items,
            "note": note,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
