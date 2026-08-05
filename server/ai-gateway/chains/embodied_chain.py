#!/usr/bin/env python3
"""
熵减 AI 网关 —— 概念具身化 Chain

输入：抽象概念（如"力矩"）
输出：身体动作建议列表（手势/动作描述/概念含义/难度）+ 整体建议

@ai-context: 概念具身化（W6）——具身认知（P45）+ 多模态编码：AI 为抽象概念
建议对应的身体动作（如"力矩"→用手臂模拟杠杆），费曼+具身联动强化编码。
"""
import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "embodied_v1.txt"

# 合法的难度取值
VALID_DIFFICULTY = {"easy", "medium", "hard"}

# 降级结果（AI 不可用/解析失败时返回）
_DEGRADED_ACTIONS = [
    {
        "gesture": "双手比划",
        "description": "用双手在身前比划出概念的核心结构，先慢后快重复三遍",
        "meaning": "通过空间手势建立概念的身体表征",
        "difficulty": "easy",
    },
    {
        "gesture": "身体转动",
        "description": "双脚站稳，以腰为轴缓慢转动身体，体会概念中的方向与旋转",
        "meaning": "用身体运动编码概念的方向性与动态过程",
        "difficulty": "medium",
    },
]
_DEGRADED_SUGGESTION = "把动作融入费曼讲解：每次说到这个概念时都做一遍对应手势，加深记忆"


class EmbodiedChain:
    """概念具身化链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _parse_response(self, content: str) -> dict[str, Any]:
        """容错解析概念具身化 JSON 输出"""
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
            logger.warning("无法解析概念具身化 JSON，返回降级结果")
            return {
                "actions": _DEGRADED_ACTIONS,
                "suggestion": _DEGRADED_SUGGESTION,
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段"""
        actions = data.get("actions", [])
        if not isinstance(actions, list):
            actions = []

        validated_actions: list[dict[str, Any]] = []
        for action in actions:
            if not isinstance(action, dict):
                continue
            gesture = str(action.get("gesture", "")).strip()
            difficulty = str(action.get("difficulty", "")).strip()
            # 缺动作名或难度非法时丢弃该项（LLM 输出质量问题）
            if not gesture or difficulty not in VALID_DIFFICULTY:
                continue
            validated_actions.append({
                "gesture": gesture,
                "description": str(action.get("description", "")).strip(),
                "meaning": str(action.get("meaning", "")).strip(),
                "difficulty": difficulty,
            })

        if not validated_actions:
            return {
                "actions": _DEGRADED_ACTIONS,
                "suggestion": _DEGRADED_SUGGESTION,
            }

        suggestion = str(data.get("suggestion", "")).strip()
        if not suggestion:
            suggestion = _DEGRADED_SUGGESTION

        return {
            "actions": validated_actions,
            "suggestion": suggestion,
        }

    async def run(self, concept: str) -> dict[str, Any]:
        """
        生成概念具身化动作建议

        Args:
            concept: 要具身化的抽象概念

        Returns:
            dict: {
                "actions": [{"gesture": "...", "description": "...", "meaning": "...", "difficulty": "..."}],
                "suggestion": "整体建议",
                "status": "success" | "degraded",
                "model": "qwen-plus",
                "tokens_used": 1234,
                "latency_ms": 123,
            }
        """
        concept = concept.strip()

        logger.info("EmbodiedChain.run: concept=%s", concept[:50])

        template = self._load_prompt_template()
        prompt = template.format(concept=concept)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个具身认知专家，擅长为抽象概念设计身体动作。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.7,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="embodied",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed.get("actions") and parsed["actions"] != _DEGRADED_ACTIONS else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
