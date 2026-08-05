#!/usr/bin/env python3
"""
熵减 AI 网关 —— 知识保鲜检测 Chain

输入：知识条目列表（笔记/卡片的概念文本 + 最后复习日期）
输出：每条知识的保鲜度（fresh/expiring/expired）、原因、建议 + 整体总结

@ai-context: 知识保鲜系统（G4）——知识半衰期 + 间隔重复：判断知识是否因
领域更新而过时，过期预警 + 刷新机制（过期知识推送复习或更新提醒）。
"""
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "freshness_v1.txt"

# 合法的保鲜度取值
VALID_FRESHNESS = {"fresh", "expiring", "expired"}

# 最多分析的知识条数
MAX_ITEMS = 20


class FreshnessChain:
    """知识保鲜检测链"""

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
        """容错解析知识保鲜检测 JSON 输出"""
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
            logger.warning("无法解析知识保鲜检测 JSON，返回降级结果")
            return {
                "items": [],
                "summary": "AI 分析失败，请稍后重试或检查网络连接。",
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段"""
        items = data.get("items", [])
        if not isinstance(items, list):
            items = []

        validated_items: list[dict[str, Any]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            concept = str(item.get("concept", "")).strip()
            freshness = str(item.get("freshness", "")).strip()
            # 缺概念名或保鲜度非法时丢弃该项（LLM 输出质量问题）
            if not concept or freshness not in VALID_FRESHNESS:
                continue
            validated_items.append({
                "concept": concept,
                "freshness": freshness,
                "reason": str(item.get("reason", "")).strip(),
                "recommendation": str(item.get("recommendation", "")).strip(),
            })

        summary = str(data.get("summary", "")).strip()
        if not summary:
            summary = "暂无总结"

        return {
            "items": validated_items,
            "summary": summary,
        }

    async def run(
        self,
        items: List[Dict[str, Any]],
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        检测知识条目的保鲜状态

        Args:
            items: 知识条目列表，每个元素含 {concept, content?, lastReviewedAt?}，
                   兼容 lastReviewedDate/last_reviewed/note 等字段别名
            options: 检测选项（目前为空）

        Returns:
            dict: {
                "items": [{"concept": "...", "freshness": "fresh|expiring|expired",
                           "reason": "...", "recommendation": "..."}],
                "summary": "整体保鲜状况总结",
                "status": "success" | "degraded",
                "model": "qwen-plus",
                "tokens_used": 1234,
                "latency_ms": 123,
            }
        """
        # 防御性取值——调用方传入缺字段 dict 时不会 KeyError，
        # 兼容多种字段命名，并过滤无概念名的空项
        def _safe_text(value: Any) -> str:
            return str(value) if value is not None else ""

        normalized_items: list[dict[str, str]] = []
        for item in items[:MAX_ITEMS]:  # 最多分析前 20 条
            if not isinstance(item, dict):
                continue
            concept = _safe_text(item.get("concept") or item.get("conceptText") or item.get("name")).strip()
            content = _safe_text(item.get("content") or item.get("note") or item.get("text")).strip()
            last_reviewed = _safe_text(
                item.get("lastReviewedAt") or item.get("lastReviewedDate")
                or item.get("last_reviewed") or "未知"
            ).strip()
            if not concept:
                continue
            normalized_items.append({
                "concept": concept,
                "content": content or "无摘要",
                "lastReviewedAt": last_reviewed,
            })

        items_text = "\n".join([
            f"【知识 #{i+1}】\n概念：{it['concept']}\n最后复习：{it['lastReviewedAt']}\n内容摘要：{it['content']}\n---"
            for i, it in enumerate(normalized_items)
        ])

        template = self._load_prompt_template()
        prompt = template.format(items=items_text)

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个知识保鲜专家，擅长基于知识半衰期判断知识是否因领域更新而过时。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.3,
            max_tokens=2048,
            response_format={"type": "json_object"},
            _feature="freshness",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed.get("items") else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
