#!/usr/bin/env python3
"""
熵减 AI 网关 —— 概念拟人化 Chain

输入：概念、相关概念（可选）
输出：人物卡、概念关系戏剧

@ai-context: 概念拟人化——通过角色扮演让抽象概念变得生动可记忆。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "personify_v1.txt"


class PersonifyChain:
    """概念拟人化链"""

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
            logger.warning("无法解析概念拟人化 JSON，返回降级结果")
            return {
                "persona_card": {
                    "name": "概念小精灵",
                    "personality": "神秘、好奇",
                    "backstory": "来自抽象世界的概念精灵",
                    "catchphrase": "想要理解我，就多想想吧！",
                },
                "relationships": [],
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        persona_card = data.get("persona_card", {})
        if not isinstance(persona_card, dict):
            persona_card = {}

        name = str(persona_card.get("name", "概念小精灵")).strip()
        personality = str(persona_card.get("personality", "神秘、好奇")).strip()
        backstory = str(persona_card.get("backstory", "来自抽象世界的概念精灵")).strip()
        catchphrase = str(persona_card.get("catchphrase", "想要理解我，就多想想吧！")).strip()

        relationships = data.get("relationships", [])
        if not isinstance(relationships, list):
            relationships = []

        validated_rels = []
        for rel in relationships:
            if not isinstance(rel, dict):
                continue
            other = str(rel.get("other_concept", "")).strip()
            rel_type = str(rel.get("relation_type", "")).strip()
            if not other or rel_type not in ("causal", "analogy", "opposite"):
                continue
            validated_rels.append({
                "other_concept": other,
                "relation_type": rel_type,
                "relation_type_name": rel.get("relation_type_name", ""),
                "story": str(rel.get("story", "")).strip(),
            })

        return {
            "persona_card": {
                "name": name,
                "personality": personality,
                "backstory": backstory,
                "catchphrase": catchphrase,
            },
            "relationships": validated_rels,
        }

    async def run(
        self,
        concept: str,
        related_concepts: str = "",
    ) -> dict[str, Any]:
        """
        生成概念拟人化角色卡

        Args:
            concept: 要拟人化的概念
            related_concepts: 相关概念列表（逗号分隔）

        Returns:
            dict: {persona_card, relationships, ...}
        """
        concept = concept.strip()
        related = related_concepts.strip() or "无"

        logger.info("PersonifyChain.run: concept=%s", concept[:50])

        template = self._load_prompt_template()
        prompt = template.format(
            concept=concept,
            related_concepts=related,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个概念拟人化专家，擅长将抽象概念变成生动的角色。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.8,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="personify",
        )

        parsed = self._parse_response(result["content"])
        persona_card = parsed.get("persona_card", {})
        status = "success" if persona_card.get("name") and persona_card["name"] != "概念小精灵" else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }