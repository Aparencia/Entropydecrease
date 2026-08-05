#!/usr/bin/env python3
"""
熵减 AI 网关 —— 个性化记忆术生成器 Chain

输入：内容、学习风格、用户背景
输出：3 种记忆术（谐音/故事/空间）

@ai-context: 记忆术——通过多重编码增强长期记忆。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "mnemonic_v1.txt"


class MnemonicChain:
    """个性化记忆术生成器链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _parse_response(self, content: str) -> dict[str, Any]:
        data = None

        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

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
            logger.warning("无法解析记忆术 JSON，返回降级结果")
            return {
                "mnemonics": [
                    {
                        "type": "story",
                        "type_name": "故事",
                        "mnemonic": "将需要记忆的内容编成一个简短有趣的故事，越夸张越好记。",
                        "association": "故事联想帮助记忆",
                        "example": "试着自己编个故事",
                    }
                ],
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        mnemonics = data.get("mnemonics", [])
        if not isinstance(mnemonics, list):
            mnemonics = []

        validated = []
        valid_types = {"phonetic", "story", "spatial"}
        for m in mnemonics:
            if not isinstance(m, dict):
                continue
            mtype = str(m.get("type", "")).strip()
            if mtype not in valid_types:
                continue
            validated.append({
                "type": mtype,
                "type_name": str(m.get("type_name", "")).strip(),
                "mnemonic": str(m.get("mnemonic", "")).strip(),
                "association": str(m.get("association", "")).strip(),
                "example": str(m.get("example", "")).strip(),
            })

        if not validated:
            validated = [{
                "type": "story",
                "type_name": "故事",
                "mnemonic": "将需要记忆的内容编成一个简短有趣的故事。",
                "association": "故事联想帮助记忆",
                "example": "试着自己编个故事",
            }]

        return {"mnemonics": validated}

    async def run(
        self,
        content: str,
        learning_style: str = "visual",
        user_context: str = "",
    ) -> dict[str, Any]:
        """
        生成个性化记忆术

        Args:
            content: 需要记忆的内容
            learning_style: 学习风格偏好（visual/auditory/verbal）
            user_context: 用户背景信息

        Returns:
            dict: {mnemonics: [{type, type_name, mnemonic, association, example}]}
        """
        if learning_style not in ("visual", "auditory", "verbal"):
            learning_style = "visual"

        logger.info("MnemonicChain.run: content=%s, style=%s", content[:50], learning_style)

        template = self._load_prompt_template()
        prompt = template.format(
            content=content,
            learning_style=learning_style,
            user_context=user_context or "无",
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个记忆术专家，擅长将枯燥内容转化为生动的记忆编码。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.7,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="mnemonic",
        )

        parsed = self._parse_response(result["content"])
        mnemonics = parsed.get("mnemonics", [])
        status = "success" if len(mnemonics) >= 1 else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }