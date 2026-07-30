"""
熵减 AI 网关 — 笔记摘要 Chain

编排摘要生成的完整流程：
1. 加载 prompt 模板
2. 预处理输入文本（截断过长内容等）
3. 调用 Provider 生成摘要
4. 后处理输出（格式化、字数校验等）

@ai-context: 笔记摘要 Chain：编排摘要生成全流程（截断过长输入、字数校验等）。
"""

import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "summarize_v1.txt"

# 最大输入长度（字符数），超过则截断
MAX_INPUT_LENGTH = 8000


class SummarizeChain:
    """笔记摘要生成链"""

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
        """预处理输入文本：去除首尾空白、截断过长内容"""
        text = text.strip()
        if len(text) > MAX_INPUT_LENGTH:
            text = text[:MAX_INPUT_LENGTH] + "\n\n[注：内容过长，已截断]"
            logger.warning("输入文本超过 %d 字符，已截断", MAX_INPUT_LENGTH)
        return text

    def _build_prompt(self, text: str, options: dict[str, Any]) -> str:
        """填充 prompt 模板变量"""
        template = self._load_prompt_template()
        style = options.get("style", "bullet")
        max_length = options.get("max_length", 200)
        return template.format(style=style, max_length=max_length, text=text)

    def _postprocess_output(self, content: str, max_length: int) -> str:
        """后处理：去除首尾空白，必要时截断"""
        content = content.strip()
        if len(content) > max_length * 2:
            # 如果模型输出远超字数限制，截断并添加提示
            content = content[:max_length] + "..."
        return content

    async def run(
        self,
        text: str,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        执行摘要生成

        Args:
            text: 待摘要的笔记内容
            options: 摘要选项（max_length, style, language）

        Returns:
            dict: Provider 的统一返回格式
        """
        opts = options or {}
        max_length = opts.get("max_length", 200)

        # 1. 预处理输入
        processed_text = self._preprocess_input(text)

        # 2. 构建 prompt
        prompt = self._build_prompt(processed_text, opts)

        # 3. 调用 provider 生成摘要
        logger.info("SummarizeChain.run: text_length=%d, style=%s", len(processed_text), opts.get("style", "bullet"))
        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个专业的学习笔记摘要助手，擅长从学习内容中提取核心知识点并生成结构化摘要。请用中文输出。",
            model=self.model,
            temperature=0.3,
            max_tokens=1024,
        )

        # 4. 后处理输出
        summary = self._postprocess_output(result["content"], max_length)
        result["content"] = summary

        return result
