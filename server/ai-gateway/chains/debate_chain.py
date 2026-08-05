#!/usr/bin/env python3
"""
熵减 AI 网关 —— AI 辩论对手 Chain

输入：辩论主题、类型、立场、历史
输出：论点、反论点、证据质量、挑战、轮次

@ai-context: 辩论学习法——通过辩论促进深度理解和批判性思维。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "debate_v1.txt"


class DebateChain:
    """AI 辩论对手链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _parse_response(self, content: str) -> dict[str, Any]:
        """容错解析辩论输出 JSON"""
        data = None

        # 尝试 1：直接解析
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        # 尝试 2：提取 markdown 代码块
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
            logger.warning("无法解析辩论输出 JSON，返回降级结果")
            return {
                "argument": "让我们从基本假设开始——你愿意先明确你的核心论点吗？",
                "counter_argument": "我们可以从不同角度审视这个问题。",
                "evidence_quality": "medium",
                "challenge": "你能用一个具体的例子支撑你的立场吗？",
                "round_number": 1,
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段"""
        argument = str(data.get("argument", "")).strip()
        if not argument:
            argument = "让我们从基本假设开始——你愿意先明确你的核心论点吗？"

        counter_argument = str(data.get("counter_argument", "")).strip()
        if not counter_argument:
            counter_argument = "我们可以从不同角度审视这个问题。"

        evidence_quality = str(data.get("evidence_quality", "medium")).strip()
        if evidence_quality not in ("high", "medium", "low"):
            evidence_quality = "medium"

        challenge = str(data.get("challenge", "")).strip()

        try:
            round_number = int(data.get("round_number", 1))
            round_number = max(1, min(10, round_number))
        except (TypeError, ValueError):
            round_number = 1

        return {
            "argument": argument,
            "counter_argument": counter_argument,
            "evidence_quality": evidence_quality,
            "challenge": challenge,
            "round_number": round_number,
        }

    async def run(
        self,
        topic: str,
        debate_type: str = "academic",
        stance: str = "",
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """
        生成辩论论点

        Args:
            topic: 辩论主题
            debate_type: 辩论类型（academic/policy/value/philosophy）
            stance: 用户立场
            history: 辩论历史

        Returns:
            dict: {argument, counter_argument, evidence_quality, challenge, round_number, ...}
        """
        if debate_type not in ("academic", "policy", "value", "philosophy"):
            debate_type = "academic"

        history_text = "无（第一轮辩论）"
        round_number = 1
        if history:
            lines = []
            for i, msg in enumerate(history):
                role = msg.get("role", "user")
                content = str(msg.get("content", "")).strip()
                if content:
                    lines.append(f"{role}：{content}")
            if lines:
                history_text = "\n".join(lines)
                round_number = min(len(lines) // 2 + 1, 10)

        logger.info(
            "DebateChain.run: topic=%s, type=%s, round=%d",
            topic[:50], debate_type, round_number,
        )

        template = self._load_prompt_template()
        prompt = template.format(
            topic=topic,
            debate_type=debate_type,
            stance=stance,
            history=history_text,
            round_number=round_number,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个专业的辩论对手，擅长逻辑推理和论证。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.7,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="debate",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed["argument"] != "让我们从基本假设开始——你愿意先明确你的核心论点吗？" else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }