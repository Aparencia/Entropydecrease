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
PROMPT_TEMPLATE_PATH_MAP = {
    "socratic": Path(__file__).parent.parent / "prompts" / "socratic_v1.txt",
    "mirror": Path(__file__).parent.parent / "prompts" / "mirror_v1.txt",
    "student": Path(__file__).parent.parent / "prompts" / "student_v1.txt",
}

# 各模式系统提示词
SYSTEM_PROMPT_MAP = {
    "socratic": "你是苏格拉底式导师，绝不直接给出答案，用问题引导思考。请务必以 JSON 格式输出。",
    "mirror": "你是一面思考的镜子，绝不直接回答，将问题反射回去。请务必以 JSON 格式输出。",
    "student": "你是一个不太明白的学生，通过合理错误反映用户盲点。请务必以 JSON 格式输出。",
}

# 默认 Prompt 模板路径
PROMPT_TEMPLATE_PATH = PROMPT_TEMPLATE_PATH_MAP["socratic"]

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

    def _load_prompt_template(self, mode: str = "socratic") -> str:
        """加载 prompt 模板文件（按模式选择）"""
        cache_key = f"_{mode}"
        cached = getattr(self, cache_key, None)
        if cached is not None:
            return cached
        path = PROMPT_TEMPLATE_PATH_MAP.get(mode, PROMPT_TEMPLATE_PATH_MAP["socratic"])
        template = path.read_text(encoding="utf-8")
        setattr(self, cache_key, template)
        if mode == "socratic":
            self._prompt_template = template
        return template

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

    def _parse_response(self, content: str, mode: str = "socratic") -> dict[str, Any]:
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

        if data is None or not isinstance(data, dict):
            logger.warning("无法解析苏格拉底追问 JSON，返回降级结果")
            return {
                "question": "你能用自己的话解释一下这个概念吗？",
                "hint": "试着从你已知的部分开始",
                "thinking_direction": "自由表达",
                "depth_level": 1,
            }

        return self._validate_response(data, mode)

    def _validate_response(self, data: dict[str, Any], mode: str = "socratic") -> dict[str, Any]:
        """验证并规范化响应字段（按模式分支校验，非法/缺失字段用兜底值）"""
        if mode == "mirror":
            # 反问镜：不直接回答，将问题以另一种视角反弹回去
            reflection_question = str(data.get("reflection_question", "")).strip()
            if not reflection_question:
                reflection_question = "你为什么会这样想？能展开说说吗？"
            strategy = str(data.get("strategy_used", "clarify")).strip()
            if strategy not in ("clarify", "assume", "evidence", "consequence", "perspective"):
                strategy = "clarify"
            return {
                "reflection_question": reflection_question[:500],
                "strategy_used": strategy,
            }
        if mode == "student":
            # AI 学生：扮演不太懂的学生，故意犯常见错误暴露薄弱点
            student_response = str(data.get("student_response", "")).strip()
            if not student_response:
                student_response = "这个概念我不太明白，你能再讲讲吗？"
            error_type = str(data.get("error_type", "confusion")).strip()
            if error_type not in ("confusion", "misconception", "overgeneralization", "omission"):
                error_type = "confusion"
            return {
                "student_response": student_response[:1000],
                "error_type": error_type,
            }
        # socratic 默认模式（原有字段校验不变）
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
        mode: str = "socratic",
    ) -> dict[str, Any]:
        """
        生成下一个苏格拉底式追问（支持多模式）

        Args:
            topic:   学习主题
            history: 对话历史列表 [{"role": "learner"|"tutor", "content": "..."}]
            mode:    模式：socratic（默认追问）/ mirror（反问镜）/ student（AI 学生）

        Returns:
            dict: 各模式不同字段，统一包含 turn_count, status, model, tokens_used, latency_ms
        """
        if mode not in ("socratic", "mirror", "student"):
            mode = "socratic"

        processed_topic = self._preprocess_topic(topic)
        conversation_history = history or []

        history_text, turn_count = self._format_history(conversation_history)

        logger.info(
            "SocraticChain.run: mode=%s, topic=%s, history_turns=%d",
            mode, processed_topic[:50], turn_count,
        )

        template = self._load_prompt_template(mode)
        prompt = template.format(
            topic=processed_topic,
            history=history_text,
            history_count=turn_count,
        )

        system_prompt = SYSTEM_PROMPT_MAP.get(mode, SYSTEM_PROMPT_MAP["socratic"])

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            model=self.model,
            temperature=0.7,
            max_tokens=512,
            response_format={"type": "json_object"},
            _feature="socratic",
        )

        parsed = self._parse_response(result["content"], mode)

        # 不同模式的主状态字段不同
        if mode == "mirror":
            status = "success" if parsed.get("reflection_question") else "degraded"
        elif mode == "student":
            status = "success" if parsed.get("student_response") else "degraded"
        else:
            status = "success" if parsed.get("question") and parsed["question"] != "你能用自己的话解释一下这个概念吗？" else "degraded"

        return {
            **parsed,
            "mode": mode,
            "turn_count": turn_count + 1,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
