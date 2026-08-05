#!/usr/bin/env python3
"""
熵减 AI 网关 —— AI 播客生成器 Chain

输入：主题、参考材料、收听场景
输出：两人对话播客脚本

@ai-context: 播客式学习——通过对话形式让知识变得生动有趣。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "podcast_v1.txt"


class PodcastChain:
    """AI 播客生成器链"""

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
            logger.warning("无法解析播客脚本 JSON，返回降级结果")
            return {
                "title": "知识小课堂",
                "segments": [
                    {"speaker": "host", "text": "今天我们来聊聊一个有趣的话题。", "duration_estimate": 10},
                    {"speaker": "guest", "text": "是的，这个话题很有意思，让我们一起来探索吧。", "duration_estimate": 15},
                ],
                "summary": "探索新知识",
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        title = str(data.get("title", "知识小课堂")).strip()
        if not title:
            title = "知识小课堂"

        segments = data.get("segments", [])
        if not isinstance(segments, list):
            segments = []

        validated_segments = []
        for seg in segments:
            if not isinstance(seg, dict):
                continue
            speaker = str(seg.get("speaker", "")).strip()
            if speaker not in ("host", "guest"):
                continue
            text = str(seg.get("text", "")).strip()
            if not text:
                continue
            try:
                duration = int(seg.get("duration_estimate", 15))
                duration = max(5, min(60, duration))
            except (TypeError, ValueError):
                duration = 15
            validated_segments.append({
                "speaker": speaker,
                "text": text,
                "duration_estimate": duration,
            })

        if not validated_segments:
            validated_segments = [
                {"speaker": "host", "text": "今天我们来聊聊一个有趣的话题。", "duration_estimate": 10},
                {"speaker": "guest", "text": "是的，这个话题很有意思。", "duration_estimate": 15},
            ]

        summary = str(data.get("summary", "探索新知识")).strip()
        if not summary:
            summary = "探索新知识"

        return {
            "title": title,
            "segments": validated_segments,
            "summary": summary,
        }

    async def run(
        self,
        topic: str,
        materials: str = "",
        scene: str = "commute",
    ) -> dict[str, Any]:
        """
        生成播客脚本

        Args:
            topic: 播客主题
            materials: 参考材料
            scene: 收听场景（commute/workout/bedtime/break）

        Returns:
            dict: {title, segments: [{speaker, text, duration_estimate}], summary, ...}
        """
        if scene not in ("commute", "workout", "bedtime", "break"):
            scene = "commute"

        logger.info("PodcastChain.run: topic=%s, scene=%s", topic[:50], scene)

        template = self._load_prompt_template()
        prompt = template.format(
            topic=topic,
            materials=materials or "无特定材料",
            scene=scene,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个播客制作人，擅长将知识转化为生动的对话脚本。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.8,
            max_tokens=2048,
            response_format={"type": "json_object"},
            _feature="podcast",
        )

        parsed = self._parse_response(result["content"])
        segments = parsed.get("segments", [])
        status = "success" if len(segments) >= 3 else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }