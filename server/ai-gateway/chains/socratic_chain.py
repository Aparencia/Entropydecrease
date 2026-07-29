"""
熵减 AI 网关 — 苏格拉底追问 Chain

多轮对话模式的启发式学习引导：
- 通过精心设计的追问引导学习者自主思考
- 对话上下文窗口：最多保留最近 5 轮
- Token 预算管理：超限截断最早历史

@ai-context: 苏格拉底追问 Chain：基于对话历史层层递进追问，深化理解。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "socratic_v1.txt"

# 最大对话轮次（一问一答为一轮）
MAX_TURNS = 5

# 最大主题长度
MAX_TOPIC_LENGTH = 500

# 单条消息最大长度
MAX_MESSAGE_LENGTH = 1000


class SocraticChain:
    """苏格拉底追问链（多轮对话）"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _preprocess_topic(self, topic: str) -> str:
        """预处理学习主题"""
        topic = topic.strip()
        if len(topic) > MAX_TOPIC_LENGTH:
            topic = topic[:MAX_TOPIC_LENGTH] + "..."
        return topic

    def _format_history(self, history: list[dict[str, str]]) -> tuple[str, int]:
        """
        格式化对话历史，保留最近 MAX_TURNS 轮

        Args:
            history: [{"role": "learner"|"tutor", "content": "..."}]

        Returns:
            tuple: (formatted_history_text, actual_turn_count)
        """
        if not history:
            return "无（这是第一轮对话）", 0

        # 只保留最近 MAX_TURNS * 2 条消息（每轮一问一答）
        max_messages = MAX_TURNS * 2
        recent = history[-max_messages:]

        lines: list[str] = []
        turn_count = 0
        for msg in recent:
            role = msg.get("role", "learner")
            content = str(msg.get("content", "")).strip()
            if not content:
                continue
            # 截断单条消息
            if len(content) > MAX_MESSAGE_LENGTH:
                content = content[:MAX_MESSAGE_LENGTH] + "..."

            if role == "learner":
                lines.append(f"学习者：{content}")
            else:
                lines.append(f"导师：{content}")
                turn_count += 1

        return "\n".join(lines) if lines else "无（这是第一轮对话）", turn_count

    def _parse_response(self, content: str) -> dict[str, Any]:
        """
        容错解析苏格拉底追问 JSON 输出
        """
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
            logger.warning("无法解析苏格拉底追问 JSON，返回降级结果")
            return {
                "question": "你能用自己的话解释一下这个概念吗？",
                "hint": "试着从你已知的部分开始",
                "thinking_direction": "自由表达",
                "depth_level": 1,
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段"""
        question = str(data.get("question", "")).strip()
        if not question:
            question = "你能用自己的话解释一下这个概念吗？"

        hint = str(data.get("hint", "")).strip()
        thinking_direction = str(data.get("thinking_direction", "概念探索")).strip()

        try:
            depth_level = int(data.get("depth_level", 1))
            depth_level = max(1, min(3, depth_level))
        except (TypeError, ValueError):
            depth_level = 1

        return {
            "question": question,
            "hint": hint,
            "thinking_direction": thinking_direction,
            "depth_level": depth_level,
        }

    async def run(
        self,
        topic: str,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """
        生成下一个苏格拉底式追问

        Args:
            topic:   学习主题
            history: 对话历史列表 [{"role": "learner"|"tutor", "content": "..."}]

        Returns:
            dict: {question, hint, thinking_direction, depth_level, status, ...}
        """
        processed_topic = self._preprocess_topic(topic)
        conversation_history = history or []

        history_text, turn_count = self._format_history(conversation_history)

        logger.info(
            "SocraticChain.run: topic=%s, history_turns=%d",
            processed_topic[:50], turn_count,
        )

        template = self._load_prompt_template()
        prompt = template.format(
            topic=processed_topic,
            history=history_text,
            history_count=turn_count,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是苏格拉底式导师，绝不直接给出答案，用问题引导思考。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.7,
            max_tokens=512,
            response_format={"type": "json_object"},
            _feature="socratic",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed["question"] != "你能用自己的话解释一下这个概念吗？" else "degraded"

        return {
            **parsed,
            "turn_count": turn_count + 1,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
