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
# Tier 分级模型路由
# ============================================================
# 按用户 tier 限制可路由的模型 Provider。
# 与客户端 types/beta.ts 中的 TIER_PERKS 保持同步。

TIER_MODEL_ACCESS: dict[str, set[str]] = {
    "free":     {"glm"},
    "observer": {"glm", "qwen"},
    "active":   {"glm", "qwen", "deepseek"},
    "core":     {"glm", "qwen", "deepseek", "gemini"},
    "pro":      {"glm", "qwen", "deepseek"},
    "lifetime": {"glm", "qwen", "deepseek", "gemini"},
}

# Tier 优先级
_TIER_RANK = {"free": 0, "observer": 1, "active": 2, "pro": 3, "core": 4, "lifetime": 5}


def get_effective_tier(beta_tier: str | None = None, paid_tier: str | None = None) -> str:
    """取 beta 身份与付费身份中的最高者"""
    beta = _TIER_RANK.get(beta_tier or "free", 0)
    paid = _TIER_RANK.get(paid_tier or "free", 0)
    effective = max(beta, paid)
    return {v: k for k, v in _TIER_RANK.items()}.get(effective, "free")

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
            "vision": "qwen3-vl-flash",            # 多模态视觉提取（低开销主力，百炼标准标识符）
            "vision_high": "qwen2.5-vl-72b-instruct",  # 多模态视觉质量兜底（质量保证，备用）
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
            "free": "deepseek-chat",         # 通用兜底模型（v4 Flash 0731）
            "evaluate": "deepseek-chat",     # 费曼评估
            "recommend": "deepseek-chat",    # 番茄钟推荐
            "summary": "deepseek-chat",      # 笔记摘要
            "flashcard": "deepseek-chat",    # 闪卡生成
            "anchor": "deepseek-chat",       # 记忆锚点
            "socratic": "deepseek-chat",     # 苏格拉底追问
            "predict": "deepseek-chat",      # 预测驱动
            "rescue": "deepseek-chat",       # 三级救援
            "inspiration_draft": "deepseek-chat", # AI 草稿
            "tag": "deepseek-chat",          # 标签
            "optimize": "deepseek-chat",     # 优化卡片
            "sort": "deepseek-chat",         # 灵感排序
            "ritual": "deepseek-chat",       # 仪式回顾
            "progress": "deepseek-chat",     # 进展叙述
            "chat": "deepseek-chat",         # 学伴对话
            "error": "deepseek-chat",        # 错误模式
            "quiz": "deepseek-chat",         # 迷你测试
            "tier": "deepseek-chat",         # 内容分层
            "conflict": "deepseek-chat",     # 冲突检测
            "precheck": "deepseek-chat",     # 概念预检
            "import_concept": "deepseek-chat",# 知识入籍
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
    # ============================================================
    # 纯文字 AI 功能 → 统一 DeepSeek v4 Flash 0731（deepseek-chat）
    # 利用 DeepSeek 的 prompt 缓存机制降低 token 成本。
    # 多模态/ASR 功能保持原路由不变。
    # ============================================================
    "summarize": ("deepseek", "summary"),
    "generate_cards": ("deepseek", "flashcard"),
    "evaluate": ("deepseek", "evaluate"),
    "recommend": ("deepseek", "recommend"),
    "tag_content": ("deepseek", "tag"),
    "optimize_card": ("deepseek", "optimize"),
    "feynman_question": ("deepseek", "evaluate"),
    "feynman_evaluate": ("deepseek", "evaluate"),
    "sort_inspiration": ("deepseek", "sort"),
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point": ("deepseek", "anchor"),
    "socratic": ("deepseek", "socratic"),
    "predict": ("deepseek", "predict"),
    "rescue": ("deepseek", "rescue"),
    "inspiration_draft": ("deepseek", "inspiration_draft"),
    "ritual_recall": ("deepseek", "ritual"),
    "progress_narrative": ("deepseek", "progress"),
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": ("deepseek", "socratic"),
    "socratic_evaluate":   ("deepseek", "socratic"),
    "socratic_deepening":  ("deepseek", "socratic"),
    # 学伴对话（流式 SSE 多轮交互）
    "chat": ("deepseek", "chat"),
    # F4: 黄金错误模式分析（JSON Mode）
    "error_pattern": ("deepseek", "error"),
    # N1: 课程级迷你测试生成（JSON Mode）
    "quiz_gen": ("deepseek", "quiz"),
    # N5: 内容分层（JSON Mode）
    "content_tier": ("deepseek", "tier"),
    # N6: 概念冲突检测（JSON Mode）
    "conflict_detect": ("deepseek", "conflict"),
    # E1: 概念预检（JSON Mode）
    "concept_precheck": ("deepseek", "precheck"),
    # 阶段 A: 知识入籍概念化（JSON Mode）
    "import_concept": ("deepseek", "import_concept"),
    # ============================================================
    # 多模态 / ASR / 视频 — 保持原路由不变
    # ============================================================
    "vision_extract": ("qwen", "vision"),
    "transcribe": ("qwen", "asr"),
    "multimodal_analyze": ("qwen", "vision"),
    "video_analyze": ("gemini", "video"),
}

# ============================================================
# 模型路由辅助函数
# ============================================================


def get_provider_for_feature(app, feature: str, user_tier: str = "free"):
    """
    根据 MODEL_ROUTING 表获取对应 Provider 实例和模型名称。

    如果目标 Provider 未初始化或 API Key 无效，自动回退到 GLM/fallback。
    按用户 tier 限制可路由的 Provider（tier 不足时降级到免费模型）。

    Args:
        app: FastAPI 应用实例（通过 app.state.providers 获取 Provider）
        feature: 功能标识，对应 MODEL_ROUTING 的 key
        user_tier: 用户有效 tier，默认 "free"

    Returns:
        tuple: (provider_instance, model_name)
    """
    provider_key, model_slot = MODEL_ROUTING.get(feature, ("fallback", "free"))

    # 检查用户 tier 是否有权访问该 Provider
    allowed_providers = TIER_MODEL_ACCESS.get(user_tier, TIER_MODEL_ACCESS["free"])
    if provider_key not in allowed_providers:
        logger.info(
            "Tier [%s] 无权访问 Provider [%s]（feature=%s），降级到免费模型",
            user_tier, provider_key, feature,
        )
        provider_key = "glm"
        model_slot = "free"

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
