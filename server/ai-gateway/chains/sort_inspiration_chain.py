"""
熵减 AI 网关 — 灵感分拣 Chain

分析灵感/笔记内容，推荐最适合的归类目标：
- feynman: 适合做费曼讲解的概念
- flashcard: 适合制作闪卡的知识点
- note: 适合整理为正式笔记
- todo: 包含行动计划或待办事项
- action_item: 需要立即执行的行动项（v1.0.0 新增）

@ai-context: 灵感排序 Chain：对灵感条目智能排序并说明理由。
"""

import json
import logging
from typing import Any, Optional

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "你是一位智能学习助手，擅长分析学习内容并推荐最佳整理方式。\n"
    "请分析给定的灵感/笔记内容，判断它最适合被归类到以下哪些目标中，"
    "并按置信度从高到低排列，输出 1-5 个建议。\n\n"
    "归类目标：\n"
    "1. feynman — 适合做费曼讲解练习的概念或知识点（有明确的理论或概念可以解释）\n"
    "2. flashcard — 适合制作闪卡进行记忆复习的内容（有明确的前后对应关系，如定义、公式、问答）\n"
    "3. note — 适合整理为结构化笔记的内容（有较完整的知识体系或详细描述）\n"
    "4. todo — 包含行动计划、待办事项或需要后续执行的任务\n"
    "5. action_item — 需要立即执行的具体行动（有明确的步骤、截止日期或紧迫性）\n\n"
    "输出格式（严格 JSON Schema）：\n"
    '{"suggestions": [{"category": "...", "confidence": 0.0, "reason": "...", "suggestedAction": "..."}]}\n\n'
    "其中：\n"
    "- category: 归类目标，取值 feynman/flashcard/note/todo/action_item\n"
    "- confidence: 置信度 0.0-1.0，表示该归类的适合程度\n"
    "- reason: 简短说明推荐理由（中文，20字以内）\n"
    "- suggestedAction: 推荐的后续操作（中文，如：'生成闪卡'、'创建费曼讲解'、'添加到待办'）\n"
)


class SortInspirationChain:
    """灵感分拣链"""

    # v1.0.0: 新增 action_item 类型，向后兼容旧 type 字段
    VALID_TYPES = {"feynman", "flashcard", "note", "todo", "action_item"}

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model

    def _parse_suggestions(self, content: str) -> list[dict[str, Any]]:
        """
        解析模型输出为结构化建议列表

        兼容两种格式：
        - v1.0.0: {"suggestions": [{"category": "...", "confidence": 0.0, "reason": "...", "suggestedAction": "..."}]}
        - 旧格式: {"suggestions": [{"type": "...", "reason": "...", "confidence": 0.0}]}
        """
        data = None

        # 尝试直接解析 JSON
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        # 尝试提取 markdown 代码块中的 JSON
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
            logger.warning("无法解析分拣 JSON，返回默认建议")
            return [
                {
                    "category": "note",
                    "confidence": 0.5,
                    "reason": "内容暂无法明确归类，建议整理为笔记",
                    "suggestedAction": "整理为笔记",
                }
            ]

        return self._validate_suggestions(data)

    def _validate_suggestions(self, data: dict[str, Any]) -> list[dict[str, Any]]:
        """验证并规范化建议字段（支持 category 和旧版 type 字段）"""
        raw_suggestions = data.get("suggestions", [])
        if not isinstance(raw_suggestions, list) or len(raw_suggestions) == 0:
            return [
                {
                    "category": "note",
                    "confidence": 0.5,
                    "reason": "内容暂无法明确归类，建议整理为笔记",
                    "suggestedAction": "整理为笔记",
                }
            ]

        # suggestedAction 映射表
        ACTION_MAP = {
            "feynman": "创建费曼讲解",
            "flashcard": "生成闪卡",
            "note": "整理为笔记",
            "todo": "添加到待办",
            "action_item": "立即执行",
        }

        validated: list[dict[str, Any]] = []
        for item in raw_suggestions:
            if not isinstance(item, dict):
                continue

            # 向后兼容：优先使用 category，回退到 type
            stype = str(item.get("category", item.get("type", "note"))).lower().strip()
            if stype not in self.VALID_TYPES:
                stype = "note"

            reason = str(item.get("reason", "")).strip()
            if not reason:
                reason = f"建议归类为{stype}"

            try:
                confidence = float(item.get("confidence", 0.5))
                confidence = max(0.0, min(1.0, confidence))
            except (TypeError, ValueError):
                confidence = 0.5

            suggested_action = str(item.get("suggestedAction", "")).strip()
            if not suggested_action:
                suggested_action = ACTION_MAP.get(stype, "整理为笔记")

            validated.append({
                "category": stype,
                "confidence": round(confidence, 2),
                "reason": reason,
                "suggestedAction": suggested_action,
            })

        # 按 confidence 降序排列
        validated.sort(key=lambda x: x["confidence"], reverse=True)

        # 最多返回 5 个建议
        return validated[:5] if validated else [
            {
                "category": "note",
                "confidence": 0.5,
                "reason": "内容暂无法明确归类，建议整理为笔记",
                "suggestedAction": "整理为笔记",
            }
        ]

    async def run(
        self,
        content: str,
        existing_tags: Optional[dict[str, str]] = None,
    ) -> dict[str, Any]:
        """
        对灵感内容进行分析并推荐归类目标

        Args:
            content: 原始文本内容
            existing_tags: 可选的已有标签信息，辅助判断

        Returns:
            dict: { suggestions, model, tokens_used, latency_ms }
        """
        logger.info("SortInspirationChain.run: content_length=%d", len(content))

        # 构建提示：包含已有标签信息（如有）
        user_prompt = f"请分析以下灵感内容，推荐最适合的归类目标：\n\n{content}"
        if existing_tags:
            tag_info = ", ".join(f"{k}={v}" for k, v in existing_tags.items() if v)
            if tag_info:
                user_prompt += f"\n\n已有标签信息：{tag_info}"

        result = await self.provider.generate(
            prompt=user_prompt,
            system_prompt=SYSTEM_PROMPT,
            model=self.model,
            temperature=0.4,
            max_tokens=512,
            response_format={"type": "json_object"},
        )

        suggestions = self._parse_suggestions(result["content"])

        return {
            "suggestions": suggestions,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
            "status": "success",
        }
