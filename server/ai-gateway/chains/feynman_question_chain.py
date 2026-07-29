"""
熵减 AI 网关 — 费曼反问 Chain

编排费曼反问流程：
1. 接收用户的费曼解释内容
2. AI 以"好奇小白"角色生成 1-3 个追问
3. 追问基于内容中的薄弱点/模糊表述
4. 用户回答后评估理解度

@ai-context: 费曼提问 Chain：依据笔记内容生成层层递进的引导问题。
"""

import json
import logging
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)


class FeynmanQuestionChain:
    """费曼反问链"""

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model

    # ------------------------------------------------------------------
    # 生成追问
    # ------------------------------------------------------------------

    async def generate_questions(
        self, concept: str, explanation: str
    ) -> dict[str, Any]:
        """
        生成 1-3 个追问

        Args:
            concept:     概念名称
            explanation: 用户对该概念的费曼式解释

        Returns:
            dict: 包含 questions 列表、model、tokens_used、latency_ms
        """
        logger.info(
            "FeynmanQuestionChain.generate_questions: concept=%s, explanation_length=%d",
            concept,
            len(explanation),
        )

        system_prompt = (
            "你是一个对知识充满好奇但了解不多的\u201c小白\u201d。\n"
            "你刚刚听了一位同学对某个概念的讲解，请根据讲解中可能不够清晰、"
            "不够深入或存在逻辑跳跃的地方，提出追问。\n"
            "追问应该能帮助这位同学更深入地理解概念。\n\n"
            "要求：\n"
            "1. 追问要像好奇的小白：天真但切中要害\n"
            "2. 聚焦解释中的薄弱点（模糊表述、缺少具体例子、逻辑跳跃）\n"
            "3. 每个追问都要具体，不要泛泛而谈\n"
            "4. 以 JSON 格式输出，格式为：\n"
            '   {"questions": [{"question": "追问内容", "focus": "聚焦的知识点"}]}\n'
            "5. 提出 1-3 个追问，不要超过 3 个"
        )

        user_prompt = (
            f"这位同学讲解的概念是：「{concept}」\n\n"
            f"讲解内容如下：\n{explanation}\n\n"
            "请根据讲解内容中的薄弱点提出追问。"
        )

        result = await self.provider.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model=self.model,
            temperature=0.7,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        parsed = self._parse_questions(result["content"])
        return {
            **parsed,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }

    def _parse_questions(self, content: str) -> dict[str, Any]:
        """解析追问 JSON 输出"""
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            # 尝试提取代码块
            if "```json" in content:
                try:
                    start = content.index("```json") + 7
                    end = content.index("```", start)
                    data = json.loads(content[start:end].strip())
                except (json.JSONDecodeError, ValueError):
                    data = {}
            elif "```" in content:
                try:
                    start = content.index("```") + 3
                    end = content.index("```", start)
                    data = json.loads(content[start:end].strip())
                except (json.JSONDecodeError, ValueError):
                    data = {}
            else:
                data = {}

        raw_questions = data.get("questions", [])
        questions = []
        for q in raw_questions[:3]:  # 最多 3 个
            if isinstance(q, dict) and q.get("question"):
                questions.append({
                    "question": str(q["question"]),
                    "focus": str(q.get("focus", "")),
                })

        if not questions:
            questions = [{
                "question": "能否用更具体的例子来解释这个概念？",
                "focus": "概念的具体应用",
            }]

        return {"questions": questions}

    # ------------------------------------------------------------------
    # 评估回答
    # ------------------------------------------------------------------

    async def evaluate_answers(
        self,
        concept: str,
        questions: list[str],
        answers: list[str],
    ) -> dict[str, Any]:
        """
        评估用户对追问的回答

        Args:
            concept:   概念名称
            questions: 追问列表
            answers:   用户的回答列表（与 questions 一一对应）

        Returns:
            dict: 理解度评估结果
        """
        logger.info(
            "FeynmanQuestionChain.evaluate_answers: concept=%s, question_count=%d",
            concept,
            len(questions),
        )

        # 构建问答对照文本
        qa_pairs = "\n\n".join(
            f"追问 {i + 1}：{q}\n回答：{a}"
            for i, (q, a) in enumerate(zip(questions, answers))
        )

        system_prompt = (
            "你是一位专业的学习评估导师。\n"
            "你需要评估一位同学对追问的回答质量，判断其对概念的理解深度。\n\n"
            "请以 JSON 格式输出评估结果，格式为：\n"
            "{\n"
            '  "understanding_score": 0-10 的数值,\n'
            '  "feedback": "整体反馈",\n'
            '  "strong_points": ["理解到位的方面"],\n'
            '  "weak_points": ["仍需加强的方面"]\n'
            "}\n\n"
            "评分标准：\n"
            "0-3: 理解肤浅，回答模糊或偏离主题\n"
            "4-6: 有基本理解，但缺少深度或具体例子\n"
            "7-8: 理解较好，能用具体例子解释\n"
            "9-10: 深入理解，能举一反三"
        )

        user_prompt = (
            f"概念：「{concept}」\n\n"
            f"以下是该同学对追问的回答：\n{qa_pairs}\n\n"
            "请评估该同学对这个概念的理解深度。"
        )

        result = await self.provider.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model=self.model,
            temperature=0.4,
            max_tokens=1024,
            response_format={"type": "json_object"},
        )

        parsed = self._parse_evaluation(result["content"])
        return {
            **parsed,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }

    def _parse_evaluation(self, content: str) -> dict[str, Any]:
        """解析评估 JSON 输出"""
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            if "```json" in content:
                try:
                    start = content.index("```json") + 7
                    end = content.index("```", start)
                    data = json.loads(content[start:end].strip())
                except (json.JSONDecodeError, ValueError):
                    data = {}
            elif "```" in content:
                try:
                    start = content.index("```") + 3
                    end = content.index("```", start)
                    data = json.loads(content[start:end].strip())
                except (json.JSONDecodeError, ValueError):
                    data = {}
            else:
                data = {}

        score = float(data.get("understanding_score", 5.0))
        score = max(0.0, min(10.0, score))

        feedback = str(data.get("feedback", ""))
        strong_points = [str(s) for s in data.get("strong_points", []) if s]
        weak_points = [str(s) for s in data.get("weak_points", []) if s]

        return {
            "understanding_score": score,
            "feedback": feedback,
            "strong_points": strong_points,
            "weak_points": weak_points,
        }
