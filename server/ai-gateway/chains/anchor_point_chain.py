"""
熵减 AI 网关 — 记忆锚点生成 Chain

从学习笔记中提取 3-5 个记忆锚点：
- 关键概念 + 关联提示 + 记忆技巧
- 帮助大脑建立知识网络的核心概念节点

@ai-context: 记忆锚点生成 Chain：编排 prompt 加载→预处理→Provider 调用→后处理，产出关键概念与记忆技巧。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "anchor_point_v1.txt"

# 最大输入长度（字符数）
MAX_INPUT_LENGTH = 6000


class AnchorPointChain:
    """记忆锚点生成链"""

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

    def _parse_anchor_points(self, content: str) -> list[dict[str, Any]]:
        """
        容错解析记忆锚点 JSON

        处理格式变体：标准 JSON / markdown 代码块 / 部分损坏
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
            logger.warning("无法解析记忆锚点 JSON，返回降级结果")
            return []

        return self._validate_anchor_points(data)

    def _validate_anchor_points(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """验证并规范化锚点字段"""
        raw_points = data.get("anchor_points", [])
        if not isinstance(raw_points, list):
            return []

        validated: list[dict[str, Any]] = []
        for item in raw_points[:5]:  # 最多 5 个
            if not isinstance(item, dict):
                continue
            concept = str(item.get("concept", "")).strip()
            if not concept:
                continue

            try:
                importance = float(item.get("importance", 0.7))
                importance = max(0.0, min(1.0, importance))
            except (TypeError, ValueError):
                importance = 0.7

            validated.append({
                "concept": concept,
                "association": str(item.get("association", "")).strip(),
                "memory_technique": str(item.get("memory_technique", "")).strip(),
                "importance": round(importance, 2),
            })

        return validated

    async def run(
        self,
        content: str,
        title: str = "",
    ) -> dict[str, Any]:
        """
        执行记忆锚点生成

        Args:
            content: 学习笔记内容
            title:   笔记标题（辅助上下文）

        Returns:
            dict: {anchor_points, status, model, tokens_used, latency_ms}
        """
        processed_content = self._preprocess_input(content)
        processed_title = title.strip() or "未命名笔记"

        logger.info(
            "AnchorPointChain.run: title=%s, content_length=%d",
            processed_title, len(processed_content),
        )

        template = self._load_prompt_template()
        prompt = template.format(title=processed_title, content=processed_content)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是认知科学专家，擅长提取记忆锚点。请务必以 JSON 格式输出结果。",
            model=self.model,
            temperature=0.4,
            max_tokens=1536,
            response_format={"type": "json_object"},
            _feature="anchor_point",
        )

        anchor_points = self._parse_anchor_points(result["content"])
        status = "success" if anchor_points else "degraded"

        return {
            "anchor_points": anchor_points,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
