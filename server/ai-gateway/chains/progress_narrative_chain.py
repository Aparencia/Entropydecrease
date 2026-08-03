"""
熵减 AI 网关 — 微进展叙述 Chain（A3）

将客户端聚合的本周学习统计快照转化为一段温暖、具体的微进展叙述：
- 输入为客户端本地聚合的统计文本（本地优先，网关不接触原始数据）
- 输出 JSON {"narrative": "..."}，解析失败时 status=degraded

@ai-context: Micro-progress narrator chain: turns a client-aggregated
weekly stats snapshot into a warm, concrete progress narrative.
"""

import json
import logging
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# 统计文本最大长度（字符数，防御异常入参）
MAX_STATS_LENGTH = 2000

SYSTEM_PROMPT = (
    "你是一位温暖的学习教练，擅长把枯燥的学习统计数字讲述成看得见的进步。"
    "请用正向语言，突出具体数字与环比变化，不超过两句话，不要说教。"
    "请务必以 JSON 格式输出。"
)

USER_PROMPT_TEMPLATE = """以下是用户本周的学习统计（与上周对比）：

{stats_text}

请把这段统计写成一句温暖、具体的微进展叙述，返回 JSON: {{"narrative": "..."}}"""


class ProgressNarrativeChain:
    """微进展叙述生成链"""

    def __init__(self, provider: AIProvider, model: str = "glm-4-flash"):
        self.provider = provider
        self.model = model

    def _parse_narrative(self, content: str) -> str:
        """容错解析叙述 JSON（标准 JSON / markdown 代码块 / 纯文本兜底）"""
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

        if isinstance(data, dict) and str(data.get("narrative", "")).strip():
            return str(data["narrative"]).strip()

        # 兜底：模型未遵循 JSON 时，非空纯文本也可用
        fallback = content.strip()
        if fallback and len(fallback) <= 200:
            return fallback
        logger.warning("无法解析微进展叙述 JSON，返回空结果")
        return ""

    async def run(self, stats_text: str) -> dict[str, Any]:
        """
        执行微进展叙述生成

        Args:
            stats_text: 客户端聚合的本周统计文本

        Returns:
            dict: {narrative, status, model, tokens_used, latency_ms}
        """
        processed = stats_text.strip()
        if len(processed) > MAX_STATS_LENGTH:
            processed = processed[:MAX_STATS_LENGTH]

        logger.info("ProgressNarrativeChain.run: stats_length=%d", len(processed))

        prompt = USER_PROMPT_TEMPLATE.format(stats_text=processed)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            model=self.model,
            temperature=0.7,
            max_tokens=256,
            response_format={"type": "json_object"},
            _feature="progress_narrative",
        )

        narrative = self._parse_narrative(result["content"])
        status = "success" if narrative else "degraded"

        return {
            "narrative": narrative,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
