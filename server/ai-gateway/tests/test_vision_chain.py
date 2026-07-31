"""
VisionExtractChain._parse_response 单元测试

@ai-context: 用例源自内测真实故障——模型输出被 max_tokens 截断产生残缺 JSON，
旧逻辑将原始 JSON 片段直接返回为 text 并泄漏到 UI 时间线。
"""

import pytest

from chains.vision_extract_chain import VisionExtractChain


@pytest.fixture
def chain() -> VisionExtractChain:
    # _parse_response 不触碰 provider，传 None 即可
    return VisionExtractChain(provider=None)  # type: ignore[arg-type]


class TestParseResponse:
    def test_valid_json(self, chain):
        content = '{"text": "牛顿第二定律", "formulas": ["$F=ma$"], "diagrams": [], "keyPoints": [], "codeBlocks": [], "concepts": []}'
        result = chain._parse_response(content)
        assert result["text"] == "牛顿第二定律"
        assert result["formulas"] == ["$F=ma$"]

    def test_fenced_json(self, chain):
        content = '```json\n{"text": "板书内容", "formulas": [], "diagrams": [], "keyPoints": [], "codeBlocks": [], "concepts": []}\n```'
        result = chain._parse_response(content)
        assert result["text"] == "板书内容"

    def test_truncated_json_salvages_text_field(self, chain):
        """截断残缺 JSON：抢救 text 字段值，不泄漏 JSON 语法到 UI"""
        content = '{"text": "打鼾的危害讲解", "formulas": [], "keyPoints": ["打鼾虽正常'
        result = chain._parse_response(content)
        assert result["text"] == "打鼾的危害讲解"
        assert '"keyPoints"' not in result["text"]

    def test_truncated_json_without_text_field_returns_empty(self, chain):
        """残缺 JSON 连 text 字段都不完整时返回空文本，而非泄漏原文"""
        content = '```json\n{"keyPoints": ["要点1", "要'
        result = chain._parse_response(content)
        assert result["text"] == ""

    def test_plain_text_passthrough(self, chain):
        """非 JSON 形态的纯文本输出原样保留"""
        content = "这是一段普通的板书文字描述"
        result = chain._parse_response(content)
        assert result["text"] == content

    def test_salvaged_text_unescapes(self, chain):
        """抢救的 text 字段应还原转义字符"""
        content = '{"text": "第一行\\n第二行", "formulas": ['
        result = chain._parse_response(content)
        assert result["text"] == "第一行\n第二行"
