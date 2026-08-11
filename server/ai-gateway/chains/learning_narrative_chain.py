#!/usr/bin/env python3
"""
熵减 AI 网关 —— 学习叙事 RPG Chain

输入：本周学习统计、当前章节、成就列表
输出：章节名、冒险故事、角色进化、里程碑、下一章悬念

@ai-context: 学习叙事 RPG —— 叙事心理学 + 内在动机 + 身份认同：章节系统
（AI 为每章命名）、角色成长（新手潜航员→深海探索者）、成就徽章叙事版。
"""
import json
import logging
from typing import Any, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "learning_narrative_v1.txt"

# 降级结果（AI 不可用/解析失败时返回）
_DEGRADED_CHAPTER_TITLE = "深海启航"
_DEGRADED_STORY = "本周你继续在知识之海中深潜。每一次复习都是向更深处的探索，每一道错题都是暗礁上的警示灯。海流记录着你的轨迹，里程碑正在前方浮现。"
_DEGRADED_ROLE = "新手潜航员"
_DEGRADED_MILESTONES = [
    {
        "title": "首次深潜完成",
        "description": "完成本周的学习任务，向知识之海迈出坚实一步",
    },
]
_DEGRADED_HINT = "下周的海流将带你驶向更深的领域，保持节奏，继续下潜"


class LearningNarrativeChain:
    """学习叙事 RPG 链"""

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
        """容错解析学习叙事 JSON 输出"""
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
            logger.warning("无法解析学习叙事 JSON，返回降级结果")
            return {
                "chapter_title": _DEGRADED_CHAPTER_TITLE,
                "chapter_story": _DEGRADED_STORY,
                "role_evolution": _DEGRADED_ROLE,
                "milestones": _DEGRADED_MILESTONES,
                "next_chapter_hint": _DEGRADED_HINT,
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段"""
        chapter_title = str(data.get("chapter_title", "")).strip()
        if not chapter_title:
            chapter_title = _DEGRADED_CHAPTER_TITLE

        chapter_story = str(data.get("chapter_story", "")).strip()
        if not chapter_story:
            chapter_story = _DEGRADED_STORY

        role_evolution = str(data.get("role_evolution", "")).strip()
        if not role_evolution:
            role_evolution = _DEGRADED_ROLE

        milestones = data.get("milestones", [])
        if not isinstance(milestones, list):
            milestones = []

        validated_milestones: list[dict[str, Any]] = []
        for milestone in milestones:
            if not isinstance(milestone, dict):
                continue
            title = str(milestone.get("title", "")).strip()
            if not title:
                continue
            validated_milestones.append({
                "title": title,
                "description": str(milestone.get("description", "")).strip(),
            })

        if not validated_milestones:
            validated_milestones = _DEGRADED_MILESTONES

        next_chapter_hint = str(data.get("next_chapter_hint", "")).strip()
        if not next_chapter_hint:
            next_chapter_hint = _DEGRADED_HINT

        return {
            "chapter_title": chapter_title,
            "chapter_story": chapter_story,
            "role_evolution": role_evolution,
            "milestones": validated_milestones,
            "next_chapter_hint": next_chapter_hint,
        }

    async def run(
        self,
        learning_stats: str = "",
        current_chapter: str = "",
        achievements: Optional[List[str]] = None,
    ) -> dict[str, Any]:
        """
        生成本周学习叙事章节

        Args:
            learning_stats: 本周学习统计（如"学习5天，正确率65%，复习42次"）
            current_chapter: 当前章节（上次返回的章节名）
            achievements: 本周成就列表（如 ["错题克星", "连续打卡7天"]）

        Returns:
            dict: {
                "chapter_title": "章节名",
                "chapter_story": "冒险故事",
                "role_evolution": "当前角色称号",
                "milestones": [{"title": "...", "description": "..."}],
                "next_chapter_hint": "下一章悬念",
                "status": "success" | "degraded",
                "model": "qwen-plus",
                "tokens_used": 1234,
                "latency_ms": 123,
            }
        """
        stats_text = (learning_stats or "").strip() or "暂无统计"
        chapter_text = (current_chapter or "").strip() or "第一章：初次下潜"
        achievements = achievements or []
        achievements_text = "、".join([str(a).strip() for a in achievements if str(a).strip()]) or "暂无成就"

        logger.info(
            "LearningNarrativeChain.run: chapter=%s, achievements=%d",
            chapter_text[:30], len(achievements),
        )

        template = self._load_prompt_template()
        prompt = template.format(
            learning_stats=stats_text,
            current_chapter=chapter_text,
            achievements=achievements_text,
        )

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt="你是一个学习叙事设计师，将学习数据编织成深海冒险故事。请务必以 JSON 格式输出。",
            model=self.model,
            temperature=0.8,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="learning_narrative",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed.get("chapter_title") and parsed["chapter_title"] != _DEGRADED_CHAPTER_TITLE else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
