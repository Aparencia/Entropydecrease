#!/usr/bin/env python3
"""
熵减 AI 网关 —— AI 学习教练 Chain

输入：学习统计数据、目标
输出：周计划、每日任务、调整建议

@ai-context: 学习教练——基于数据驱动的个性化学习计划生成。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "learning_coach_v1.txt"


class LearningCoachChain:
    """AI 学习教练链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _parse_response(self, content: str) -> dict[str, Any]:
        data = None

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        if data is None and "```json" in content:
            try:
                start = content.index("```json") + 7
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                pass

        if data is None and "```" in content:
            try:
                start = content.index("```") + 3
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                pass

        if data is None or not isinstance(data, dict):
            logger.warning("无法解析学习计划 JSON，返回降级结果")
            return {
                "weekly_plan": [
                    {
                        "day": "周一",
                        "tasks": [
                            {"task": "复习上周内容", "type": "review", "estimated_minutes": 25, "reason": "巩固知识"},
                            {"task": "学习新内容", "type": "new", "estimated_minutes": 25, "reason": "推进进度"},
                        ],
                    }
                ],
                "adjustments": "保持当前节奏",
                "focus_advice": "保持规律学习",
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        weekly_plan = data.get("weekly_plan", [])
        if not isinstance(weekly_plan, list):
            weekly_plan = []

        validated_plan = []
        valid_days = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"}
        valid_types = {"review", "new", "practice", "reflect"}

        for day_entry in weekly_plan:
            if not isinstance(day_entry, dict):
                continue
            day = str(day_entry.get("day", "")).strip()
            if day not in valid_days:
                continue
            tasks = day_entry.get("tasks", [])
            if not isinstance(tasks, list):
                continue
            validated_tasks = []
            for task in tasks:
                if not isinstance(task, dict):
                    continue
                task_text = str(task.get("task", "")).strip()
                task_type = str(task.get("type", "")).strip()
                if not task_text or task_type not in valid_types:
                    continue
                try:
                    minutes = int(task.get("estimated_minutes", 25))
                    minutes = max(5, min(120, minutes))
                except (TypeError, ValueError):
                    minutes = 25
                validated_tasks.append({
                    "task": task_text,
                    "type": task_type,
                    "estimated_minutes": minutes,
                    "reason": str(task.get("reason", "")).strip(),
                })
            if validated_tasks:
                validated_plan.append({"day": day, "tasks": validated_tasks})

        if not validated_plan:
            validated_plan = [
                {
                    "day": "周一",
                    "tasks": [
                        {"task": "复习上周内容", "type": "review", "estimated_minutes": 25, "reason": "巩固知识"},
                    ],
                }
            ]

        return {
            "weekly_plan": validated_plan,
            "adjustments": str(data.get("adjustments", "保持当前节奏")).strip(),
            "focus_advice": str(data.get("focus_advice", "保持规律学习")).strip(),
        }

    async def run(
        self,
        learning_stats: str = "",
        goals: str = "",
    ) -> dict[str, Any]:
        """
        生成个性化学习计划

        Args:
            learning_stats: 学习统计数据（如完成番茄钟数、正确率等）
            goals: 学习目标

        Returns:
            dict: {weekly_plan: [{day, tasks}], adjustments, focus_advice, ...}
        """
        stats_text = learning_stats.strip() or "暂无详细数据"
        goals_text = goals.strip() or "持续学习提升"

        logger.info("LearningCoachChain.run: stats=%s, goals=%s", stats_text[:80], goals_text[:80])

        template = self._load_prompt_template()
        prompt = template.format(
            learning_stats=stats_text,
            goals=goals_text,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个专业的学习教练，擅长制定个性化学习计划。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.5,
            max_tokens=2048,
            response_format={"type": "json_object"},
            _feature="learning_coach",
        )

        parsed = self._parse_response(result["content"])
        weekly_plan = parsed.get("weekly_plan", [])
        status = "success" if len(weekly_plan) >= 1 else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }