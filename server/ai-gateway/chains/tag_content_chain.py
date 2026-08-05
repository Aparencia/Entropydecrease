"""
熵减 AI 网关 — 内容打标 Chain

对灵感/笔记内容进行三维度自动打标：
1. content_nature: concept | question | inspiration | todo
2. cognitive_depth: shallow | understanding | application
3. subject: 自动识别学科领域

@ai-context: 内容打标 Chain：为内容生成分类标签。
"""

import json
import logging
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "你是一位知识管理助手，擅长对学习内容进行精准分类打标。"
    "请对给定的文本内容从以下三个维度进行判断，并严格以 JSON 格式输出结果：\n"
    "1. content_nature（内容性质）：判断文本属于以下哪一类\n"
    "   - concept: 概念定义、知识点描述\n"
    "   - question: 疑问、问题、需要解答的内容\n"
    "   - inspiration: 灵感、想法、顿悟\n"
    "   - todo: 待办事项、行动计划\n"
    "2. cognitive_depth（认知深度）：判断文本所体现的认知层次\n"
    "   - shallow: 浅层记忆、简单复述\n"
    "   - understanding: 理解层面、有自己的解读\n"
    "   - application: 应用层面、能联系实际或举一反三\n"
    "3. subject（学科领域）：自动识别内容所属学科，如\u201c数学\u201d、\u201c编程\u201d、\u201c物理\u201d、\u201c语言\u201d、\u201c通用\u201d等\n\n"
    "输出格式（严格 JSON）：\n"
    '{"content_nature": "...", "cognitive_depth": "...", "subject": "..."}'
)


class TagContentChain:
    """内容打标链"""

    VALID_NATURE = {"concept", "question", "inspiration", "todo"}
    VALID_DEPTH = {"shallow", "understanding", "application"}

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model

    def _parse_tags(self, content: str) -> dict[str, Any]:
        """
        解析模型输出为结构化标签

        期望格式：
        { "content_nature": "...", "cognitive_depth": "...", "subject": "..." }
        """
        data = None

        # 尝试直接解析 JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        # 尝试提取 markdown 代码块中的 JSON
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
            logger.warning("无法解析打标 JSON，返回默认标签")
            return {
                "content_nature": "inspiration",
                "cognitive_depth": "shallow",
                "subject": "未分类",
            }

        return self._validate_tags(data)

    def _validate_tags(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化标签字段"""
        nature = str(data.get("content_nature", "inspiration")).lower()
        if nature not in self.VALID_NATURE:
            nature = "inspiration"

        depth = str(data.get("cognitive_depth", "shallow")).lower()
        if depth not in self.VALID_DEPTH:
            depth = "shallow"

        subject = str(data.get("subject", "未分类")).strip()
        if not subject or subject.lower() in ("unknown", "null", "none"):
            subject = "未分类"

        return {
            "content_nature": nature,
            "cognitive_depth": depth,
            "subject": subject,
        }

    async def run(self, content: str) -> dict[str, Any]:
        """
        对内容进行三维度打标

        Args:
            content: 原始文本内容

        Returns:
            dict: { content_nature, cognitive_depth, subject, model, tokens_used, latency_ms }
        """
        logger.info("TagContentChain.run: content_length=%d", len(content))

        result = await self.provider.generate(
            prompt=f"请对以下内容进行三维度打标：\n\n{content}",
            system_prompt=SYSTEM_PROMPT,
            model=self.model,
            temperature=0.3,
            max_tokens=256,
            response_format={"type": "json_object"},
        )

        tags = self._parse_tags(result["content"])

        return {
            **tags,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
