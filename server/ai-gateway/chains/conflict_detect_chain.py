#!/usr/bin/env python3
"""
熵减 AI 网关 —— 概念冲突检测 Chain（N6）

输入：新笔记文本 + 历史理解文本（旧笔记/费曼讲解摘录）
输出：矛盾冲突列表（旧表述/新表述/主题/修正建议）

@ai-context: 错误概念转变（misconception change）——错误概念是自洽的
替代框架，需先破后立。JSON Mode 输出 + 字段校验，非法条目直接过滤。
"""
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "conflict_detect_v1.txt"

MAX_CONFLICTS = 5


class ConflictDetectChain:
    """概念冲突检测链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    @staticmethod
    def _validate_conflict(item: Any) -> Optional[Dict[str, str]]:
        """校验单条冲突，非法返回 None"""
        if not isinstance(item, dict):
            return None
        old_claim = str(item.get("old_claim", "")).strip()
        new_claim = str(item.get("new_claim", "")).strip()
        if not old_claim or not new_claim:
            return None
        return {
            "old_claim": old_claim,
            "new_claim": new_claim,
            "topic": str(item.get("topic", "")).strip(),
            "suggestion": str(item.get("suggestion", "")).strip(),
        }

    async def run(
        self,
        new_note_text: str,
        history_text: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        检测概念冲突

        Args:
            new_note_text: 新笔记文本（前端已截断）
            history_text: 历史理解文本（前端已截断）
            options: 预留选项

        Returns:
            dict: {conflicts, model, tokens_used, latency_ms}
        """
        template = self._load_prompt_template()
        prompt = template.format(
            new_note=new_note_text[:3000],
            history=history_text[:3000],
        )  # token 控制

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一位概念转变研究专家，擅长识别学习者新旧理解之间的矛盾。请严格按 JSON 格式输出。",
            model=self.model,
            temperature=0.3,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )

        try:
            content = result["content"].strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()
            data = json.loads(content)

            raw_conflicts: List[Any] = data.get("conflicts", [])
            conflicts = [c for c in (self._validate_conflict(rc) for rc in raw_conflicts) if c]

            return {
                "conflicts": conflicts[:MAX_CONFLICTS],
                "model": result.get("model", "unknown"),
                "tokens_used": result.get("tokens_used", 0),
                "latency_ms": result.get("latency_ms", 0),
            }
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error("ConflictDetectChain.parse_error: %s, content=%s", str(e), result.get("content", "")[0:200])
            return {
                "conflicts": [],
                "model": "fallback",
                "tokens_used": 0,
                "latency_ms": 0,
            }
