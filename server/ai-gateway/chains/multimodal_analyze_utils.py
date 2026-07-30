"""
熵减 AI 网关 — 多模态课堂分析 Chain 的无状态工具函数

@ai-context 从 multimodal_analyze_chain.py 拆出（单文件 ≤300 行约束）：
时间戳格式化 / 输出围栏剥离 / max_tokens 截断检测，均为纯函数无副作用。
(Stateless helpers extracted from MultimodalAnalyzeChain: timestamp
formatting, markdown fence stripping, truncation detection.)
"""

import logging

logger = logging.getLogger(__name__)

# 疑似截断判定用的结束标点集合（terminal punctuation for truncation check）
_TERMINAL_CHARS = "。！？.!?…）)”\"'`*]】」』"


def format_timestamp(seconds: float) -> str:
    """将秒数格式化为 MM:SS 时间戳"""
    total = int(seconds)
    mins, secs = divmod(total, 60)
    return f"{mins:02d}:{secs:02d}"


def strip_markdown_fence(raw: str) -> str:
    """
    解析模型返回内容

    多模态分析直接输出 Markdown 文本，无需 JSON 解析。
    若模型意外包裹在代码块中，去除外层围栏。
    """
    stripped = raw.strip()
    # 去除模型常见的外层 Markdown 代码块围栏
    if stripped.startswith("```markdown"):
        stripped = stripped[len("```markdown"):].strip()
        if stripped.endswith("```"):
            stripped = stripped[:-3].strip()
    elif stripped.startswith("```") and stripped.endswith("```"):
        inner = stripped[3:].strip()
        if inner.endswith("```"):
            inner = inner[:-3].strip()
        # 仅当内层不含其他 ``` 时才剥离（避免破坏代码块）
        if "```" not in inner:
            stripped = inner
    return stripped


def warn_if_truncated(content: str, tokens_used: int, max_tokens: int) -> None:
    """
    输出末尾疑似截断时记录告警

    @ai-context tokens_used 达到请求上限且末尾无结束标点时，大概率是
    max_tokens 截断（如 GLM-4V-Flash clamp 到 1024），便于运维定位质量问题。
    (Warn on suspected max_tokens truncation: budget exhausted + no
    terminal punctuation at the end.)
    """
    stripped = content.rstrip()
    if not stripped or tokens_used < max_tokens:
        return
    if stripped[-1] not in _TERMINAL_CHARS:
        logger.warning(
            "MultimodalAnalyzeChain: 输出疑似被 max_tokens 截断 "
            "(tokens_used=%d, max_tokens=%d, tail=%r)",
            tokens_used, max_tokens, stripped[-20:],
        )
