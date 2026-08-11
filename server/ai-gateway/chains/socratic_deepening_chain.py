"""
熵减 AI 网关 — 苏格拉底深化角度生成 Chain

基于主题和对话历史，生成 5 个个性化的纵深思考角度

@ai-context: 苏格拉底深化 Chain：在已有理解上进一步深挖概念本质。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "socratic_deepening_v1.txt"


class SocraticDeepeningChain:
    """苏格拉底深化角度生成链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _format_history(self, history: list[dict[str, str]]) -> str:
        """格式化对话历史"""
        if not history:
            return "无"
        lines: list[str] = []
        for msg in history[-8:]:
            role = msg.get("role", "learner")
            content = str(msg.get("content", "")).strip()
            if not content:
                continue
            if role in ("learner", "user"):
                lines.append(f"学习者：{content}")
            else:
                lines.append(f"导师：{content}")
        return "\n".join(lines) if lines else "无"

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
            logger.warning("无法解析深化角度 JSON，返回降级结果")
            return {"angles": []}

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应"""
        angles = []
        for item in data.get("angles", []):
            key = str(item.get("key", "")).strip()
            label = str(item.get("label", "")).strip()
            question = str(item.get("question", "")).strip()
            if key and label and question:
                angles.append({
                    "key": key,
                    "label": label,
                    "question": question,
                })
        return {"angles": angles[:5]}

    async def run(
        self,
        topic: str,
        dialogue_summary: str = "",
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """
        生成个性化深化角度

        Args:
            topic:           学习主题
            dialogue_summary: 追问对话摘要
            history:         对话历史

        Returns:
            dict: {angles: [...], status, model, tokens_used, latency_ms}
        """
        logger.info("SocraticDeepeningChain.run: topic=%s", topic[:80])

        template = self._load_prompt_template()
        history_text = self._format_history(history or [])
        prompt = template.format(
            topic=topic,
            dialogue_summary=dialogue_summary or "无",
            history=history_text,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一位教学设计专家，帮助学习者从多角度深化理解。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.7,
            max_tokens=512,
            response_format={"type": "json_object"},
            _feature="socratic_deepening",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed["angles"] else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
