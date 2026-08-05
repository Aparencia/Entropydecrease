"""
熵减 AI 网关 — 预测驱动学习 Chain

从学习笔记中生成预测性问题：
- 后续知识预测（knowledge_next）
- 应用场景预测（application）
- 跨学科连接（connection）

@ai-context: 预测驱动学习 Chain：生成预测性问题激发主动思考。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "predict_v1.txt"

# 最大输入长度（字符数）
MAX_INPUT_LENGTH = 6000

# 有效的预测类型
VALID_TYPES = {"knowledge_next", "application", "connection"}


class PredictChain:
    """预测驱动学习链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _preprocess_input(self, text: str) -> str:
        """预处理输入文本"""
        text = text.strip()
        if len(text) > MAX_INPUT_LENGTH:
            text = text[:MAX_INPUT_LENGTH] + "\n\n[注：内容过长，已截断]"
        return text

    def _parse_predictions(self, content: str) -> list[dict[str, Any]]:
        """容错解析预测问题 JSON"""
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
            logger.warning("无法解析预测问题 JSON，返回降级结果")
            return []

        return self._validate_predictions(data)

    def _validate_predictions(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """验证并规范化预测字段"""
        raw_predictions = data.get("predictions", [])
        if not isinstance(raw_predictions, list):
            return []

        validated: list[dict[str, Any]] = []
        for item in raw_predictions[:5]:  # 最多 5 个
            if not isinstance(item, dict):
                continue

            question = str(item.get("question", "")).strip()
            if not question:
                continue

            ptype = str(item.get("type", "knowledge_next")).strip()
            if ptype not in VALID_TYPES:
                ptype = "knowledge_next"

            reason = str(item.get("reason", "")).strip()

            try:
                curiosity_score = float(item.get("curiosity_score", 0.7))
                curiosity_score = max(0.0, min(1.0, curiosity_score))
            except (TypeError, ValueError):
                curiosity_score = 0.7

            validated.append({
                "question": question,
                "type": ptype,
                "reason": reason,
                "curiosity_score": round(curiosity_score, 2),
            })

        return validated

    async def run(
        self,
        content: str,
    ) -> dict[str, Any]:
        """
        执行预测问题生成

        Args:
            content: 学习笔记内容

        Returns:
            dict: {predictions, status, model, tokens_used, latency_ms}
        """
        processed_content = self._preprocess_input(content)

        logger.info("PredictChain.run: content_length=%d", len(processed_content))

        template = self._load_prompt_template()
        prompt = template.format(content=processed_content)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是学习预测专家，擅长推断后续学习内容。请务必以 JSON 格式输出结果。",
            model=self.model,
            temperature=0.6,
            max_tokens=1536,
            response_format={"type": "json_object"},
            _feature="predict",
        )

        predictions = self._parse_predictions(result["content"])
        status = "success" if predictions else "degraded"

        return {
            "predictions": predictions,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
