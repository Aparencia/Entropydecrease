"""
熵减 AI 网关 — 苏格拉底头脑风暴 Chain

从5个发散角度（类比/反例/应用/历史/争议）生成创意联想

@ai-context: 苏格拉底头脑风暴 Chain：围绕主题发散式提问，引导用户多角度思考。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "socratic_brainstorm_v1.txt"


class SocraticBrainstormChain:
    """苏格拉底头脑风暴链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _parse_response(self, content: str) -> dict[str, Any]:
        """容错解析"""
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
            logger.warning("无法解析头脑风暴 JSON，返回降级结果")
            return {"ideas": []}

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应"""
        ideas = []
        for item in data.get("ideas", []):
            title = str(item.get("title", "")).strip()
            description = str(item.get("description", "")).strip()
            category = str(item.get("category", "")).strip()
            if title and description:
                ideas.append({
                    "title": title,
                    "description": description,
                    "category": category,
                })

        # 确保至少5个角度
        return {"ideas": ideas[:10]}  # 最多10个

    async def run(self, topic: str, context: str = "") -> dict[str, Any]:
        """
        生成头脑风暴创意

        Args:
            topic:   学习主题
            context: 额外上下文

        Returns:
            dict: {ideas: [...], status, model, tokens_used, latency_ms}
        """
        logger.info(
            "SocraticBrainstormChain.run: topic=%s", topic[:80],
        )

        template = self._load_prompt_template()
        prompt = template.format(topic=topic, context=context or "无")

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一位创意导师，帮助学习者从多角度发散思考。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.85,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="socratic_brainstorm",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed["ideas"] else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
