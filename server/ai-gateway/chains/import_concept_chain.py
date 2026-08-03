#!/usr/bin/env python3
"""
熵减 AI 网关 —— 知识入籍概念化 Chain（阶段 A 入口问题）

输入：来源标题 + 文本块列表
输出：核心概念列表（name / summary / card_front / card_back）

@ai-context: 知识入籍（settling）——把外部材料（PDF/网页/文本）转化为可安放
入世界的概念单元。JSON Mode 输出 + 逐字段校验，非法条目过滤；空结果视为
失败走 fallback 链（与 concept_precheck 同构）。
@ai-context: Import-concept chain for the knowledge-settling flow.
JSON Mode output with per-field validation; empty results fail to fallback.
"""
import json
import logging
from typing import Any, Dict, List, Optional

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# 单次入籍最多提取的概念数 / Max concepts per settling request
MAX_CONCEPTS = 10

# 输入预算（与前端 textChunker.MAX_CHUNK_CHARS 对齐）/ Input budgets
MAX_CHUNK_CHARS = 3000
MAX_CHUNKS = 50
MAX_TOTAL_CHARS = 50000

_SYSTEM_PROMPT = (
    "你是一位善于提炼知识的费曼教练。你会从学习材料中找出真正值得"
    "间隔重复掌握的核心概念，而不是章节标题或零散事实。请严格按 JSON 格式输出。"
)

_PROMPT_TEMPLATE = (
    "下面是学习材料《{title}》的文本片段（已按段落切块，块间以行分隔）：\n\n"
    "{chunks}\n\n"
    "请从材料中提取最多 {max_concepts} 个核心概念，每个概念输出一个对象，字段：\n"
    "- name：概念名称（简短，不超过 30 字）\n"
    "- summary：一句话摘要（不超过 60 字）\n"
    "- card_front：用于复习的提问（问题形式，如\"什么是X？\"）\n"
    "- card_back：答案要点（1-3 条，每条不超过 30 字）\n\n"
    '只输出 JSON 对象：{{"concepts": [{{"name": "...", "summary": "...", '
    '"card_front": "...", "card_back": "..."}}]}}\n'
    "宁可少而准，不要多而滥；没有值得提炼的概念时输出空列表。"
)


class ImportConceptChain:
    """知识入籍概念化链 / Concept-extraction chain for settling"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model

    @staticmethod
    def _validate_concept(item: Any) -> Optional[Dict[str, str]]:
        """校验单个概念，非法返回 None / Validate one concept entry"""
        if not isinstance(item, dict):
            return None
        name = str(item.get("name", "")).strip()
        if not name or len(name) > 80:
            return None
        summary = str(item.get("summary", "")).strip()[:300]
        card_front = str(item.get("card_front", "")).strip()
        card_back = str(item.get("card_back", "")).strip()[:500]
        # 正面可缺省（前端由 name 派生），背面可空；名称必须存在
        if not card_front:
            card_front = f"什么是{name}？"
        return {
            "name": name,
            "summary": summary,
            "card_front": card_front[:200],
            "card_back": card_back,
        }

    async def run(self, title: str, text_chunks: List[str]) -> Dict[str, Any]:
        """
        从文本块提取核心概念

        Args:
            title: 来源标题/文件名
            text_chunks: 已切块的文本（每块 ≤ MAX_CHUNK_CHARS）

        Returns:
            dict: {concepts, model, tokens_used, latency_ms}；解析失败时
            concepts 为空、model 为 "fallback"，由调用方决定是否降级。
        """
        # 拼接文本块并施加总量预算（token 控制 / token budget）
        joined: List[str] = []
        total = 0
        for chunk in text_chunks:
            piece = chunk.strip()[:MAX_CHUNK_CHARS]
            if not piece:
                continue
            if total + len(piece) > MAX_TOTAL_CHARS:
                break
            joined.append(piece)
            total += len(piece)
        if not joined:
            return {"concepts": [], "model": "fallback", "tokens_used": 0, "latency_ms": 0}

        prompt = _PROMPT_TEMPLATE.format(
            title=(title or "未命名材料")[:200],
            chunks="\n\n".join(f"[块 {i + 1}] {p}" for i, p in enumerate(joined)),
            max_concepts=MAX_CONCEPTS,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=_SYSTEM_PROMPT,
            model=self.model,
            temperature=0.3,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )

        try:
            content = result["content"].strip()
            if content.startswith("```json"):
                content = content[7:-3].strip()
            elif content.startswith("```"):
                content = content[3:-3].strip()
            data = json.loads(content)

            raw_concepts: List[Any] = data.get("concepts", [])
            concepts = [
                c for c in (self._validate_concept(rc) for rc in raw_concepts) if c
            ]
            if not concepts:
                raise ValueError("no valid concepts extracted")

            return {
                "concepts": concepts[:MAX_CONCEPTS],
                "model": result.get("model", "unknown"),
                "tokens_used": result.get("tokens_used", 0),
                "latency_ms": result.get("latency_ms", 0),
            }
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.error(
                "ImportConceptChain.parse_error: %s, content=%s",
                str(e), result.get("content", "")[0:200],
            )
            return {
                "concepts": [],
                "model": "fallback",
                "tokens_used": 0,
                "latency_ms": 0,
            }
