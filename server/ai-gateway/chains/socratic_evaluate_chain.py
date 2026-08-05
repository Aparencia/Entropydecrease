"""
熵减 AI 网关 — 苏格拉底回答评估 Chain

四维度评估用户回答：准确度、完整度、逻辑清晰度、表达通俗度

@ai-context: 苏格拉底四维度评估 Chain：对回答做准确/完整/逻辑/表达四维评分。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "socratic_evaluate_v1.txt"


class SocraticEvaluateChain:
    """苏格拉底回答评估链"""

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
        for msg in history[-10:]:  # 最多保留10条
            role = msg.get("role", "learner")
            content = str(msg.get("content", "")).strip()
            if not content:
                continue
            if role == "learner":
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
            logger.warning("无法解析评估 JSON，返回降级结果")
            return {
                "dimensions": {"accuracy": 5, "completeness": 5, "logic": 5, "expression": 5},
                "feedback": "评估服务暂不可用，请继续深入思考。",
                "encouragement": "坚持追问自己'为什么'，是最好的学习方式。",
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化评分"""
        dims = data.get("dimensions", {})

        def clamp_score(val: Any, default: float = 5.0) -> float:
            try:
                score = float(val)
                return max(0.0, min(10.0, score))
            except (TypeError, ValueError):
                return default

        return {
            "dimensions": {
                "accuracy": clamp_score(dims.get("accuracy")),
                "completeness": clamp_score(dims.get("completeness")),
                "logic": clamp_score(dims.get("logic")),
                "expression": clamp_score(dims.get("expression")),
            },
            "feedback": str(data.get("feedback", "")).strip(),
            "encouragement": str(data.get("encouragement", "继续思考，你会越来越深入！")).strip(),
        }

    async def run(
        self,
        topic: str,
        question: str,
        answer: str,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """
        评估用户回答

        Args:
            topic:    学习主题
            question: AI 提出的问题
            answer:   用户的回答
            history:  对话历史

        Returns:
            dict: {dimensions, feedback, encouragement, status, model, tokens_used, latency_ms}
        """
        logger.info(
            "SocraticEvaluateChain.run: topic=%s, answer_length=%d",
            topic[:50], len(answer),
        )

        history_text = self._format_history(history or [])
        template = self._load_prompt_template()
        prompt = template.format(
            topic=topic,
            question=question,
            answer=answer,
            history=history_text,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一位温和的学习评估专家，请客观评估学习者的回答质量。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.4,
            max_tokens=512,
            response_format={"type": "json_object"},
            _feature="socratic_evaluate",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed["feedback"] else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
