"""
熵减 AI 网关 — Provider 配置与模型路由

@ai-context: 定义各国产/海外 Provider 的接入参数（base_url/api_key/模型槽位）
与 feature→(provider, slot) 路由表。get_provider_for_feature 按路由表取服务端
默认 Provider，API Key 无效或未初始化时逐级回退 GLM→fallback。
@ai-context: Provider 类采用延迟导入（_get_provider_classes）避免循环引用。
"""

import os

from config.runtime import logger, is_valid_api_key

# ============================================================
# Provider 配置
# ============================================================

# 阿里云 AK/SK（用于查询百炼平台账户余额，与 DashScope API Key 独立）
ALIYUN_ACCESS_KEY_ID: str = os.getenv("ALIYUN_ACCESS_KEY_ID", "")
ALIYUN_ACCESS_KEY_SECRET: str = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "")

AI_PROVIDERS: dict = {
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key": os.getenv("QWEN_API_KEY", ""),
        "models": {
            "free": "qwen-plus",             # 通用兜底模型
            "summary": "qwen-plus",         # 笔记摘要
            "flashcard": "qwen-plus",        # 闪卡生成（JSON Mode 稳定）
            "vision": "qwen2.5-vl-72b-instruct",  # 多模态视觉提取（课堂助手主力，百炼标准标识符）
            "asr": "qwen3-asr-flash",        # 语音转文字（OpenAI 兼容模式仅支持 Qwen3-ASR-Flash 系列）
            "anchor": "qwen-plus",           # 记忆锚点生成
            "socratic": "qwen-plus",         # 苏格拉底追问
            "predict": "qwen-plus",          # 预测驱动学习
            "rescue": "qwen-plus",           # 卡壳三级救援
            "inspiration_draft": "qwen-plus",# AI 草稿生成（v1.1.0）
        },
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "api_key": os.getenv("DEEPSEEK_API_KEY", ""),
        "models": {
            "free": "deepseek-chat",         # 通用兜底模型
            "evaluate": "deepseek-chat",     # 费曼评估
            "recommend": "deepseek-chat",    # 番茄钟推荐
        },
    },
    "glm": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "api_key": os.getenv("GLM_API_KEY", ""),
        "models": {
            "free": "glm-4.6v-flash",       # 免费，多模态（文本+视觉），128K 上下文
            "vision": "glm-4.6v-flash",     # 多模态视觉（免费），128K 上下文
            "asr": "glm-asr",                # 语音转文字（GLM-ASR，端点 audio/transcriptions）
        },
    },
    "gemini": {
        "base_url": "",  # google-genai SDK 不需要 base_url
        "api_key": os.getenv("GEMINI_API_KEY", ""),
        "models": {
            "video": "gemini-2.0-flash",     # 视频分析（原生视频输入）
            "vision": "gemini-2.0-flash",    # 多模态视觉
        },
    },
}

# ============================================================
# 模型路由：功能 -> (provider_key, model_slot)
# ============================================================

MODEL_ROUTING: dict[str, tuple[str, str]] = {
    "summarize": ("glm", "free"),
    "generate_cards": ("glm", "free"),
    "evaluate": ("glm", "free"),
    "recommend": ("glm", "free"),
    "vision_extract": ("qwen", "vision"),
    "transcribe": ("qwen", "asr"),
    "tag_content": ("glm", "free"),
    "optimize_card": ("glm", "free"),
    "feynman_question": ("deepseek", "evaluate"),
    "feynman_evaluate": ("deepseek", "evaluate"),
    "sort_inspiration": ("glm", "free"),
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point": ("qwen", "anchor"),
    "socratic": ("qwen", "socratic"),
    "predict": ("qwen", "predict"),
    "rescue": ("qwen", "rescue"),
    "inspiration_draft": ("qwen", "inspiration_draft"),
    "ritual_recall": ("glm", "free"),
    "progress_narrative": ("glm", "free"),  # A3 微进展叙述：短文本，免费档即可
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": ("qwen", "socratic"),
    "socratic_evaluate":   ("qwen", "socratic"),
    "socratic_deepening":  ("qwen", "socratic"),
    # Path B: 多模态课堂分析（多图联合 → Markdown 笔记）
    "multimodal_analyze": ("qwen", "vision"),
    # Path C: 视频分析（Gemini 原生视频 → Markdown 笔记）
    "video_analyze": ("gemini", "video"),
    # 学伴对话（流式 SSE 多轮交互，Qwen 通用模型兜底）
    "chat": ("qwen", "free"),
    # F4: 黄金错误模式分析（JSON Mode，Qwen 通用模型）
    "error_pattern": ("qwen", "free"),
    # N1: 课程级迷你测试生成（JSON Mode，Qwen 通用模型）
    "quiz_gen": ("qwen", "free"),
    # N5: 内容分层（JSON Mode，Qwen 通用模型）
    "content_tier": ("qwen", "free"),
    # N6: 概念冲突检测（JSON Mode，Qwen 通用模型）
    "conflict_detect": ("qwen", "free"),
    # E1: 概念预检（JSON Mode，Qwen 通用模型）
    "concept_precheck": ("qwen", "free"),
    # 阶段 A: 知识入籍概念化（JSON Mode，免费档优先）
    "import_concept": ("glm", "free"),
}

# ============================================================
# 模型路由辅助函数
# ============================================================


def get_provider_for_feature(app, feature: str):
    """
    根据 MODEL_ROUTING 表获取对应 Provider 实例和模型名称。

    如果目标 Provider 未初始化或 API Key 无效，自动回退到 GLM/fallback。

    Args:
        app: FastAPI 应用实例（通过 app.state.providers 获取 Provider）
        feature: 功能标识，对应 MODEL_ROUTING 的 key

    Returns:
        tuple: (provider_instance, model_name)
    """
    provider_key, model_slot = MODEL_ROUTING.get(feature, ("fallback", "free"))
    provider = app.state.providers.get(provider_key)
    # 检查 Provider 是否配置了有效 API Key
    if provider and not is_valid_api_key(provider.api_key):
        logger.warning("Provider [%s] API Key 无效，尝试回退到 GLM/fallback", provider_key)
        provider = None
    # 若 Provider 未初始化或 API Key 无效，尝试回退到 GLM
    if not provider:
        provider = app.state.providers.get("glm")
        provider_key = "glm"
        model_slot = "free"
    # GLM 也不可用时，使用 fallback
    if not provider:
        provider = app.state.providers.get("fallback")
        provider_key = "fallback"
        model_slot = "free"
    model_name = AI_PROVIDERS.get(provider_key, {}).get("models", {}).get(model_slot, "fallback")
    return provider, model_name


# ============================================================
# Provider 类映射（用于用户 Key 动态实例化）
# ============================================================

# 延迟导入 Provider 类，避免循环引用
_PROVIDER_CLASSES: dict | None = None


def _get_provider_classes() -> dict:
    """延迟加载 Provider 类映射"""
    global _PROVIDER_CLASSES
    if _PROVIDER_CLASSES is None:
        from providers.qwen_provider import QwenProvider
        from providers.deepseek_provider import DeepSeekProvider
        from providers.glm_provider import GLMProvider
        from providers.gemini_provider import GeminiProvider
        _PROVIDER_CLASSES = {
            "qwen": QwenProvider,
            "deepseek": DeepSeekProvider,
            "glm": GLMProvider,
            "gemini": GeminiProvider,
        }
    return _PROVIDER_CLASSES
