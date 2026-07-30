"""
熵减 AI 网关 — 闪卡优化 Chain

优化闪卡的正面和背面表述：
1. 分析当前卡片内容的清晰度
2. 生成更简洁、更易记忆的表述
3. 提供改进说明

@ai-context: 闪卡优化 Chain：改进既有闪卡的正面/背面表述质量。
"""

import json
import logging
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)


class OptimizeCardChain:
    """闪卡内容优化链"""

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model

    def _build_prompt(self, front: str, back: str) -> str:
        return (
            f"当前闪卡内容：\n"
            f"正面：{front}\n"
            f"背面：{back}\n\n"
            f"请优化这张闪卡的内容表述。"
        )

    def _parse_result(self, content: str) -> dict[str, Any]:
        """
        解析模型输出为结构化优化结果

        期望格式：
        {
            "suggested_front": "...",
            "suggested_back": "...",
            "improvements": ["..."]
        }
        """
        # 尝试直接解析 JSON
        try:
            data = json.loads(content)
            return self._validate_result(data)
        except json.JSONDecodeError:
            pass

        # 尝试提取 markdown 代码块中的 JSON
        if "```json" in content:
            try:
                start = content.index("```json") + 7
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
                return self._validate_result(data)
            except (json.JSONDecodeError, ValueError):
                pass

        if "```" in content:
            try:
                start = content.index("```") + 3
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
                return self._validate_result(data)
            except (json.JSONDecodeError, ValueError):
                pass

        # 无法解析时返回原始内容
        logger.warning("无法解析闪卡优化 JSON，返回原始内容")
        return {
            "suggested_front": "",
            "suggested_back": "",
            "improvements": ["AI 输出格式异常，请稍后重试"],
        }

    def _validate_result(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化优化结果字段"""
        suggested_front = str(data.get("suggested_front", "")).strip()
        suggested_back = str(data.get("suggested_back", "")).strip()
        improvements = [str(s) for s in data.get("improvements", []) if s]

        return {
            "suggested_front": suggested_front,
            "suggested_back": suggested_back,
            "improvements": improvements,
        }

    async def run(self, front: str, back: str) -> dict[str, Any]:
        """
        执行闪卡优化

        Args:
            front: 当前卡片正面内容
            back: 当前卡片背面内容

        Returns:
            dict: 优化后的卡片内容 + 改进说明
        """
        logger.info(
            "OptimizeCardChain.run: front_length=%d, back_length=%d",
            len(front), len(back),
        )

        prompt = self._build_prompt(front, back)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=(
                "你是一位闪卡内容优化专家。请改进以下闪卡的正面和背面表述，"
                "使其更简洁、更易记忆、更有利于间隔重复学习。\n"
                "正面应该是一个清晰的问题或提示。\n"
                "背面应该是一个简洁但完整的答案。\n"
                "请务必以 JSON 格式输出，包含以下字段：\n"
                '{"suggested_front": "优化后的正面", "suggested_back": "优化后的背面", '
                '"improvements": ["改进说明1", "改进说明2"]}'
            ),
            model=self.model,
            temperature=0.4,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        optimized = self._parse_result(result["content"])

        return {
            **optimized,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
