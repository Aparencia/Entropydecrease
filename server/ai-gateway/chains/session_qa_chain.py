"""
熵减 AI 网关 — 课堂问答 Chain（D2 回声定位问答）

以课堂转写片段为上下文回答用户问题，并返回引用来源（时间戳+摘录）：
- 输入为客户端已截断的转写文本（本地优先，网关不接触原始音频）
- 输出 JSON {"answer", "references": [{"time", "text"}]}，解析失败 status=degraded

@ai-context: Session-QA chain: answers questions grounded in the classroom
transcript with source references (timestamps). Degraded on parse failure.
"""

import json
import logging
from pathlib import Path
from typing import Any

from providers.base_provider import AIProvider

logger = logging.getLogger(__name__)

# 转写文本最大长度（字符数，防御异常入参）
MAX_TRANSCRIPT_LENGTH = 8000

PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "session_qa_v1.txt"

with open(PROMPT_TEMPLATE_PATH, encoding="utf-8") as f:
    SYSTEM_PROMPT = f.read().strip()

USER_PROMPT_TEMPLATE = """课堂转写内容：

{transcript}

问题：{question}

请严格按系统要求返回 JSON。"""


class SessionQaChain:
    """课堂问答生成链"""

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model

    def _parse(self, content: str) -> dict[str, Any]:
        """容错解析问答 JSON（标准 JSON / markdown 代码块）"""
        data = None
        try:
            data = json.loads(content)
        except json.JSONDecodeError:
            pass

        if data is None and "```" in content:
            fence = "```json" if "```json" in content else "```"
            try:
                start = content.index(fence) + len(fence)
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                pass

        if not isinstance(data, dict):
            logger.warning("课堂问答 JSON 解析失败")
            return {"answer": "", "references": []}

        answer = str(data.get("answer", "")).strip()[:600]
        refs = []
        for ref in data.get("references", []) if isinstance(data.get("references", []), list) else []:
            if not isinstance(ref, dict):
                continue
            time_str = str(ref.get("time", "")).strip()[:16]
            text = str(ref.get("text", "")).strip()[:80]
            if time_str and text:
                refs.append({"time": time_str, "text": text})
        return {"answer": answer, "references": refs[:3]}

    async def run(self, transcript: str, question: str) -> dict[str, Any]:
        """
        执行课堂问答

        Args:
            transcript: 课堂转写文本（已截断）
            question: 用户问题

        Returns:
            dict: {answer, references, status, model, tokens_used, latency_ms}
        """
        processed = transcript.strip()
        if len(processed) > MAX_TRANSCRIPT_LENGTH:
            processed = processed[:MAX_TRANSCRIPT_LENGTH]

        logger.info("SessionQaChain.run: transcript_length=%d, question_length=%d", len(processed), len(question))

        prompt = USER_PROMPT_TEMPLATE.format(transcript=processed, question=question[:500])

        result = await self.provider.generate(
            prompt=prompt,
            system_prompt=SYSTEM_PROMPT,
            model=self.model,
            temperature=0.3,
            max_tokens=1024,
            response_format={"type": "json_object"},
            _feature="session_qa",
        )

        parsed = self._parse(result["content"])
        answer = parsed.get("answer", "")
        references = parsed.get("references", [])
        status = "success" if answer else "degraded"

        return {
            "answer": answer,
            "references": references,
            "status": status,
            "model": result["model"],
            "tokens_used": result["tokens_used"],
            "latency_ms": result["latency_ms"],
        }
