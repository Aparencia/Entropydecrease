"""
熵减 AI 网关 — 闪卡生成 Chain

采用两阶段 Prompt 策略：
  阶段一：知识点提取 — 从笔记中识别核心概念、定义和关系
  阶段二：卡片生成 — 将知识点转化为结构化问答闪卡（JSON Mode）

两阶段设计优势：
- 分离提取与生成，提高卡片质量
- 阶段一可缓存复用
- 阶段二可并行处理不同难度/类型的卡片

@ai-context: 闪卡生成 Chain：从笔记生成问答闪卡，约束 JSON 输出并校验结构。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "card_gen_v1.txt"

# F1 多情境提取：变体附加指令（状态依赖记忆——同一知识点多情境编码增强提取鲁棒性）
VARIANTS_ADDENDUM = (
    "\n\n【多情境要求】对最重要的知识点，请额外生成 1 个表述不同的变体卡片："
    "换一种问法（正反双向/不同语境/不同题型），答案指向同一知识点。"
    "变体卡片的 type 字段以 '_variant' 结尾（如 'question_answer_variant'）。"
)

# 最大输入长度（字符数）
MAX_INPUT_LENGTH = 8000


class CardGenChain:
    """闪卡生成链（两阶段 Prompt）"""

    def __init__(self, provider: AIProvider, model: str = "qwen-plus"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _preprocess_input(self, note: str) -> str:
        """预处理输入文本"""
        note = note.strip()
        if len(note) > MAX_INPUT_LENGTH:
            note = note[:MAX_INPUT_LENGTH] + "\n\n[注：内容过长，已截断]"
        return note

    async def _stage_extract(self, note: str) -> list[str]:
        """
        阶段一：知识点提取

        从笔记中提取核心知识点列表。

        Args:
            note: 学习笔记内容

        Returns:
            list[str]: 提取的知识点列表
        """
        extract_prompt = (
            "## 笔记内容\n"
            f"{note}\n\n"
            "## 提取要求\n"
            "请从以上学习笔记中提取所有核心知识点，每行一个知识点。"
            "只需要列出知识点，不要编号，不要额外解释。"
        )

        result = await self.provider.generate(
            prompt=extract_prompt,
            system_prompt=(
                "你是一个教育内容专家，擅长从学习材料中识别核心概念、定义和关键关系。\n\n"
                "## 输出规范\n"
                "- 每行一个知识点\n"
                "- 不要编号，不要列表符号\n"
                "- 使用简洁准确的表述\n"
                "- 用中文输出"
            ),
            model=self.model,
            temperature=0.3,
            max_tokens=1024,
        )

        # 按行解析知识点
        content = result["content"].strip()
        knowledge_points = [
            line.strip().lstrip("-•*·")
            for line in content.splitlines()
            if line.strip()
        ]
        logger.info("阶段一提取完成：共 %d 个知识点", len(knowledge_points))
        return knowledge_points

    async def _stage_generate(
        self, knowledge_points: list[str], options: dict[str, Any]
    ) -> list[dict[str, Any]]:
        """
        阶段二：卡片生成（JSON Mode）

        将知识点转化为结构化闪卡。

        Args:
            knowledge_points: 阶段一提取的知识点
            options: 生成选项（max_cards, difficulty, card_type）

        Returns:
            list[dict]: 闪卡列表
        """
        max_cards = options.get("max_cards", 10)
        difficulty = options.get("difficulty", "medium")
        card_type = options.get("card_type", "mixed")
        # F1 多情境提取卡片：为知识点生成不同表述变体
        variants = bool(options.get("variants", False))

        # 将知识点拼成文本，限制数量
        points_text = "\n".join(f"- {kp}" for kp in knowledge_points[:max_cards * 2])

        template = self._load_prompt_template()
        prompt = template.format(
            max_cards=max_cards,
            difficulty=difficulty,
            card_type=card_type,
            note=points_text,
        )
        if variants:
            prompt += VARIANTS_ADDENDUM

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=(
                "你是一个教育内容专家，擅长从知识点中生成高质量问答闪卡。\n\n"
                "## 输出规范\n"
                "- 必须严格按照 JSON 格式输出\n"
                "- 每张卡片包含 front、back、type、confidence 四个字段\n"
                "- 确保问题具有区分度，答案准确完整\n"
                "- 用中文输出"
            ),
            model=self.model,
            temperature=0.4,
            max_tokens=2048,
            response_format={"type": "json_object"},
        )

        cards = try_parse_cards(result["content"])
        logger.info("阶段二生成完成：共 %d 张卡片", len(cards))
        # 多情境模式下允许变体超额，上限放宽 50%
        cap = int(max_cards * 1.5) if variants else max_cards
        return cards[:cap]

    async def run(
        self,
        note: str,
        options: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        执行完整的两阶段闪卡生成

        Args:
            note: 学习笔记内容
            options: 生成选项

        Returns:
            dict: {"cards": [...], "total_extracted": int, ...}
        """
        opts = options or {}
        processed_note = self._preprocess_input(note)

        logger.info("CardGenChain.run: note_length=%d", len(processed_note))

        # 阶段一：知识点提取
        knowledge_points = await self._stage_extract(processed_note)
        total_extracted = len(knowledge_points)

        # 阶段二：卡片生成
        cards = await self._stage_generate(knowledge_points, opts)

        return {
            "cards": cards,
            "total_extracted": total_extracted,
        }


def try_parse_cards(content: str) -> list[dict[str, Any]]:
    """
    容错解析闪卡 JSON 内容

    处理可能的格式变体：
    - 标准 JSON
    - 带 markdown 代码块的 JSON
    - 部分损坏的 JSON（尝试提取有效卡片）
    """
    # 尝试 1：直接解析
    try:
        data = json.loads(content)
        cards = data.get("cards", [])
        if isinstance(cards, list):
            return [_validate_card(c) for c in cards if isinstance(c, dict)]
    except json.JSONDecodeError:
        pass

    # 尝试 2：提取 markdown 代码块中的 JSON
    if "```json" in content:
        try:
            start = content.index("```json") + 7
            end = content.index("```", start)
            data = json.loads(content[start:end].strip())
            cards = data.get("cards", [])
            if isinstance(cards, list):
                return [_validate_card(c) for c in cards if isinstance(c, dict)]
        except (json.JSONDecodeError, ValueError):
            pass

    # 尝试 3：提取普通代码块
    if "```" in content:
        try:
            start = content.index("```") + 3
            end = content.index("```", start)
            data = json.loads(content[start:end].strip())
            cards = data.get("cards", [])
            if isinstance(cards, list):
                return [_validate_card(c) for c in cards if isinstance(c, dict)]
        except (json.JSONDecodeError, ValueError):
            pass

    logger.error("无法解析闪卡 JSON 响应: %s", content[:200])
    return []


def _validate_card(card: dict[str, Any]) -> dict[str, Any]:
    """验证并规范化单张卡片字段"""
    return {
        "front": str(card.get("front", "")),
        "back": str(card.get("back", "")),
        "type": str(card.get("type", "question_answer")),
        "confidence": float(card.get("confidence", 0.8)),
    }
