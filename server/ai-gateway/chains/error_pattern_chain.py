#!/usr/bin/env python3
"""
熵减 AI 网关 —— 错误模式分析 Chain

输入：黄金错误（高自信答错）记录列表
输出：错误模式分类（概念盲区/混淆/过度自信）、高频错误知识点、改进建议

@ai-context: 错误概念转变（P44）——错误概念是自洽的替代框架，需先破后立。
"""
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "error_pattern_v1.txt"


class ErrorPatternChain:
    """错误模式分析链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    async def run(
        self,
        golden_errors: List[Dict[str, Any]],
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        执行错误模式分析

        Args:
            golden_errors: 黄金错误记录列表，每个元素包含 {flashcardId, correctAnswer, userAnswer}
            options: 分析选项（目前为空）

        Returns:
            dict: {
                "patterns": [{"type": "concept_blind", "keywords": ["..."], "explanation": "...", "suggestion": "..."}],
                "top_offenders": [{"flashcardId": "...", "count": 2}],
                "summary": "整体错误趋势总结",
                "model": "qwen-plus",
                "tokens_used": 1234,
                "latency_ms": 123,
            }
        """
        # 构建输入文本
        errors_text = "\n".join([
            f"【错误 #{i+1}】\n正确答案：{e['correctAnswer']}\n用户回答：{e['userAnswer']}\n---"
            for i, e in enumerate(golden_errors[:20])  # 最多分析前 20 条
        ])

        template = self._load_prompt_template()
        prompt = template.format(
            errors=errors_text,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个教育心理学专家，擅长识别学习者在知识掌握中的典型错误模式。请基于提供的黄金错误记录，分析并归类错误模式，给出具体建议。",
            model=self.model,
            temperature=0.3,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )

        # 解析 JSON 响应
        try:
            content = result["content"].strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()
            data = json.loads(content)
            
            # 验证关键字段
            patterns = data.get("patterns", [])
            top_offenders = data.get("top_offenders", [])
            summary = data.get("summary", "暂无总结")
            
            return {
                "patterns": patterns,
                "top_offenders": top_offenders,
                "summary": summary,
                "model": result.get("model", "unknown"),
                "tokens_used": result.get("tokens_used", 0),
                "latency_ms": result.get("latency_ms", 0),
            }
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error("ErrorPatternChain.parse_error: %s, content=%s", str(e), result.get("content", "")[0:200])
            # 降级返回空结构
            return {
                "patterns": [],
                "top_offenders": [],
                "summary": "AI 分析失败，请稍后重试或检查网络连接。",
                "model": "fallback",
                "tokens_used": 0,
                "latency_ms": 0,
            }
