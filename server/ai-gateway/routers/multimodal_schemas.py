"""
熵减 AI 网关 — 多模态课堂分析路由的请求/响应模型

@ai-context: 从 routers/multimodal.py 拆出的纯 Pydantic 数据契约
（无副作用，可安全独立重构）。覆盖三个端点：analyze-session（关键帧+语音
联合分析）、merge-notes（增量片段合并）、analyze-video（视频分析）。
"""

from pydantic import BaseModel, Field


class KeyFrameInput(BaseModel):
    """单帧关键帧输入"""
    timestamp: float = Field(..., description="帧出现的时间戳（秒）")
    image_base64: str = Field(..., description="PNG/JPEG 图片 base64 编码（不含 data: 前缀）")
    change_type: str = Field(
        default="scene_change",
        description="画面变化类型：scene_change(场景切换) | ppt_flip(PPT翻页) | handwriting(板书手写)",
    )


class AudioSegmentInput(BaseModel):
    """单段语音片段输入"""
    timestamp_start: float = Field(..., description="语音开始时间（秒）")
    timestamp_end: float = Field(..., description="语音结束时间（秒）")
    audio_text: str | None = Field(
        default=None,
        description="语音转写文本（若客户端已完成 ASR 转写则直接传入，省去服务端二次转写）",
    )


class AnalyzeSessionRequest(BaseModel):
    """多模态课堂分析请求

    @ai-context 客户端在课程录制结束后批量上传关键帧和语音片段，
    服务端一次性生成完整的结构化笔记。
    """
    duration: float = Field(..., description="课程总时长（秒）")
    keyframes: list[KeyFrameInput] = Field(..., description="关键帧列表（按时间排序）")
    audio_segments: list[AudioSegmentInput] = Field(
        default_factory=list,
        description="语音片段列表（可选，客户端已转写的文本）",
    )
    output_format: str = Field(default="markdown", description="输出格式：markdown")
    language: str = Field(default="zh-CN", description="输出语言：zh-CN / en-US")
    course_meta: dict | None = Field(
        default=None,
        description="课程元数据（可选，含 course_name/subject/custom_terms）",
    )


class AnalyzeSessionResponse(BaseModel):
    """多模态课堂分析响应"""
    content: str = Field(..., description="Markdown 格式的课堂笔记内容")
    keyframes_analyzed: int = Field(..., description="实际分析的关键帧数量")
    model_used: str = Field(..., description="实际使用的模型名称")


class MergeNotesRequest(BaseModel):
    """片段笔记合并请求"""
    partials: list[str] = Field(..., description="片段笔记列表（按时间顺序）")
    duration: float = Field(default=0, description="课程总时长（秒）")
    language: str = Field(default="zh-CN", description="输出语言")


class MergeNotesResponse(BaseModel):
    """片段笔记合并响应"""
    content: str = Field(..., description="合并后的 Markdown 笔记")
    model_used: str = Field(..., description="实际使用的模型")


class AnalyzeVideoResponse(BaseModel):
    """视频分析响应"""
    content: str = Field(..., description="Markdown 格式的视频分析笔记")
    duration_analyzed: int = Field(..., description="分析的视频时长（秒）")
    model_used: str = Field(..., description="实际使用的模型名称")
