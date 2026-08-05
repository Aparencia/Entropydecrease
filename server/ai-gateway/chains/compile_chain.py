#!/usr/bin/env python3
"""
熵减 AI 网关 —— 知识编译引擎 Chain

输入：课程/主题笔记列表（多篇笔记的标题 + 内容，可附带主题名）
输出：知识摘要 / 概念图谱 / 闪卡精华集 / 费曼精选 / 学习路径推荐（JSON）

@ai-context: 知识编译引擎（Phase4）——多笔记编译为结构化学习资源：
知识摘要（主线提炼）+ 概念图谱（概念关系 + 掌握度估计）+ 闪卡精华集
（高价值问答卡片）+ 费曼精选（可大白话复述的核心概念）+ 学习路径推荐
（递进学习步骤）。输出直接供给复习、图谱与路径规划下游使用。
"""
import json
import logging
from typing import Any, Dict, List, Optional
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "compile_v1.txt"

# 最多编译的笔记数
MAX_NOTES = 10

# 拼接后笔记正文总长度上限（字符）：超出截断，防止超长输入进 prompt
# （路由层已限制单篇 20000 字符，但 10 篇可达 20 万字符，超 Qwen 上下文）
MAX_CONTENT_CHARS = 30000

# 降级默认值（AI 不可用/解析失败时返回）
_DEGRADED_SUMMARY = "AI 编译失败，请稍后重试或检查网络连接。"
_DEGRADED_MASTERY = 0.3  # 掌握度估计的默认兜底值


class CompileChain:
    """知识编译引擎链"""

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
        """容错解析知识编译 JSON 输出"""
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
            logger.warning("无法解析知识编译 JSON，返回降级结果")
            return {
                "summary": _DEGRADED_SUMMARY,
                "concept_map": [],
                "flashcard_highlights": [],
                "feynman_picks": [],
                "learning_path": [],
            }

        return self._validate_response(data)

    def _validate_response(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化响应字段（逐项校验，非法项丢弃而非崩溃）"""
        summary = str(data.get("summary", "")).strip()
        if not summary:
            summary = "暂无总结"

        # ---- 概念图谱：concept 非空才保留，related 归一为字符串列表，
        # mastery_estimate 归一为 0-1 数字（非法值用默认兜底）----
        concept_map: list[dict[str, Any]] = []
        raw_concepts = data.get("concept_map", [])
        if isinstance(raw_concepts, list):
            for item in raw_concepts:
                if not isinstance(item, dict):
                    continue
                concept = str(item.get("concept", "")).strip()
                if not concept:
                    continue
                related = item.get("related", [])
                if not isinstance(related, list):
                    related = []
                related = [str(r).strip() for r in related if isinstance(r, str) and r.strip()]
                mastery = item.get("mastery_estimate", _DEGRADED_MASTERY)
                try:
                    mastery = float(mastery)
                except (TypeError, ValueError):
                    mastery = _DEGRADED_MASTERY
                mastery = max(0.0, min(1.0, mastery))  # 钳制到 [0, 1]
                concept_map.append({
                    "concept": concept,
                    "related": related,
                    "mastery_estimate": mastery,
                })

        # ---- 闪卡精华集：front/back 均非空才保留 ----
        flashcard_highlights: list[dict[str, str]] = []
        raw_cards = data.get("flashcard_highlights", [])
        if isinstance(raw_cards, list):
            for item in raw_cards:
                if not isinstance(item, dict):
                    continue
                front = str(item.get("front", "")).strip()
                back = str(item.get("back", "")).strip()
                if not front or not back:
                    continue
                flashcard_highlights.append({"front": front, "back": back})

        # ---- 费曼精选：concept/takeaway 均非空才保留 ----
        feynman_picks: list[dict[str, str]] = []
        raw_picks = data.get("feynman_picks", [])
        if isinstance(raw_picks, list):
            for item in raw_picks:
                if not isinstance(item, dict):
                    continue
                concept = str(item.get("concept", "")).strip()
                takeaway = str(item.get("takeaway", "")).strip()
                if not concept or not takeaway:
                    continue
                feynman_picks.append({"concept": concept, "takeaway": takeaway})

        # ---- 学习路径：step/action 均非空才保留 ----
        learning_path: list[dict[str, str]] = []
        raw_path = data.get("learning_path", [])
        if isinstance(raw_path, list):
            for item in raw_path:
                if not isinstance(item, dict):
                    continue
                step = str(item.get("step", "")).strip()
                action = str(item.get("action", "")).strip()
                if not step or not action:
                    continue
                learning_path.append({"step": step, "action": action})

        return {
            "summary": summary,
            "concept_map": concept_map,
            "flashcard_highlights": flashcard_highlights,
            "feynman_picks": feynman_picks,
            "learning_path": learning_path,
        }

    async def run(
        self,
        notes: List[Dict[str, Any]],
        options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        编译课程/主题笔记为结构化学习资源

        Args:
            notes: 笔记列表，每个元素含 {title, content}，
                   兼容 noteTitle/noteContent/text 等字段别名
            options: 编译选项（可选），支持 {"theme": "主题名"}

        Returns:
            dict: {
                "summary": "知识摘要",
                "concept_map": [{"concept": "...", "related": ["..."], "mastery_estimate": 0.6}],
                "flashcard_highlights": [{"front": "...", "back": "..."}],
                "feynman_picks": [{"concept": "...", "takeaway": "..."}],
                "learning_path": [{"step": "...", "action": "..."}],
                "status": "success" | "degraded",
                "model": "qwen-plus",
                "tokens_used": 1234,
                "latency_ms": 123,
            }
        """
        # 防御性取值——调用方传入缺字段 dict 时不会 KeyError，
        # 兼容多种字段命名，并过滤标题与内容均为空的笔记
        def _safe_text(value: Any) -> str:
            return str(value) if value is not None else ""

        normalized_notes: list[dict[str, str]] = []
        for note in notes[:MAX_NOTES]:  # 最多编译前 10 篇笔记
            if not isinstance(note, dict):
                continue
            title = _safe_text(note.get("title") or note.get("noteTitle")).strip()
            content = _safe_text(
                note.get("content") or note.get("noteContent") or note.get("text")
            ).strip()
            if not title and not content:
                continue
            normalized_notes.append({
                "title": title or "未命名笔记",
                "content": content or "（无内容）",
            })

        theme = ""
        if options:
            theme = _safe_text(options.get("theme")).strip()

        notes_text = "\n".join([
            f"【笔记 #{i+1}】{note['title']}\n{note['content']}\n---"
            for i, note in enumerate(normalized_notes)
        ])
        # 总长度截断：超出后保留前缀并标注，防止超长输入进 prompt
        if len(notes_text) > MAX_CONTENT_CHARS:
            notes_text = notes_text[:MAX_CONTENT_CHARS] + "\n...（内容过长，已截断）"

        template = self._load_prompt_template()
        prompt = template.format(notes=notes_text, theme=theme or "未指定（综合全部笔记推断）")

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=(
                "你是一个知识编译专家，擅长把多篇碎片笔记编译成结构化学习资源"
                "（摘要/概念图谱/闪卡/费曼解释/学习路径）。请务必以 JSON 格式输出。"
            ),
            model=self.model,
            temperature=0.3,
            max_tokens=4096,
            response_format={"type": "json_object"},
            _feature="compile",
        )

        parsed = self._parse_response(result["content"])
        status = "success" if parsed.get("summary") and parsed["summary"] != _DEGRADED_SUMMARY else "degraded"

        return {
            **parsed,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
