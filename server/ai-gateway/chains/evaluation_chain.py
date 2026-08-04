"""
熵减 AI 网关 — 费曼评估 Chain

编排费曼学习法评估的完整流程：
1. 接收用户的概念解释
2. 加载评估 Prompt 模板
3. 调用模型进行多维度评估
4. 解析结构化评分结果（准确性、完整性、简洁性、通俗性）

@ai-context: 费曼评估 Chain：对用户讲解进行多维度打分与反馈生成。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "evaluation_v1.txt"


class EvaluationChain:
    """费曼评估链"""

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _build_prompt(self, concept: str, explanation: str) -> str:
        """填充评估 prompt 模板变量"""
        template = self._load_prompt_template()
        return template.format(concept=concept, explanation=explanation)

    def _parse_evaluation(self, content: str) -> dict[str, Any]:
        """
        解析模型输出为结构化评估结果

        期望格式：
        {
            "overall_score": 7.5,
            "dimensions": [...],
            "strengths": [...],
            "improvements": [...],
            "encouragement": "..."
        }
        """
        # 尝试直接解析 JSON
        try:
            data = json.loads(content)
            return self._validate_evaluation(data)
        except json.JSONDecodeError:
            pass

        # 尝试提取 markdown 代码块中的 JSON
        if "```json" in content:
            try:
                start = content.index("```json") + 7
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
                return self._validate_evaluation(data)
            except (json.JSONDecodeError, ValueError):
                pass

        if "```" in content:
            try:
                start = content.index("```") + 3
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
                return self._validate_evaluation(data)
            except (json.JSONDecodeError, ValueError):
                pass

        # 无法解析时返回原始内容作为鼓励性评语
        logger.warning("无法解析评估 JSON，返回原始内容作为鼓励性评语")
        return {
            "overall_score": 5.0,
            "dimensions": [
                {"dimension": "overall", "score": 5.0, "feedback": content[:200]}
            ],
            "strengths": ["尝试用自己的话解释概念是很好的学习习惯"],
            "improvements": ["AI 服务恢复后可获取更详细的评估"],
            "encouragement": content,
        }

    def _validate_evaluation(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化评估结果字段"""
        overall_score = float(data.get("overall_score", 5.0))
        overall_score = max(0.0, min(10.0, overall_score))

        raw_dimensions = data.get("dimensions", [])
        dimensions = []
        for dim in raw_dimensions:
            if isinstance(dim, dict):
                score = float(dim.get("score", 5.0))
                dimensions.append({
                    "dimension": str(dim.get("dimension", "unknown")),
                    "score": max(0.0, min(10.0, score)),
                    "feedback": str(dim.get("feedback", "")),
                })

        strengths = [str(s) for s in data.get("strengths", []) if s]
        improvements = [str(s) for s in data.get("improvements", []) if s]
        encouragement = str(data.get("encouragement", ""))

        return {
            "overall_score": overall_score,
            "dimensions": dimensions,
            "strengths": strengths,
            "improvements": improvements,
            "encouragement": encouragement,
        }

    async def run(
        self,
        concept: str,
        explanation: str,
    ) -> dict[str, Any]:
        """
        执行费曼评估

        Args:
            concept: 概念名称
            explanation: 用户的费曼式解释

        Returns:
            dict: 结构化的评估结果
        """
        logger.info("EvaluationChain.run: concept=%s, explanation_length=%d", concept, len(explanation))

        # 1. 构建 prompt
        prompt = self._build_prompt(concept, explanation)

        # 2. 调用 provider（使用 JSON mode 获取结构化结果）
        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=(
                "你是一位友善且专业的学习导师，擅长评估学生对知识概念的理解程度。\n"
                "请使用费曼学习法的评估标准，从四个维度进行评分。\n\n"
                "## 评估维度\n"
                "1. 准确性（accuracy）：概念理解是否正确，有无事实错误\n"
                "2. 完整性（completeness）：是否覆盖了概念的核心要点\n"
                "3. 简洁性（conciseness）：表达是否简洁明了，不冗余\n"
                "4. 通俗性（accessibility）：是否使用了通俗易懂的语言、生活化类比或举例\n\n"
                "## 评分标准\n"
                "- 每个维度 0-10 分\n"
                "- 综合评分 = 四个维度的加权平均（准确性权重最高）\n\n"
                "## 输出格式\n"
                "请务必以 JSON 格式输出，包含：overall_score、dimensions（含 dimension/score/feedback）、"
                "strengths、improvements、encouragement。\n\n"
                "## 注意事项\n"
                "- 多给予正面鼓励，保护学习积极性\n"
                "- 改进建议要具体可操作\n"
                "- 综合评分为四个维度的加权平均（准确性权重最高）"
            ),
            model=self.model,
            temperature=0.5,
            max_tokens=1536,
            response_format={"type": "json_object"},
        )

        # 3. 解析结构化输出
        evaluation = self._parse_evaluation(result["content"])

        # 合并 provider 元数据
        return {
            **evaluation,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
