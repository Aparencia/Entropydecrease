"""
熵减 AI 网关 — 视觉提取 Chain

编排多模态视觉内容提取的完整流程：
1. 构建提取 prompt
2. 调用多模态 Provider 处理图片
3. 解析并结构化提取结果

@ai-context: 视觉提取 Chain：单图多模态识别板书/PPT 并结构化输出。
"""

import json
import logging
import re
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# 视觉提取模式 -> Prompt 映射
VISION_MODE_PROMPTS: dict[str, str] = {
    "auto": (
        "你是一个专业的网课内容提取助手。请从以下截图中提取所有可见的学习内容，包括：\n"
        "1. 文字内容（标题、正文、代码）\n"
        "2. 图表和图示的描述\n"
        "3. 数学公式（使用 LaTeX 格式）\n"
        "4. 关键要点和概念\n\n"
        "请以结构化 JSON 格式返回：\n"
        "{\n"
        '  "text": "提取的纯文本内容",\n'
        '  "formulas": ["公式1", "公式2"],\n'
        '  "diagrams": ["图表描述1"],\n'
        '  "keyPoints": ["要点1", "要点2"],\n'
        '  "codeBlocks": [{"language": "语言", "code": "代码内容"}],\n'
        '  "concepts": ["概念1", "概念2"]\n'
        "}\n\n"
        "注意：\n"
        "- 如果没有看到公式或图表，对应数组返回空 []\n"
        "- 数学公式使用 LaTeX 格式\n"
        "- 代码块保留原始格式\n"
        "- 只输出 JSON，不要添加其他说明"
    ),
    "text": (
        "你是一个专业的文字提取助手。请仅提取截图中的文字内容，保持原文格式和段落结构。\n\n"
        "请以结构化 JSON 格式返回：\n"
        "{\n"
        '  "text": "提取的纯文本内容",\n'
        '  "formulas": [],\n'
        '  "diagrams": [],\n'
        '  "keyPoints": ["要点1", "要点2"],\n'
        '  "codeBlocks": [],\n'
        '  "concepts": []\n'
        "}\n\n"
        "注意：只提取文字，忽略公式和图表。只输出 JSON，不要添加其他说明。"
    ),
    "formula": (
        "你是一个专业的数学公式识别助手。请识别截图中的所有数学公式，使用 LaTeX 格式输出。\n\n"
        "请以结构化 JSON 格式返回：\n"
        "{\n"
        '  "text": "公式所在的上下文文本",\n'
        '  "formulas": ["\\\\LaTeX 公式1", "\\\\LaTeX 公式2"],\n'
        '  "diagrams": [],\n'
        '  "keyPoints": ["公式相关的要点"],\n'
        '  "codeBlocks": [],\n'
        '  "concepts": ["相关数学概念"]\n'
        "}\n\n"
        "注意：\n"
        "- 所有公式必须使用标准 LaTeX 语法\n"
        "- 行内公式用 $...$ 包裹，独立公式用 $$...$$ 包裹\n"
        "- 只输出 JSON，不要添加其他说明"
    ),
    "diagram": (
        "你是一个专业的图表分析助手。请详细描述截图中的图表、图示和可视化内容。\n\n"
        "请以结构化 JSON 格式返回：\n"
        "{\n"
        '  "text": "图表的整体描述",\n'
        '  "formulas": [],\n'
        '  "diagrams": ["图表详细描述1", "图表详细描述2"],\n'
        '  "keyPoints": ["图表传达的关键信息"],\n'
        '  "codeBlocks": [],\n'
        '  "concepts": ["图表涉及的概念"]\n'
        "}\n\n"
        "注意：\n"
        "- 描述图表的类型、坐标轴、数据趋势\n"
        "- 描述流程图/示意图的节点和关系\n"
        "- 只输出 JSON，不要添加其他说明"
    ),
    "code": (
        "你是一个专业的代码提取助手。请提取截图中的代码块，保持缩进和语法高亮信息。\n\n"
        "请以结构化 JSON 格式返回：\n"
        "{\n"
        '  "text": "代码的说明文本",\n'
        '  "formulas": [],\n'
        '  "diagrams": [],\n'
        '  "keyPoints": ["代码相关的要点"],\n'
        '  "codeBlocks": [{"language": "编程语言", "code": "完整代码内容"}],\n'
        '  "concepts": ["代码涉及的编程概念"]\n'
        "}\n\n"
        "注意：\n"
        "- 保持代码的原始缩进和格式\n"
        "- 识别并标注编程语言\n"
        "- 只输出 JSON，不要添加其他说明"
    ),
    "full": (
        "你是一个专业的学习内容深度分析助手。请对截图进行全面深度分析，包括所有可见内容。\n\n"
        "请以结构化 JSON 格式返回：\n"
        "{\n"
        '  "text": "完整的文本内容提取",\n'
        '  "formulas": ["所有 LaTeX 公式"],\n'
        '  "diagrams": ["所有图表的详细描述"],\n'
        '  "keyPoints": ["所有关键要点"],\n'
        '  "codeBlocks": [{"language": "语言", "code": "代码内容"}],\n'
        '  "concepts": ["识别到的所有概念和术语"]\n'
        "}\n\n"
        "注意：\n"
        "- 提取所有文字内容，包括标题、正文、注释\n"
        "- 识别所有数学公式并使用 LaTeX 格式\n"
        "- 详细描述所有图表和可视化内容\n"
        "- 提取所有代码块并标注语言\n"
        "- 识别所有关键概念、术语和定义\n"
        "- 分析内容之间的逻辑关系\n"
        "- 只输出 JSON，不要添加其他说明"
    ),
}

# 有效模式集合
VALID_MODES = frozenset(VISION_MODE_PROMPTS.keys())

SYSTEM_PROMPT = "你是一个专业的学习内容提取助手，擅长从截图中识别和结构化提取文字、公式、图表等学习内容。请始终返回有效的 JSON 格式。"


class VisionExtractChain:
    """视觉内容提取链"""

    def __init__(self, provider: AIProvider, model: str = "glm-4.6v-flash"):
        self.provider = provider
        self.model = model

    def _build_prompt(
        self,
        custom_prompt: str = "",
        language: str = "zh",
        mode: str = "auto",
    ) -> str:
        """构建提取 prompt，支持自定义覆盖和模式选择"""
        # 校验 mode，无效值回退到 auto
        if mode not in VALID_MODES:
            logger.warning("未知的视觉提取模式 '%s'，回退到 auto", mode)
            mode = "auto"

        if custom_prompt:
            # 即使使用自定义 prompt，也保留语言/模式提示，避免完全忽略传入参数
            prompt = custom_prompt
            if language:
                prompt = f"请使用 {language} 语言回答。\n{prompt}"
            return prompt

        return VISION_MODE_PROMPTS[mode]

    def _parse_response(self, content: str) -> dict[str, Any]:
        """
        解析模型返回内容，提取结构化 JSON

        支持以下格式：
        - 纯 JSON
        - Markdown 代码块包裹的 JSON
        - 包含额外文本的 JSON
        """
        # 尝试直接解析
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # 尝试提取 Markdown 代码块中的 JSON
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # 尝试提取 {...} 模式
        brace_match = re.search(r"\{.*\}", content, re.DOTALL)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except json.JSONDecodeError:
                pass

        # 解析失败，返回默认结构
        logger.warning("视觉提取结果 JSON 解析失败，返回原始文本")
        return {
            "text": content,
            "formulas": [],
            "diagrams": [],
            "keyPoints": [],
            "codeBlocks": [],
            "concepts": [],
        }

    async def run(
        self,
        image_base64: str,
        custom_prompt: str = "",
        language: str = "zh",
        mode: str = "auto",
    ) -> dict[str, Any]:
        """
        执行视觉内容提取

        Args:
            image_base64: PNG 图片 base64 编码（不含 data: 前缀）
            custom_prompt: 可选的自定义提示词
            language: 识别语言
            mode: 提取模式 (auto/text/formula/diagram/code/full)

        Returns:
            dict: {
                "content": str,          # 提取的原始文本内容
                "structured": dict,      # 结构化提取结果
                "tokens_used": int,
                "model": str,
                "latency_ms": int,
                "mode": str,             # 实际使用的模式
            }
        """
        # 校验 mode
        effective_mode = mode if mode in VALID_MODES else "auto"
        prompt = self._build_prompt(custom_prompt, language, effective_mode)

        # full 模式需要更多 token
        max_tokens = 4096 if effective_mode == "full" else 2048

        logger.info(
            "VisionExtractChain.run: image_size=%d bytes, model=%s",
            len(image_base64), self.model,
        )

        result = await self.provider.generate_vision(
            image_base64=image_base64,
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            model=self.model,
            temperature=0.3,
            max_tokens=max_tokens,
            _feature="vision_extract",
        )

        # 解析结构化结果
        structured = self._parse_response(result["content"])

        return {
            "content": result["content"],
            "structured": structured,
            "tokens_used": result.get("tokens_used", 0),
            "model": result.get("model", self.model),
            "latency_ms": result.get("latency_ms", 0),
            "mode": effective_mode,
        }
