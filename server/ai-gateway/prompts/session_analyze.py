"""
熵减 AI 网关 — 课堂多模态分析 Prompt 模板

@ai-context Path B 多模态分析链路：客户端捕获关键帧 + 语音转写 →
服务端多模态模型联合分析 → 生成结构化 Markdown 笔记。

Prompt 设计要求模型：
1. 按时间顺序组织内容
2. 提取板书/PPT 上的公式、定义（LaTeX 格式）
3. 结合语音转写补充重点
4. 输出 Markdown 结构化笔记
5. 末尾生成 3-5 个核心知识点摘要
"""

# 系统角色提示词：设定模型为课堂笔记助手
SESSION_ANALYZE_SYSTEM_PROMPT = (
    "你是一个专业的课堂笔记助手，擅长从课堂截屏和语音信息中提取结构化学习笔记。\n"
    "你的输出必须使用 Markdown 格式，语言清晰、逻辑严密。\n"
    "对于数学公式，使用 LaTeX 格式（行内用 $...$，独立公式用 $$...$$）。\n"
    "对于代码，保留语言标注的代码块。\n"
    "始终以中文输出，除非用户明确要求其他语言。\n"
    "仅基于提供的截屏和语音内容生成笔记，不确定的内容用 [?] 标记。\n"
    "如果用户标记了重点时间点（bookmark），请在对应内容前加上 \u2b50 标记并展开详述。"
)

# 用户消息模板：{keyframes_desc} {audio_context} {duration_desc} 由运行时填充
SESSION_ANALYZE_USER_TEMPLATE = (
    "以下是一门课程的 {keyframes_count} 张关键帧截图，"
    "课程总时长约 {duration_desc}。\n\n"
    "{keyframes_desc}\n\n"
    "{audio_context}"
    "请根据以上截屏内容和语音信息，生成一份结构化的课堂笔记，要求：\n\n"
    "1. **按时间顺序**组织内容，标注每个知识点大致出现的时间段\n"
    "2. **提取板书/PPT** 上的所有公式（LaTeX 格式）、定义、关键术语\n"
    "3. **结合语音内容**补充截屏中未完整展示的推导过程和重点解释\n"
    "4. 使用 Markdown 二级标题（##）分隔不同知识模块\n"
    "5. 在笔记末尾添加 **「核心知识点摘要」** 部分，列出 3-5 个最重要的知识点\n"
    "6. 在讲解与某一帧强相关的知识点处，单独一行插入标记 [图:N]"
    "（N 为帧编号，从 1 开始）；仅在确有对应帧时插入\n\n"
    "请直接输出 Markdown 笔记内容，不要添加额外说明。"
)


def build_session_prompt(
    keyframes_count: int,
    audio_segments_count: int,
    duration_seconds: int,
    language: str = "zh-CN",
    course_meta: dict | None = None,
) -> str:
    """
    组装完整的多模态分析用户提示词

    @ai-context 关键帧数量和语音时长直接影响 Prompt 复杂度，
    此处仅生成文本框架，图片由 Chain 层通过多图消息格式附加。

    Args:
        keyframes_count:    关键帧数量
        audio_segments_count: 语音片段数量（用于描述补充信息量）
        duration_seconds:   课程总时长（秒）
        language:           输出语言（zh-CN / en-US）
        course_meta:        课程元数据（可选，含 course_name/subject/custom_terms）

    Returns:
        填充后的用户提示词字符串
    """
    # 时长格式化：秒 → "X 分 Y 秒" 或 "X 小时 Y 分"
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

    # 语音上下文：有转写内容时提示模型结合语音，无则说明仅有截屏
    if audio_segments_count > 0:
        audio_context = (
            f"同时提供了 {audio_segments_count} 段语音转写文字作为补充信息，"
            "请在笔记中融合语音内容所强调的重点。\n\n"
        )
    else:
        audio_context = "本次分析仅有截屏内容，无语音转写补充。\n\n"

    return SESSION_ANALYZE_USER_TEMPLATE.format(
        keyframes_count=keyframes_count,
        duration_desc=duration_desc,
        keyframes_desc=f"截屏按时间顺序排列，共 {keyframes_count} 帧，每帧标注了出现时间",
        audio_context=audio_context,
    )


def build_course_context(course_meta: dict | None) -> str:
    """
    构建课程上下文注入字符串，追加到 System Prompt 末尾

    Args:
        course_meta: 课程元数据 dict（course_name/subject/custom_terms）

    Returns:
        课程上下文字符串，无元数据时返回空字符串
    """
    if not course_meta:
        return ""

    parts: list[str] = ["\n\n## 课程信息"]
    if course_meta.get("course_name"):
        parts.append(f"- 课程：{course_meta['course_name']}")
    if course_meta.get("subject"):
        parts.append(f"- 学科：{course_meta['subject']}")
    terms = course_meta.get("custom_terms") or course_meta.get("suggested_terms")
    if terms:
        parts.append(f"- 关键术语：{', '.join(terms)}")
    parts.append("请特别注意上述术语的准确使用。")
    return "\n".join(parts)


# ============================================================
# 增量片段分析 Prompt（边采边析，每批约 5 帧）
# Partial (incremental) analysis prompts — per small keyframe batch
# ============================================================

# @ai-context 增量分析每批片段各自生成"课程概述+讲师+摘要"会导致合并后大量重复，
# 片段模板严格限定只输出该片段的知识点内容，全局信息由 merge-notes 阶段统一生成。
PARTIAL_ANALYZE_SYSTEM_PROMPT = (
    "你是一个专业的课堂笔记助手，正在对一门课程录制过程中的一个片段进行增量分析。\n"
    "你的输出必须使用 Markdown 格式，语言清晰、逻辑严密。\n"
    "对于数学公式，使用 LaTeX 格式（行内用 $...$，独立公式用 $$...$$）。\n"
    "对于代码，保留语言标注的代码块。\n"
    "始终以中文输出，除非用户明确要求其他语言。\n"
    "仅基于提供的截屏内容生成笔记，不确定的内容用 [?] 标记。\n"
    "严禁输出任何全局性信息：课程概述、课程名称、讲师介绍、课程总时长、"
    "核心知识点摘要、总结等一律不要生成，这些将在课后合并阶段统一处理。"
)

PARTIAL_ANALYZE_USER_TEMPLATE = (
    "以下是这门课程其中一个片段的 {keyframes_count} 张关键帧截图（非完整课程）。\n\n"
    "{keyframes_desc}\n\n"
    "请仅针对该片段生成知识点笔记，要求：\n\n"
    "1. 使用 Markdown 二级标题（##）按知识点分块，标题即知识点名称\n"
    "2. 每个知识点下用要点列表描述内容，提取板书/PPT 上的公式（LaTeX）、定义、关键术语\n"
    "3. 知识点标题后标注出现时间，格式统一为 MM:SS（如 ## 二叉树遍历（03:25））\n"
    "4. **禁止**输出课程概述、课程名称、讲师、总时长、核心知识点摘要等全局信息\n"
    "5. 不确定的内容用 [?] 标记\n"
    "6. 在讲解与某一帧强相关的知识点处，单独一行插入标记 [图:N]"
    "（N 为帧编号，从 1 开始）；仅在确有对应帧时插入\n\n"
    "请直接输出该片段的 Markdown 笔记内容，不要添加额外说明。"
)


def build_partial_prompt(keyframes_count: int) -> str:
    """
    组装增量片段分析的用户提示词

    @ai-context 片段模式不注入课程时长与语音上下文（片段批次无音频），
    时间标注由 Chain 层追加到 Prompt 末尾。

    Args:
        keyframes_count: 本批关键帧数量

    Returns:
        填充后的片段分析提示词字符串
    """
    return PARTIAL_ANALYZE_USER_TEMPLATE.format(
        keyframes_count=keyframes_count,
        keyframes_desc=f"截屏按时间顺序排列，共 {keyframes_count} 帧，每帧标注了课程内出现时间",
    )


# ============================================================
# 片段笔记合并 Prompt（增量分析课后整理用）
# ============================================================

MERGE_NOTES_SYSTEM_PROMPT = (
    "你是一个专业的课堂笔记整理助手。\n"
    "你将收到多个课堂片段笔记（按时间顺序排列），需要将它们合并为一份完整、连贯的结构化笔记。\n"
    "输出必须使用 Markdown 格式，数学公式用 LaTeX，代码保留语言标注。\n"
    "始终以中文输出，除非用户明确要求其他语言。"
)

MERGE_NOTES_USER_TEMPLATE = (
    "以下是一门课程（总时长约 {duration_desc}）的 {partials_count} 个片段笔记，"
    "它们是在课堂进行中按时间顺序增量生成的。\n\n"
    "请将它们合并为一份完整的结构化课堂笔记，要求：\n\n"
    "1. **只保留一个课程概述**：若多个片段各自含有课程概述/课程名称/讲师等全局信息，"
    "合并为开头唯一的一段概述，其余全部删除\n"
    "2. **严禁重复知识点**：相邻片段的重叠内容必须去重，同一知识点只保留一处最完整的表述\n"
    "3. **统一结构**：使用 Markdown 二级标题（##）按知识模块重新组织，标题层级保持一致\n"
    "4. **统一时间标注**：所有时间标注统一为 MM:SS 格式\n"
    "5. **保留细节**：不要丢失任何公式、定义、代码或关键术语\n"
    "6. **唯一末尾摘要**：只在笔记最后输出一个「核心知识点摘要」部分（3-5 个知识点），"
    "删除片段中间出现的任何摘要/总结\n"
    "7. **保留图片标记**：保留原有 [图:N] 标记，不要删除或改写\n\n"
    "---\n\n{partials_content}\n\n---\n\n"
    "请直接输出合并后的 Markdown 笔记，不要添加额外说明。"
)


def build_merge_prompt(
    partials: list[str],
    duration_seconds: int,
) -> str:
    """
    组装片段笔记合并的用户提示词

    Args:
        partials:          片段笔记列表（按时间顺序）
        duration_seconds:  课程总时长（秒）

    Returns:
        填充后的合并提示词字符串
    """
    if duration_seconds >= 3600:
        hours = duration_seconds // 3600
        mins = (duration_seconds % 3600) // 60
        duration_desc = f"{hours} 小时 {mins} 分钟"
    elif duration_seconds >= 60:
        mins = duration_seconds // 60
        duration_desc = f"{mins} 分钟"
    else:
        duration_desc = f"{duration_seconds} 秒"

    # 将各片段用分隔符拼接
    parts: list[str] = []
    for idx, partial in enumerate(partials):
        parts.append(f"### 片段 {idx + 1}\n\n{partial.strip()}")
    partials_content = "\n\n---\n\n".join(parts)

    return MERGE_NOTES_USER_TEMPLATE.format(
        duration_desc=duration_desc,
        partials_count=len(partials),
        partials_content=partials_content,
    )
