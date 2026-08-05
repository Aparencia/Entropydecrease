#!/usr/bin/env python3
"""
熵减 AI 网关 —— 反直觉发现器 Chain

输入：用户近期学习主题（可选）
输出：反直觉事实、分类、解释、与学习的关联

@ai-context: 反直觉学习——挑战思维定势，激发好奇心。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "counterintuitive_v1.txt"


class CounterintuitiveChain:
    """反直觉发现器链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _parse_response(self, content: str) -> dict[str, Any]:
        """容错解析反直觉事实 JSON"""
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
            logger.warning("无法解析反直觉事实 JSON，返回降级结果")
            return {
                "fact": "我们常以为地球是圆的，但严格来说它更像一个扁球体——两极略扁，赤道略鼓。",
                "category": "counter_intuitive",
                "category_name": "违反直觉",
                "explanation": "直觉上我们以为地球是完美的球体，但自转产生的离心力让赤道地区略微隆起。",
                "relation_to_learning": "通用知识",
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        fact = str(data.get("fact", "")).strip()
        if not fact:
            fact = "我们常以为地球是圆的，但严格来说它更像一个扁球体。"

        category = str(data.get("category", "counter_intuitive")).strip()
        if category not in ("common_sense", "counter_intuitive", "paradox", "counter_example"):
            category = "counter_intuitive"

        category_name = str(data.get("category_name", "违反直觉")).strip()
        explanation = str(data.get("explanation", "")).strip()
        relation_to_learning = str(data.get("relation_to_learning", "通用知识")).strip()

        return {
            "fact": fact,
            "category": category,
            "category_name": category_name,
            "explanation": explanation,
            "relation_to_learning": relation_to_learning,
        }

    async def run(
        self,
        learning_topics: str = "",
    ) -> dict[str, Any]:
        """
        生成反直觉事实

        Args:
            learning_topics: 用户近期学习主题（可选）

        Returns:
            dict: {fact, category, category_name, explanation, relation_to_learning, ...}
        """
        topics = learning_topics.strip() or "无（通用知识）"

        logger.info("CounterintuitiveChain.run: topics=%s", topics[:80])

        template = self._load_prompt_template()
        prompt = template.format(learning_topics=topics)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个知识渊博的反直觉发现者，熟悉各学科的有趣知识。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.8,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="counterintuitive",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed.get("fact") else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }