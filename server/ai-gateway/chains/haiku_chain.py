#!/usr/bin/env python3
"""
熵减 AI 网关 —— 学习俳句 Chain

输入：近期学习摘要（概念/错误/成就）
输出：5-7-5 俳句、白话翻译、反思、情绪标签

@ai-context: 学习俳句（R6）——反思性写作 + 情感表达 + 正念：每日俳句
（5-7-5 格式，如"闪卡翻五轮/黄金错误映初心/记忆如珊瑚"），俳句墙渲染。
"""
import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "haiku_v1.txt"

# 合法的情绪标签取值
VALID_MOODS = {"calm", "joyful", "reflective", "determined", "tired", "curious"}

# 降级结果（AI 不可用/解析失败时返回）
_DEGRADED_HAIKU = "知识如潮水/一页页翻过心间/记忆沉淀时"
_DEGRADED_TRANSLATION = "今天的学习像潮水一样涌来又沉淀，知识在心底留下痕迹"
_DEGRADED_REFLECTION = "学习是一日日积累的过程"
_DEGRADED_MOOD = "reflective"


class HaikuChain:
    """学习俳句链"""

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
        """容错解析学习俳句 JSON 输出"""
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
            logger.warning("无法解析学习俳句 JSON，返回降级结果")
            return {
                "haiku": _DEGRADED_HAIKU,
                "translation": _DEGRADED_TRANSLATION,
                "reflection": _DEGRADED_REFLECTION,
                "mood": _DEGRADED_MOOD,
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段"""
        haiku = str(data.get("haiku", "")).strip()
        if not haiku:
            haiku = _DEGRADED_HAIKU

        translation = str(data.get("translation", "")).strip()
        if not translation:
            translation = _DEGRADED_TRANSLATION

        reflection = str(data.get("reflection", "")).strip()
        if not reflection:
            reflection = _DEGRADED_REFLECTION

        mood = str(data.get("mood", "")).strip()
        if mood not in VALID_MOODS:
            mood = _DEGRADED_MOOD

        return {
            "haiku": haiku,
            "translation": translation,
            "reflection": reflection,
            "mood": mood,
        }

    async def run(self, summary: str) -> dict[str, Any]:
        """
        生成每日学习俳句

        Args:
            summary: 近期学习摘要（概念、错误、成就），为空时创作"空白日"俳句

        Returns:
            dict: {
                "haiku": "第一句5字/第二句7字/第三句5字",
                "translation": "白话翻译",
                "reflection": "学习感悟",
                "mood": "情绪标签",
                "status": "success" | "degraded",
                "model": "qwen-plus",
                "tokens_used": 1234,
                "latency_ms": 123,
            }
        """
        summary_text = (summary or "").strip() or "今日暂无学习记录，静坐温故"

        logger.info("HaikuChain.run: summary=%s", summary_text[:50])

        template = self._load_prompt_template()
        prompt = template.format(summary=summary_text)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个学习俳句师，用 5-7-5 俳句捕捉每日学习瞬间。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.8,
            max_tokens=512,
            response_format={"type": "json_object"},
            _feature="haiku",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed.get("haiku") and parsed["haiku"] != _DEGRADED_HAIKU else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
