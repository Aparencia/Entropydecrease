#!/usr/bin/env python3
"""
熵减 AI 网关 —— 概念预检 Chain（E1 错误概念先破后立）

输入：目标概念 + 学习者历史薄弱点/错题摘要
输出：1-2 个探测性问题（question + intent）

@ai-context: 费曼讲解前的概念预检——先暴露潜在错误认知再开始讲解。
JSON Mode 输出 + 字段校验，非法条目直接过滤；问题为空视为失败走 fallback。
"""
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "concept_precheck_v1.txt"

MAX_QUESTIONS = 2


class ConceptPrecheckChain:
    """概念预检探测链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    @staticmethod
    def _validate_question(item: Any) -> Optional[Dict[str, str]]:
        """校验单个问题，非法返回 None"""
        if not isinstance(item, dict):
            return None
        question = str(item.get("question", "")).strip()
        if not question:
            return None
        return {
            "question": question,
            "intent": str(item.get("intent", "")).strip(),
        }

    async def run(
        self,
        concept: str,
        weak_history: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        生成概念预检探测问题

        Args:
            concept: 目标概念
            weak_history: 历史薄弱点/错题摘要（前端已截断，可为空）
            options: 预留选项

        Returns:
            dict: {questions, model, tokens_used, latency_ms}
        """
        template = self._load_prompt_template()
        prompt = template.format(
            concept=concept[:500],
            weak_history=weak_history[:2000] or "（暂无历史薄弱点记录）",
        )  # token 控制

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一位善于发现学习误区的热心教练，擅长用开放式问题帮助学习者自我觉察误解。请严格按 JSON 格式输出。",
            model=self.model,
            temperature=0.5,
            max_tokens=1000,
            response_format={"type": "json_object"},
        )

        try:
            content = result["content"].strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()
            data = json.loads(content)

            raw_questions: List[Any] = data.get("questions", [])
            questions = [q for q in (self._validate_question(rq) for rq in raw_questions) if q]

            if not questions:
                raise ValueError("no valid precheck questions")

            return {
                "questions": questions[:MAX_QUESTIONS],
                "model": result.get("model", "unknown"),
                "tokens_used": result.get("tokens_used", 0),
                "latency_ms": result.get("latency_ms", 0),
            }
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error("ConceptPrecheckChain.parse_error: %s, content=%s", str(e), result.get("content", "")[0:200])
            return {
                "questions": [],
                "model": "fallback",
                "tokens_used": 0,
                "latency_ms": 0,
            }
