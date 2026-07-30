"""
熵减 AI 网关 — 仪式回顾小问生成 Chain

从上次学习笔记生成 1 个"10 秒可答"的回顾小问 + 参考要点：
- 服务于学习启动仪式的回顾闪回步骤（RIT-08，检索练习/测试效应）
- 前端在超时/离线/失败时无缝回退到遮罩摘要基线（RIT-05）

@ai-context: 仪式回顾小问 Chain：编排 prompt 加载→预处理→Provider 调用→JSON 容错解析，产出单个回顾小问与参考要点。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "ritual_recall_v1.txt"

# 最大输入长度（字符数）
MAX_INPUT_LENGTH = 4000


class RitualRecallChain:
    """仪式回顾小问生成链"""

    def __init__(self, provider: AIProvider, model: str = "glm-4-flash"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _preprocess_input(self, text: str) -> str:
        """预处理输入文本（去空白 + 超长截断）"""
        text = text.strip()
        if len(text) > MAX_INPUT_LENGTH:
            text = text[:MAX_INPUT_LENGTH] + "\n\n[注：内容过长，已截断]"
        return text

    def _parse_recall(self, content: str) -> dict[str, str]:
        """
        容错解析回顾小问 JSON

        处理格式变体：标准 JSON / markdown 代码块 / 部分损坏
        """
        data = None

        # 尝试 1：直接解析
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        # 尝试 2：提取 markdown 代码块
        if data is None and "```" in content:
            fence = "```json" if "```json" in content else "```"
            try:
                start = content.index(fence) + len(fence)
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                pass

        if not isinstance(data, dict):
            logger.warning("无法解析仪式回顾小问 JSON，返回空结果")
            return {"question": "", "reference": ""}

        return {
            "question": str(data.get("question", "")).strip(),
            "reference": str(data.get("reference", "")).strip(),
        }

    async def run(self, content: str, title: str = "") -> dict[str, Any]:
        """
        执行回顾小问生成

        Args:
            content: 上次学习笔记内容
            title:   笔记标题（辅助上下文）

        Returns:
            dict: {question, reference, status, model, tokens_used, latency_ms}
        """
        processed_content = self._preprocess_input(content)
        processed_title = title.strip() or "未命名笔记"

        logger.info(
            "RitualRecallChain.run: title=%s, content_length=%d",
            processed_title, len(processed_content),
        )

        template = self._load_prompt_template()
        prompt = template.format(title=processed_title, content=processed_content)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是学习教练，擅长用一个简短问题唤醒记忆。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.5,
            max_tokens=256,
            response_format={"type": "json_object"},
            _feature="ritual_recall",
        )

        recall = self._parse_recall(result["content"])
        status = "success" if recall["question"] else "degraded"

        return {
            "question": recall["question"],
            "reference": recall["reference"],
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
