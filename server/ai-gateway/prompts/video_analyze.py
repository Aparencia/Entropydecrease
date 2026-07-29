"""
熵减 AI 网关 — 视频分析 Prompt 模板

@ai-context Path C 视频分析链路：客户端上传录制视频 →
服务端视频模型分析 → 生成结构化 Markdown 课堂笔记。

与 session_analyze.py（多图联合分析）的差异：
- session_analyze：多帧截图 + 语音转写文本
- video_analyze：直接输入完整视频，模型自主感知时间线
"""

# 系统角色提示词：设定模型为视频课堂笔记助手
VIDEO_ANALYZE_SYSTEM_PROMPT = (
    "你是一个专业的课堂视频分析助手，擅长从视频内容中提取结构化学习笔记。\n"
    "你的输出必须使用 Markdown 格式，语言清晰、逻辑严密。\n"
    "对于数学公式，使用 LaTeX 格式（行内用 $...$，独立公式用 $$...$$）。\n"
    "对于代码，保留语言标注的代码块。\n"
    "始终以中文输出，除非用户明确要求其他语言。\n\n"
    "分析要求：\n"
    "- 按时间线标注每个知识点的出现时段（如 [02:30–05:10]）\n"
    "- 提取板书/PPT 上的所有公式、定义、关键术语\n"
    "- 整合语音讲解中的推导过程和重点解释\n"
    "- 区分不同教学环节（讲解、板书、演示、互动）"
)


def build_video_prompt(duration_seconds: int, language: str = "zh-CN") -> str:
    """
    组装视频分析用户提示词

    @ai-context 视频时长影响 Prompt 的详细程度要求，
    长视频需要更强调时间线标注和章节划分。

    Args:
        duration_seconds: 视频总时长（秒）
        language: 输出语言（zh-CN / en-US）

    Returns:
        用户提示词字符串
    """
    if duration_seconds >= 3600:
        hours = duration_seconds // 3600
        mins = (duration_seconds % 3600) // 60
        duration_desc = f"{hours} 小时 {mins} 分钟"
    elif duration_seconds >= 60:
        mins = duration_seconds // 60
        secs = duration_seconds % 60
        duration_desc = f"{mins} 分钟 {secs} 秒" if secs else f"{mins} 分钟"
    else:
        duration_desc = f"{duration_seconds} 秒"

    return (
        f"以下是一段时长约 {duration_desc} 的课堂录制视频。\n\n"
        "请对视频内容进行全面分析，生成一份结构化的课堂笔记，要求：\n\n"
        "1. **按时间线**组织内容，用 [MM:SS] 格式标注每个知识点的出现时段\n"
        "2. **提取板书/PPT** 上的所有公式（LaTeX 格式）、定义、关键术语\n"
        "3. **整合语音讲解**中的推导过程、重点解释和补充说明\n"
        "4. 使用 Markdown 二级标题（##）分隔不同知识模块\n"
        "5. 区分教学环节类型：📖 讲解 | 📝 板书 | 🖥️ 演示 | 💬 互动\n"
        "6. 在笔记末尾添加 **「核心知识点摘要」** 部分，列出 3-5 个最重要的知识点\n\n"
        "请直接输出 Markdown 笔记内容，不要添加额外说明。"
    )
