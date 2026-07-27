"""
课伴 AI 网关 — FallbackProvider（降级处理）

当 AI 服务不可用时提供友好降级：
- 返回预设的友好提示信息
- 番茄钟推荐：基于本地规则引擎生成建议
"""

import time
import logging
from typing import Any, AsyncGenerator

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)


class FallbackProvider(AIProvider):
    """降级 Provider — AI 不可用时的兜底方案"""

    def __init__(self):
        super().__init__(
            base_url="",
            api_key="",
            provider_name="fallback",
        )

    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "fallback",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        降级响应 — 返回友好提示而非真实 AI 生成结果

        在不同功能场景下提供不同的降级内容：
        - 摘要功能：返回「AI 服务暂不可用」提示
        - 闪卡生成：返回空卡片列表
        - 费曼评估：返回通用鼓励性反馈
        - 番茄钟推荐：基于本地规则引擎给出建议
        """
        start_time = time.monotonic()

        logger.warning("使用 FallbackProvider 降级响应，原始 prompt 长度: %d", len(prompt))

        # 根据 system_prompt / prompt 内容判断功能场景，返回针对性降级内容
        combined = (system_prompt + " " + prompt).lower()

        if any(kw in combined for kw in ("摘要", "总结", "概括", "summarize", "summary")):
            fallback_content = (
                "抱歉，AI 摘要服务暂时不可用。\n"
                "您可以尝试：\n"
                "- 手动提取笔记的核心要点\n"
                "- 将每段内容用一句话概括\n"
                "- 稍后重试，AI 将自动为您生成摘要"
            )
        elif any(kw in combined for kw in ("闪卡", "卡片", "复习卡", "flashcard", "card")):
            fallback_content = (
                '{"cards": [], "message": "AI 闪卡生成服务暂时不可用，建议手动创建复习卡片。' 
                '每张卡片包含一个问题和答案，有助于加深记忆。"}'
            )
        elif any(kw in combined for kw in ("评估", "费曼", "解释", "evaluate", "feynman")):
            fallback_content = (
                "抱歉，费曼评估服务暂时不可用。\n"
                "您可以尝试：\n"
                "- 用自己的话重新解释这个概念\n"
                "- 思考如何将这个概念讲给一个小孩听\n"
                "- 找出自己理解中的盲点，再查阅资料补充\n"
                "- 稍后重试，AI 将为您提供详细的评估反馈"
            )
        elif any(kw in combined for kw in ("番茄钟", "推荐", "时长", "recommend", "pomodoro")):
            fallback_content = (
                "AI 推荐服务暂时不可用，使用本地规则引擎为您推荐。\n"
                "建议从 25 分钟标准番茄钟开始，每 4 个番茄钟后休息 15–30 分钟。"
            )
        else:
            fallback_content = (
                "抱歉，AI 服务暂时不可用。请稍后重试，或者：\n"
                "- 笔记摘要：您可以手动整理要点\n"
                "- 闪卡生成：您可以手动创建复习卡片\n"
                "- 费曼评估：请尝试用自己的话重新解释这个概念\n"
                "- 番茄钟推荐：建议从 25 分钟专注时间开始"
            )

        latency_ms = int((time.monotonic() - start_time) * 1000)

        return {
            "content": fallback_content,
            "tokens_used": 0,
            "model": "fallback",
            "latency_ms": latency_ms,
        }

    @staticmethod
    def recommend_duration_fallback(history: list[dict[str, Any]]) -> dict[str, Any]:
        """
        番茄钟时长推荐 — 本地规则引擎（降级方案）

        基于历史专注数据，使用简单规则计算推荐时长：
        - 无历史数据：推荐默认 25 分钟
        - 平均专注时长 < 15 分钟：推荐 15 分钟
        - 平均专注时长 >= 15 分钟：推荐历史平均值（上限 50 分钟）
        """
        if not history:
            return {
                "recommended_minutes": 25,
                "reason": "首次使用，推荐标准番茄钟时长",
                "source": "local_rule",
            }

        # 计算历史平均专注时长
        durations = [
            item.get("duration_minutes", 25)
            for item in history
            if item.get("completed", False)
        ]

        if not durations:
            return {
                "recommended_minutes": 25,
                "reason": "暂无已完成的专注记录，推荐标准番茄钟时长",
                "source": "local_rule",
            }

        avg_duration = sum(durations) / len(durations)

        if avg_duration < 15:
            recommended = 15
            reason = "历史平均专注时长较短，建议从 15 分钟开始逐步提升"
        else:
            recommended = min(int(avg_duration), 50)
            reason = f"基于您最近 {len(durations)} 次专注记录，平均时长 {avg_duration:.0f} 分钟"

        return {
            "recommended_minutes": recommended,
            "reason": reason,
            "source": "local_rule",
        }

    async def health_check(self) -> dict:
        """Fallback 始终可用，无需实际请求"""
        return {"status": "healthy", "latency_ms": 0, "error": None}

    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = "fallback",
        temperature: float = 0.7,
        max_tokens: int = 2048,
        response_format: dict[str, Any] | None = None,
    ) -> AsyncGenerator[str, None]:
        """流式降级响应 — 逐句 yield 友好提示"""
        result = await self.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format=response_format,
        )
        # 逐句 yield 降级内容，模拟流式体验
        content = result.get("content", "")
        for line in content.split("\n"):
            if line.strip():
                yield line + "\n"

    async def transcribe(
        self,
        audio_base64: str,
        language: str = "zh",
        sample_rate: int = 16000,
        channels: int = 1,
        model: str = "",
    ) -> dict[str, Any]:
        """Fallback 不支持 ASR，返回友好降级结果"""
        import time as _time
        start = _time.monotonic()
        logger.warning("使用 FallbackProvider 降级 ASR 响应")
        latency_ms = int((_time.monotonic() - start) * 1000)
        return {
            "text": "",
            "segments": [],
            "language": language,
            "confidence": 0.0,
            "model": "fallback",
            "latency_ms": latency_ms,
            "warning": "ASR 服务暂时不可用，语音转文字功能暂无法使用",
        }
