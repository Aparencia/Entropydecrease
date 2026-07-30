"""
熵减 AI 网关 — 文本段落去重工具

@ai-context merge-notes 兜底去重：模型合并增量片段笔记后仍可能残留大量
重复段落（实测重复率可达 60%+），按空行分段计算段落词集的 Jaccard 相似度，
相似度超过阈值时去除后出现的段落，保留首次出现的版本。
(Paragraph-level dedup safety net for merge-notes: split by blank lines,
compute word-set Jaccard similarity, drop the later near-duplicate.)
"""

import re

# 分词：中文按单字、英文/数字按连续词（CJK char-level + latin word-level）
_TOKEN_RE = re.compile(r"[\u4e00-\u9fff]|[a-zA-Z0-9_]+")

# 段落分隔：一个或多个空行（含仅空白字符的行）
_PARA_SPLIT_RE = re.compile(r"\n\s*\n")


def _tokenize(paragraph: str) -> frozenset[str]:
    """将段落切分为词集（小写归一化），用于 Jaccard 相似度计算"""
    return frozenset(tok.lower() for tok in _TOKEN_RE.findall(paragraph))


def _jaccard(a: frozenset[str], b: frozenset[str]) -> float:
    """计算两个词集的 Jaccard 相似度（空集视为不相似，返回 0.0）"""
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    if intersection == 0:
        return 0.0
    return intersection / len(a | b)


def dedup_paragraphs(text: str, threshold: float = 0.85) -> str:
    """
    段落级去重：移除与前文高度相似的重复段落

    @ai-context 保序策略——逐段与所有已保留段落比较，相似度 > threshold
    时丢弃当前段落（保留首次出现的版本），段落原文与顺序均不改动。
    分隔符统一为一个空行（Markdown 语义等价）。

    Args:
        text:      待去重的 Markdown 文本
        threshold: Jaccard 相似度阈值，超过即视为重复（默认 0.85）

    Returns:
        去重后的文本；空输入原样返回
    """
    if not text or not text.strip():
        return text

    paragraphs = [p for p in _PARA_SPLIT_RE.split(text) if p.strip()]

    kept: list[str] = []
    kept_tokens: list[frozenset[str]] = []

    for para in paragraphs:
        tokens = _tokenize(para)
        # 与所有已保留段落比较，命中即丢弃当前段落
        is_duplicate = any(
            _jaccard(tokens, prev) > threshold for prev in kept_tokens
        )
        if is_duplicate:
            continue
        kept.append(para.strip())
        kept_tokens.append(tokens)

    return "\n\n".join(kept)
