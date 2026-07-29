"""
熵减 AI 网关 — 卡壳三级救援 Chain

当学习者卡壳时提供三级递进帮助：
- Level 1：提示线索（引导性提示）
- Level 2：简化问题（拆解子问题）
- Level 3：替代路径（全新解决思路）

@ai-context: 卡壳三级救援 Chain：按卡壳程度给出分级递进的救援建议。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "rescue_v1.txt"

# 最大输入长度（字符数）
MAX_CONTENT_LENGTH = 3000
MAX_STUCK_LENGTH = 1000
MAX_ATTEMPTED_LENGTH = 1000


class RescueChain:
    """卡壳三级救援链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _preprocess_field(self, text: str, max_length: int) -> str:
        """预处理单个输入字段"""
        text = text.strip()
        if len(text) > max_length:
            text = text[:max_length] + "..."
        return text or "（未提供）"

    def _parse_rescue(self, content: str) -> dict[str, Any]:
        """容错解析三级救援 JSON"""
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

        if data is None:
            logger.warning("无法解析三级救援 JSON，返回降级结果")
            return self._fallback_rescue()

        return self._validate_rescue(data)

    def _fallback_rescue(self) -> dict[str, Any]:
        """降级响应：通用三级建议"""
        return {
            "rescue_levels": [
                {
                    "level": 1,
                    "label": "提示线索",
                    "suggestion": "试着回顾一下相关的基础概念，看看有没有遗漏",
                    "hint_question": "这个概念最核心的定义是什么？",
                },
                {
                    "level": 2,
                    "label": "简化问题",
                    "suggestion": "把问题分解，先解决最简单的部分，再逐步扩展",
                    "hint_question": "如果只考虑最简单的情况，会怎样？",
                },
                {
                    "level": 3,
                    "label": "替代路径",
                    "suggestion": "换一个角度，用画图或列表的方式重新整理问题",
                    "hint_question": "能用另一种方式表达这个问题吗？",
                },
            ],
            "encouragement": "卡壳是学习的一部分，继续加油！",
        }

    def _validate_rescue(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化救援字段"""
        raw_levels = data.get("rescue_levels", [])
        if not isinstance(raw_levels, list) or len(raw_levels) < 1:
            return self._fallback_rescue()

        validated_levels: list[dict[str, Any]] = []
        for item in raw_levels[:3]:  # 最多 3 级
            if not isinstance(item, dict):
                continue

            try:
                level = int(item.get("level", len(validated_levels) + 1))
                level = max(1, min(3, level))
            except (TypeError, ValueError):
                level = len(validated_levels) + 1

            label = str(item.get("label", f"Level {level}")).strip()
            suggestion = str(item.get("suggestion", "")).strip()
            hint_question = str(item.get("hint_question", "")).strip()

            if not suggestion:
                continue

            validated_levels.append({
                "level": level,
                "label": label,
                "suggestion": suggestion,
                "hint_question": hint_question,
            })

        # 确保有三级
        if len(validated_levels) < 3:
            fallback = self._fallback_rescue()
            return fallback

        encouragement = str(data.get("encouragement", "继续加油！")).strip()

        return {
            "rescue_levels": validated_levels,
            "encouragement": encouragement,
        }

    async def run(
        self,
        content: str,
        stuck_description: str,
        attempted_methods: str = "",
    ) -> dict[str, Any]:
        """
        执行三级救援

        Args:
            content:           当前学习内容
            stuck_description: 卡壳描述
            attempted_methods: 已尝试的方法

        Returns:
            dict: {rescue_levels, encouragement, status, model, tokens_used, latency_ms}
        """
        processed_content = self._preprocess_field(content, MAX_CONTENT_LENGTH)
        processed_stuck = self._preprocess_field(stuck_description, MAX_STUCK_LENGTH)
        processed_attempted = self._preprocess_field(attempted_methods, MAX_ATTEMPTED_LENGTH)

        logger.info(
            "RescueChain.run: content_length=%d, stuck_length=%d",
            len(processed_content), len(processed_stuck),
        )

        template = self._load_prompt_template()
        prompt = template.format(
            content=processed_content,
            stuck_description=processed_stuck,
            attempted_methods=processed_attempted,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是学习救援专家，提供三级递进帮助。请务必以 JSON 格式输出结果。",
            model=self.model,
            temperature=0.5,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="rescue",
        )

        parsed = self._parse_rescue(result["content"])
        status = "success" if parsed.get("rescue_levels") else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
