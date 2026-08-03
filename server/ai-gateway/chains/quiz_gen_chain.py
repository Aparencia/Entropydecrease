#!/usr/bin/env python3
"""
熵减 AI 网关 —— 课程级迷你测试生成 Chain（N1）

输入：多篇笔记合并文本
输出：5-10 题混合题型（填空/单选/简答）+ 答案 + 解析 + 概念标签

@ai-context: 测试效应（testing effect）——主动提取比被动重读更能巩固记忆。
JSON Mode 输出 + 字段校验，非法题目直接过滤保证前端可用。
"""
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "quiz_gen_v1.txt"

VALID_TYPES = {"fill_blank", "choice", "short_answer"}


class QuizGenChain:
    """迷你测试生成链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    @staticmethod
    def _validate_question(q: Any) -> Optional[Dict[str, Any]]:
        """校验单题结构，非法返回 None"""
        if not isinstance(q, dict):
            return None
        qtype = q.get("type")
        question = str(q.get("question", "")).strip()
        answer = str(q.get("answer", "")).strip()
        if qtype not in VALID_TYPES or not question or not answer:
            return None
        if qtype == "choice":
            options = q.get("options") or []
            if not isinstance(options, list) or len(options) < 2:
                return None
        else:
            options = []
        return {
            "type": qtype,
            "question": question,
            "options": [str(o) for o in options],
            "answer": answer,
            "explanation": str(q.get("explanation", "")).strip(),
            "concept": str(q.get("concept", "")).strip(),
        }

    async def run(
        self,
        notes_text: str,
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        生成迷你测试

        Args:
            notes_text: 合并后的笔记文本（前端已截断）
            options: 预留选项

        Returns:
            dict: {questions, model, tokens_used, latency_ms}
        """
        template = self._load_prompt_template()
        prompt = template.format(notes=notes_text[:6000])  # token 控制

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一位教育评估专家，擅长设计检测真实理解程度的测验题目。请严格按 JSON 格式输出。",
            model=self.model,
            temperature=0.5,
            max_tokens=3000,
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
                raise ValueError("no valid questions generated")

            return {
                "questions": questions[:10],
                "model": result.get("model", "unknown"),
                "tokens_used": result.get("tokens_used", 0),
                "latency_ms": result.get("latency_ms", 0),
            }
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error("QuizGenChain.parse_error: %s, content=%s", str(e), result.get("content", "")[0:200])
            return {
                "questions": [],
                "model": "fallback",
                "tokens_used": 0,
                "latency_ms": 0,
            }
