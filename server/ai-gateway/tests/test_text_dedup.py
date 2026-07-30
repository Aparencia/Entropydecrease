"""
测试文本段落去重工具（utils/text_dedup.py）

覆盖：
- 完全重复段落被移除（保留首次出现）
- 高相似（>0.85）段落被移除
- 不同内容段落全部保留且保序
- threshold 参数生效
- 空输入 / 单段落边界情况
"""

import sys
from pathlib import Path

GATEWAY_ROOT = str(Path(__file__).resolve().parent.parent)
if GATEWAY_ROOT not in sys.path:
    sys.path.insert(0, GATEWAY_ROOT)

from utils.text_dedup import dedup_paragraphs, _jaccard, _tokenize


class TestJaccard:
    """词集 Jaccard 相似度"""

    def test_identical_sets(self):
        """完全相同的词集相似度为 1.0"""
        a = _tokenize("二叉树的前序遍历是根左右")
        assert _jaccard(a, a) == 1.0

    def test_disjoint_sets(self):
        """完全不同的词集相似度为 0.0"""
        a = _tokenize("二叉树遍历")
        b = _tokenize("动态规划")
        assert _jaccard(a, b) == 0.0

    def test_empty_set_returns_zero(self):
        """空词集视为不相似"""
        a = _tokenize("知识点")
        assert _jaccard(a, frozenset()) == 0.0
        assert _jaccard(frozenset(), frozenset()) == 0.0


class TestDedupParagraphs:
    """dedup_paragraphs 段落级去重"""

    def test_exact_duplicate_removed(self):
        """完全重复的段落只保留第一次出现"""
        para = "## 二叉树遍历\n\n- 前序遍历：根 → 左 → 右\n- 中序遍历：左 → 根 → 右"
        text = f"{para}\n\n{para}"
        result = dedup_paragraphs(text)
        assert result.count("前序遍历") == 1

    def test_near_duplicate_removed(self):
        """高相似段落（仅个别字不同）被移除"""
        text = (
            "本节课讲解了二叉树的前序、中序、后序三种遍历方式及其递归实现方法。\n\n"
            "本节课讲解了二叉树的前序、中序、后序三种遍历方式及其递归实现方式。"
        )
        result = dedup_paragraphs(text)
        paragraphs = [p for p in result.split("\n\n") if p.strip()]
        assert len(paragraphs) == 1

    def test_distinct_paragraphs_kept_in_order(self):
        """不同内容的段落全部保留且顺序不变"""
        text = "## 知识点一：栈\n\n## 知识点二：队列\n\n## 知识点三：动态规划详解"
        result = dedup_paragraphs(text)
        assert "栈" in result
        assert "队列" in result
        assert "动态规划" in result
        assert result.index("栈") < result.index("队列") < result.index("动态规划")

    def test_threshold_parameter(self):
        """降低阈值后中等相似段落也会被移除"""
        text = (
            "梯度下降通过迭代更新参数使损失函数最小化，学习率控制每次更新的步长大小。\n\n"
            "梯度下降通过迭代更新参数使损失函数逐步减小，学习率决定每次更新的幅度。"
        )
        # 默认阈值 0.85 下两段视为不同（保留两段）
        assert len(dedup_paragraphs(text).split("\n\n")) == 2
        # 阈值降到 0.5 时视为重复（只保留一段）
        assert len(dedup_paragraphs(text, threshold=0.5).split("\n\n")) == 1

    def test_empty_input_returned_as_is(self):
        """空输入原样返回，不抛异常"""
        assert dedup_paragraphs("") == ""
        assert dedup_paragraphs("   ") == "   "

    def test_single_paragraph_unchanged(self):
        """单段落内容不变"""
        text = "## 唯一的知识点\n- 要点一\n- 要点二"
        assert dedup_paragraphs(text) == text

    def test_short_headings_not_falsely_deduped(self):
        """内容不同的短标题不会被误判为重复"""
        text = "## 片段 1\n\n## 片段 2\n\n## 片段 3"
        result = dedup_paragraphs(text)
        assert "片段 1" in result
        assert "片段 2" in result
        assert "片段 3" in result
