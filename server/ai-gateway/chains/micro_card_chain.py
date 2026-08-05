#!/usr/bin/env python3
"""
熵减 AI 网关 —— 微学习卡片流 Chain

输入：复杂知识文本
输出：微学习卡片流（每张卡片 30 秒可消化的独立知识块：front/back/tags/difficulty）

@ai-context: 微学习卡片流（Phase4）——复杂知识拆解为 30 秒微学习块：
每张卡片 front 自包含（不依赖上下文，30 秒内可读完理解），按认知递进排序，
难度 1-5 分级，供碎片时间滑动复习与间隔重复调度使用。
"""
import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "micro_card_v1.txt"

# 输入内容长度上限（防止超长 prompt 撑爆上下文）
MAX_CONTENT_CHARS = 8000

# 合法的难度取值
MIN_DIFFICULTY, MAX_DIFFICULTY = 1, 5


class MicroCardChain:
    """微学习卡片流链"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _parse_response(self, content: str) -> dict[str, Any]:
        """容错解析微学习卡片流 JSON 输出"""
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

        if data is None or not isinstance(data, dict):
            logger.warning("无法解析微学习卡片流 JSON，返回降级结果")
            return {"cards": [], "total_cards": 0}

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段（逐项校验，非法项丢弃而非崩溃）"""
        cards: list[dict[str, Any]] = []
        raw_cards = data.get("cards", [])
        if isinstance(raw_cards, list):
            seq = 0  # 清洗后保留卡片的序号（缺 id 时按此编号）
            for item in raw_cards:
                if not isinstance(item, dict):
                    continue
                front = str(item.get("front", "")).strip()
                back = str(item.get("back", "")).strip()
                # front/back 缺一不可（front 是 30 秒可消化的核心，back 是补充）
                if not front or not back:
                    continue
                # id：LLM 未生成时按清洗后序号自动编号
                seq += 1
                card_id = str(item.get("id", "")).strip()
                if not card_id:
                    card_id = f"card-{seq}"
                # tags：归一为字符串列表
                tags = item.get("tags", [])
                if not isinstance(tags, list):
                    tags = []
                tags = [str(t).strip() for t in tags if isinstance(t, str) and t.strip()]
                # difficulty：归一为 1-5 整数（非法值兜底 3）
                try:
                    difficulty = int(item.get("difficulty", 3))
                except (TypeError, ValueError):
                    difficulty = 3
                difficulty = max(MIN_DIFFICULTY, min(MAX_DIFFICULTY, difficulty))
                cards.append({
                    "id": card_id,
                    "front": front,
                    "back": back,
                    "tags": tags,
                    "difficulty": difficulty,
                })

        # total_cards 以实际卡片数为准（LLM 输出的计数不可信）
        return {"cards": cards, "total_cards": len(cards)}

    async def run(self, content: str) -> dict[str, Any]:
        """
        将复杂知识拆解为微学习卡片流

        Args:
            content: 复杂知识文本

        Returns:
            dict: {
                "cards": [{"id": "card-1", "front": "...", "back": "...",
                           "tags": ["..."], "difficulty": 3}],
                "total_cards": 5,
                "status": "success" | "degraded",
                "model": "qwen-plus",
                "tokens_used": 1234,
                "latency_ms": 123,
            }
        """
        content_text = (content or "").strip()
        if not content_text:
            logger.warning("微学习卡片流: 输入内容为空，返回降级结果")
            return {
                "cards": [],
                "total_cards": 0,
                "status": "degraded",
                "model": "local_rule",
                "tokens_used": 0,
                "latency_ms": 0,
            }
        # 截断超长内容，防止 prompt 超上下文窗口
        if len(content_text) > MAX_CONTENT_CHARS:
            content_text = content_text[:MAX_CONTENT_CHARS]
            logger.warning("微学习卡片流: 内容超过 %d 字符，已截断", MAX_CONTENT_CHARS)

        logger.info("MicroCardChain.run: content_len=%d", len(content_text))

        template = self._load_prompt_template()
        prompt = template.format(content=content_text)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=(
                "你是一个微学习课程设计师，擅长把复杂知识拆解为 30 秒可消化的"
                "微学习卡片（front 自包含、无需上下文）。请务必以 JSON 格式输出。"
            ),
            model=self.model,
            temperature=0.4,
            max_tokens=4096,
            response_format={"type": "json_object"},
            _feature="micro_card",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed.get("cards") else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
