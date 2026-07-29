"""
熵减 AI 网关 — AI 草稿生成 Chain（v1.1.0）

将灵感/零散想法转化为结构化学习材料草稿：
- flashcard：闪卡草稿（复用 CardGenChain 的输出格式）
- feynman：费曼讲解草稿（复用 FeynmanQuestionChain 的输出格式）
- note：笔记草稿

@ai-context: 灵感草稿 Chain（v1.1.0）：将零散灵感扩写为结构化草稿。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "inspiration_draft_v1.txt"

# 最大输入长度（字符数）
MAX_INPUT_LENGTH = 4000

# 有效目标类型
VALID_TARGET_TYPES = {"flashcard", "feynman", "note"}


class InspirationDraftChain:
    """AI 草稿生成链"""

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

    def _parse_draft(self, content: str, target_type: str) -> dict[str, Any]:
        """容错解析草稿 JSON"""
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
            logger.warning("无法解析草稿 JSON，返回降级结果")
            return {}

        return self._validate_draft(data, target_type)

    def _validate_draft(self, data: dict[str, Any], target_type: str) -> dict[str, Any]:
        """验证并规范化草稿字段，按目标类型走不同验证逻辑"""
        draft = data.get("draft", data)

        if target_type == "flashcard":
            return self._validate_flashcard_draft(draft)
        elif target_type == "feynman":
            return self._validate_feynman_draft(draft)
        elif target_type == "note":
            return self._validate_note_draft(draft)
        else:
            return {}

    def _validate_flashcard_draft(self, draft: dict[str, Any]) -> dict[str, Any]:
        """验证闪卡草稿（与 CardGenChain 输出格式兼容）"""
        cards = draft.get("cards", [])
        if not isinstance(cards, list):
            return {"type": "flashcard", "cards": []}

        validated_cards: list[dict[str, Any]] = []
        for card in cards[:5]:
            if not isinstance(card, dict):
                continue
            front = str(card.get("front", "")).strip()
            back = str(card.get("back", "")).strip()
            if not front or not back:
                continue
            try:
                confidence = float(card.get("confidence", 0.8))
                confidence = max(0.0, min(1.0, confidence))
            except (TypeError, ValueError):
                confidence = 0.8
            validated_cards.append({
                "front": front,
                "back": back,
                "type": str(card.get("type", "question_answer")),
                "confidence": round(confidence, 2),
            })

        return {"type": "flashcard", "cards": validated_cards}

    def _validate_feynman_draft(self, draft: dict[str, Any]) -> dict[str, Any]:
        """验证费曼讲解草稿（与 FeynmanQuestionChain 输出格式兼容）"""
        concept = str(draft.get("concept", "")).strip()
        simple_explanation = str(draft.get("simple_explanation", "")).strip()
        analogy = str(draft.get("analogy", "")).strip()
        test_question = str(draft.get("test_question", "")).strip()

        return {
            "type": "feynman",
            "concept": concept or "未提取到概念",
            "simple_explanation": simple_explanation,
            "analogy": analogy,
            "test_question": test_question,
        }

    def _validate_note_draft(self, draft: dict[str, Any]) -> dict[str, Any]:
        """验证笔记草稿"""
        title = str(draft.get("title", "")).strip()
        key_points = draft.get("key_points", [])
        if not isinstance(key_points, list):
            key_points = []
        key_points = [str(p).strip() for p in key_points[:5] if str(p).strip()]

        summary = str(draft.get("summary", "")).strip()

        return {
            "type": "note",
            "title": title or "未命名笔记",
            "key_points": key_points,
            "summary": summary,
        }

    async def run(
        self,
        content: str,
        target_type: str = "note",
    ) -> dict[str, Any]:
        """
        执行 AI 草稿生成

        Args:
            content:     灵感内容
            target_type: 目标类型 flashcard/feynman/note

        Returns:
            dict: {draft, status, model, tokens_used, latency_ms}
        """
        if target_type not in VALID_TARGET_TYPES:
            logger.warning("无效的目标类型 %s，回退到 note", target_type)
            target_type = "note"

        processed_content = self._preprocess_input(content)

        logger.info(
            "InspirationDraftChain.run: target_type=%s, content_length=%d",
            target_type, len(processed_content),
        )

        template = self._load_prompt_template()
        prompt = template.format(
            target_type=target_type,
            content=processed_content,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是学习内容转化专家，擅长将灵感转化为结构化学习材料。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.5,
            max_tokens=1536,
            response_format={"type": "json_object"},
            _feature="inspiration_draft",
        )

        draft = self._parse_draft(result["content"], target_type)
        status = "success" if draft else "degraded"

        return {
            "draft": draft,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
