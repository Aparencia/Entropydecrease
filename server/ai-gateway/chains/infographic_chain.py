#!/usr/bin/env python3
"""
熵减 AI 网关 —— 知识信息图生成器 Chain

输入：内容（课程/笔记）
输出：信息图结构（标题、章节、关键关系）

@ai-context: 信息图——将知识转化为视觉化结构，增强理解与记忆。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "infographic_v1.txt"


class InfographicChain:
    """知识信息图生成器链"""

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
            logger.warning("无法解析信息图 JSON，返回降级结果")
            return {
                "title": "知识概览",
                "style": "academic",
                "style_name": "学术简约",
                "sections": [
                    {
                        "heading": "核心概念",
                        "points": [{"text": "待分析内容", "importance": 5}],
                    }
                ],
                "key_relationships": [],
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        title = str(data.get("title", "知识概览")).strip()
        if not title:
            title = "知识概览"

        style = str(data.get("style", "academic")).strip()
        if style not in ("academic", "tech", "warm"):
            style = "academic"

        style_name = str(data.get("style_name", "学术简约")).strip()

        sections = data.get("sections", [])
        if not isinstance(sections, list):
            sections = []

        validated_sections = []
        for section in sections:
            if not isinstance(section, dict):
                continue
            heading = str(section.get("heading", "")).strip()
            if not heading:
                continue
            points = section.get("points", [])
            if not isinstance(points, list):
                continue
            validated_points = []
            for point in points:
                if not isinstance(point, dict):
                    continue
                text = str(point.get("text", "")).strip()
                if not text:
                    continue
                try:
                    importance = int(point.get("importance", 3))
                    importance = max(1, min(5, importance))
                except (TypeError, ValueError):
                    importance = 3
                validated_points.append({"text": text, "importance": importance})
            if validated_points:
                validated_sections.append({"heading": heading, "points": validated_points})

        if not validated_sections:
            validated_sections = [
                {
                    "heading": "核心概念",
                    "points": [{"text": "待分析内容", "importance": 5}],
                }
            ]

        relationships = data.get("key_relationships", [])
        if not isinstance(relationships, list):
            relationships = []
        validated_rels = []
        for rel in relationships:
            if not isinstance(rel, dict):
                continue
            from_concept = str(rel.get("from", "")).strip()
            to_concept = str(rel.get("to", "")).strip()
            relation = str(rel.get("relation", "")).strip()
            if from_concept and to_concept:
                validated_rels.append({
                    "from": from_concept,
                    "to": to_concept,
                    "relation": relation,
                })

        return {
            "title": title,
            "style": style,
            "style_name": style_name,
            "sections": validated_sections,
            "key_relationships": validated_rels,
        }

    async def run(
        self,
        content: str,
        content_type: str = "general",
    ) -> dict[str, Any]:
        """
        生成信息图结构

        Args:
            content: 课程/笔记内容
            content_type: 内容类型（如 physics, history, tech 等）

        Returns:
            dict: {title, style, sections, key_relationships, ...}
        """
        logger.info("InfographicChain.run: content=%s", content[:80])

        template = self._load_prompt_template()
        prompt = template.format(
            content=content,
            content_type=content_type,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个知识信息图设计师，擅长将内容转化为结构化信息图。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.5,
            max_tokens=2048,
            response_format={"type": "json_object"},
            _feature="infographic",
        )

        parsed = self._parse_response(result["content"])
        sections = parsed.get("sections", [])
        status = "success" if len(sections) >= 1 else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }