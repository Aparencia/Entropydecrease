#!/usr/bin/env python3
"""
熵减 AI 网关 —— 内容分层 Chain（N5 策略性遗忘标记）

输入：单篇笔记文本
输出：core/support/detail 三层原文摘录，帮助用户聚焦核心概念

@ai-context: 策略性遗忘（strategic forgetting）——主动抑制不相关信息与
记住核心信息同等重要。JSON Mode 输出 + 字段校验，非法条目直接过滤。
"""
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "content_tier_v1.txt"

VALID_TIERS = ("core", "support", "detail")
TIER_LIMITS = {"core": 5, "support": 6, "detail": 6}


class ContentTierChain:
    """内容分层链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    @staticmethod
    def _validate_items(items: Any, tier: str) -> List[Dict[str, str]]:
        """校验单层条目列表，非法条目过滤"""
        if not isinstance(items, list):
            return []
        result: List[Dict[str, str]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text", "")).strip()
            if not text:
                continue
            entry: Dict[str, str] = {"text": text}
            if tier == "core":
                entry["reason"] = str(item.get("reason", "")).strip()
            result.append(entry)
            if len(result) >= TIER_LIMITS[tier]:
                break
        return result

    async def run(
        self,
        notes_text: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        生成内容分层

        Args:
            notes_text: 笔记文本（前端已截断）
            options: 预留选项

        Returns:
            dict: {core, support, detail, model, tokens_used, latency_ms}
        """
        template = self._load_prompt_template()
        prompt = template.format(notes=notes_text[:6000])  # token 控制

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一位认知负荷管理专家，擅长从笔记中提炼核心概念。请严格按 JSON 格式输出。",
            model=self.model,
            temperature=0.3,
            max_tokens=2500,
            response_format={"type": "json_object"},
        )

        try:
            content = result["content"].strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()
            data = json.loads(content)

            tiers = {tier: self._validate_items(data.get(tier), tier) for tier in VALID_TIERS}
            if not tiers["core"]:
                raise ValueError("no core items generated")

            return {
                **tiers,
                "model": result.get("model", "unknown"),
                "tokens_used": result.get("tokens_used", 0),
                "latency_ms": result.get("latency_ms", 0),
            }
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error("ContentTierChain.parse_error: %s, content=%s", str(e), result.get("content", "")[0:200])
            return {
                "core": [],
                "support": [],
                "detail": [],
                "model": "fallback",
                "tokens_used": 0,
                "latency_ms": 0,
            }
