"""
课伴 AI 网关 — 配置模块

国产模型路由配置，支持通过环境变量覆盖。
Provider: 通义千问(Qwen) / 深度求索(DeepSeek) / 智谱(GLM)
"""

import asyncio
import contextvars
import logging
import os
from typing import Any, Callable, Awaitable, AsyncGenerator

from pathlib import Path

from dotenv import load_dotenv

_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path)

logger = logging.getLogger(__name__)

# 用于在 fallback 链路中透传当前 feature 名称的上下文变量
# 使得 with_retry_and_timeout 装饰器无需改动所有 router/chain 签名即可按功能超时
_FEATURE_CONTEXT: contextvars.ContextVar[str] = contextvars.ContextVar("_feature", default="")

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
            "asr": "paraformer-v2",          # 语音转文字（Paraformer）
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
            "asr": "glm-4-audio",            # 语音转文字
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
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": ("qwen", "socratic"),
    "socratic_evaluate":   ("qwen", "socratic"),
    "socratic_deepening":  ("qwen", "socratic"),
    # Path B: 多模态课堂分析（多图联合 → Markdown 笔记）
    "multimodal_analyze": ("qwen", "vision"),
    # Path C: 视频分析（Gemini 原生视频 → Markdown 笔记）
    "video_analyze": ("gemini", "video"),
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


def get_provider_for_request(app, feature: str, request) -> tuple:
    """
    根据请求中的用户 API Key 动态选择 Provider。

    - 有用户 Key → 根据 MODEL_ROUTING 找到对应 provider_key，临时创建 Provider 实例
    - 无用户 Key → 走现有 get_provider_for_feature 返回服务端默认 Provider

    **不缓存用户 Key 创建的临时 Provider**，每次请求新建。

    Args:
        app: FastAPI 应用实例
        feature: 功能标识，对应 MODEL_ROUTING 的 key
        request: FastAPI Request 对象（通过 request.state.user_api_key 获取用户 Key）

    Returns:
        tuple: (provider, model_name, is_user_key)
            - provider: Provider 实例
            - model_name: 模型名称
            - is_user_key: 是否使用了用户自带 Key
    """
    user_api_key = getattr(request.state, "user_api_key", None)

    if not user_api_key:
        # 无用户 Key，走服务端默认 Provider
        provider, model_name = get_provider_for_feature(app, feature)
        return provider, model_name, False

    # 有用户 Key，根据 MODEL_ROUTING 找到对应 provider_key
    provider_key, model_slot = MODEL_ROUTING.get(feature, ("fallback", "free"))

    # 查找 Provider 配置（base_url）
    provider_cfg = AI_PROVIDERS.get(provider_key, {})
    base_url = provider_cfg.get("base_url", "")

    if not base_url:
        logger.warning(
            "用户 Key 路由失败: feature=%s, provider_key=%s 无 base_url 配置，回退服务端默认",
            feature, provider_key,
        )
        provider, model_name = get_provider_for_feature(app, feature)
        return provider, model_name, False

    # 动态实例化 Provider（使用用户 Key）
    provider_classes = _get_provider_classes()
    provider_cls = provider_classes.get(provider_key)
    if not provider_cls:
        logger.warning(
            "用户 Key 路由失败: feature=%s, provider_key=%s 无对应 Provider 类，回退服务端默认",
            feature, provider_key,
        )
        provider, model_name = get_provider_for_feature(app, feature)
        return provider, model_name, False

    try:
        user_provider = provider_cls(base_url=base_url, api_key=user_api_key)
    except Exception as e:
        logger.warning(
            "用户 Key 实例化 Provider 失败: feature=%s, provider_key=%s, error=%s，回退服务端默认",
            feature, provider_key, str(e),
        )
        provider, model_name = get_provider_for_feature(app, feature)
        return provider, model_name, False

    model_name = provider_cfg.get("models", {}).get(model_slot, "fallback")
    logger.info(
        "用户 Key 路由: feature=%s, provider_key=%s, model=%s（使用用户自带 Key）",
        feature, provider_key, model_name,
    )
    return user_provider, model_name, True


# ============================================================
# Provider Fallback 链：主 Provider 失败时依次尝试的备选
# ============================================================

PROVIDER_FALLBACK_CHAIN: dict[str, list[str]] = {
    "summarize":      ["glm", "qwen", "fallback"],        # GLM（免费）优先，Qwen 备选
    "generate_cards": ["glm", "qwen", "fallback"],        # GLM（免费）优先，Qwen 备选
    "evaluate":       ["glm", "deepseek", "fallback"],    # GLM（免费）优先，DeepSeek 备选
    "recommend":      ["glm", "deepseek", "fallback"],    # GLM（免费）优先，DeepSeek 备选
    "vision_extract": ["qwen", "glm"],                   # Qwen-VL-Max（百炼）优先，GLM-4V 备选
    "transcribe":     ["qwen", "glm", "fallback"],       # Qwen Paraformer 优先，GLM 备选
    "tag_content":    ["glm", "deepseek", "fallback"],    # GLM（免费）优先，DeepSeek 备选
    "optimize_card":  ["glm", "qwen", "fallback"],       # GLM（免费）优先，Qwen 备选
    "feynman_question": ["deepseek", "glm", "fallback"], # DeepSeek 为主，GLM 备选
    "feynman_evaluate": ["deepseek", "glm", "fallback"], # DeepSeek 为主，GLM 备选
    "sort_inspiration": ["glm", "deepseek", "fallback"], # GLM（免费）优先，DeepSeek 备选
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point":       ["qwen", "glm", "fallback"],   # Qwen 为主，GLM 备选
    "socratic":           ["qwen", "deepseek", "fallback"], # Qwen 为主，DeepSeek 备选
    "predict":            ["qwen", "glm", "fallback"],   # Qwen 为主，GLM 备选
    "rescue":             ["qwen", "deepseek", "fallback"], # Qwen 为主，DeepSeek 备选
    "inspiration_draft":  ["qwen", "glm", "fallback"],   # Qwen 为主，GLM 备选
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": ["qwen", "deepseek", "fallback"],
    "socratic_evaluate":   ["qwen", "deepseek", "fallback"],
    "socratic_deepening":  ["qwen", "deepseek", "fallback"],
    # Path B: 多模态课堂分析（Qwen-VL 优先，GLM-4V 备选）
    "multimodal_analyze": ["qwen", "glm"],
    # Path C: 视频分析（Gemini 原生视频优先，Qwen-VL 抽帧降级）
    "video_analyze": ["gemini", "qwen"],
}


def _resolve_model_name(provider_key: str, feature: str) -> str:
    """
    根据当前 Provider 和功能选择最合理的模型名。

    优先使用 MODEL_ROUTING 中为该功能指定的 slot；当 fallback 到其它 Provider 时，
    先尝试功能对应的 slot，再回退到通用 slot（free/vision/asr），最后使用 Provider 的第一个模型。
    """
    provider_cfg = AI_PROVIDERS.get(provider_key, {})
    models = provider_cfg.get("models", {})
    routing = MODEL_ROUTING.get(feature)

    # 1. 当前 Provider 是主路由 Provider 时，使用主 slot
    if routing and routing[0] == provider_key and routing[1] in models:
        return models[routing[1]]

    # 2. 功能到通用 slot 的映射
    feature_slot = routing[1] if routing else None
    if feature_slot and feature_slot in models:
        return models[feature_slot]

    # 3. 通用兜底 slot
    for slot in ("free", "vision", "asr"):
        if slot in models:
            return models[slot]

    # 4. 最后使用 Provider 声明的第一个模型
    if models:
        return next(iter(models.values()))
    return "fallback"


async def call_with_fallback(
    app,
    feature: str,
    fn: Callable[..., Awaitable[dict[str, Any]]],
) -> tuple[dict[str, Any], str]:
    """
    使用 Provider fallback 链执行 AI 调用。

    依次尝试 PROVIDER_FALLBACK_CHAIN 中为该 feature 配置的 Provider 列表，
    每个 Provider 最多重试 2 次（由 @with_retry_and_timeout 装饰器控制）。
    所有 Provider 均失败时抛出 RuntimeError(503)。

    Args:
        app:     FastAPI 应用实例（通过 app.state.providers 获取 Provider）
        feature: 功能标识，对应 PROVIDER_FALLBACK_CHAIN 的 key
        fn:      异步可调用对象，签名为 async fn(provider, model_name) -> dict

    Returns:
        tuple: (result_dict, provider_key)

    Raises:
        RuntimeError: 所有 Provider 均不可用（status_code=503）
    """
    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
    budget = TIMEOUT_CONFIG.get(feature, 30) * 1.5

    async def _run_fallback_chain():
        start_time = asyncio.get_event_loop().time()
        for provider_key in chain:
            provider = app.state.providers.get(provider_key)
            if not provider:
                logger.warning("Provider [%s] 未初始化，跳过", provider_key)
                continue

            model_name = _resolve_model_name(provider_key, feature)

            # 计算剩余超时预算
            elapsed = asyncio.get_event_loop().time() - start_time
            remaining = budget - elapsed
            logger.debug(
                "Provider [%s] 开始调用: feature=%s, 已用=%.1fs, 剩余预算=%.1fs",
                provider_key, feature, elapsed, remaining,
            )

            try:
                _FEATURE_CONTEXT.set(feature)
                result = await fn(provider, model_name)
                return result, provider_key
            except Exception as e:
                logger.warning(
                    "Provider [%s] failed for feature=%s: %s, trying next...",
                    provider_key, feature, str(e),
                )
            finally:
                _FEATURE_CONTEXT.set("")

        # 所有 Provider 都失败
        raise RuntimeError("所有 AI 服务暂时不可用")

    try:
        return await asyncio.wait_for(_run_fallback_chain(), timeout=budget)
    except asyncio.TimeoutError:
        logger.error(
            "AI 服务超时（预算 %.1fs 已耗尽）: feature=%s", budget, feature,
        )
        raise RuntimeError(f"AI 服务超时（预算 {budget}s 已耗尽）")


async def call_with_fallback_for_request(
    app,
    feature: str,
    request,
    fn: Callable[..., Awaitable[dict[str, Any]]],
) -> tuple[dict[str, Any], str, bool]:
    """
    支持用户 Key 的 fallback 链执行。

    如果请求中携带用户 API Key，优先使用用户 Key 创建的 Provider 执行。
    用户 Key 失败时降级到服务端 fallback 链（GLM → fallback）。
    无用户 Key 时直接走 call_with_fallback。

    Args:
        app:     FastAPI 应用实例
        feature: 功能标识
        request: FastAPI Request 对象
        fn:      异步可调用对象，签名为 async fn(provider, model_name) -> dict

    Returns:
        tuple: (result_dict, provider_key, is_user_key)

    Raises:
        RuntimeError: 所有 Provider 均不可用
    """
    user_api_key = getattr(request.state, "user_api_key", None)

    if not user_api_key:
        # 无用户 Key，直接走服务端 fallback 链
        result, provider_key = await call_with_fallback(app, feature, fn)
        return result, provider_key, False

    # 有用户 Key，先尝试用用户 Key 的 Provider
    provider, model_name, is_user_key = get_provider_for_request(app, feature, request)

    if is_user_key:
        try:
            _FEATURE_CONTEXT.set(feature)
            result = await fn(provider, model_name)
            # 从 MODEL_ROUTING 获取 provider_key 用于日志
            provider_key = MODEL_ROUTING.get(feature, ("unknown", ""))[0]
            logger.info(
                "用户 Key 调用成功: feature=%s, provider=%s",
                feature, provider_key,
            )
            return result, provider_key, True
        except Exception as e:
            logger.warning(
                "用户 Key 调用失败，降级到服务端 fallback: feature=%s, error=%s",
                feature, str(e),
            )
        finally:
            _FEATURE_CONTEXT.set("")

    # 用户 Key 失败，降级到服务端 fallback 链
    result, provider_key = await call_with_fallback(app, feature, fn)
    return result, provider_key, False


async def call_with_fallback_stream(
    app,
    feature: str,
    request,
    fn: Callable[..., AsyncGenerator[str, None]],
) -> tuple[AsyncGenerator[str, None], str, bool]:
    """
    流式版本的 call_with_fallback_for_request。

    与 call_with_fallback_for_request 相同的 fallback 链逻辑，
    但 fn 返回 AsyncGenerator[str, None] 而非 dict。

    Args:
        app:     FastAPI 应用实例
        feature: 功能标识
        request: FastAPI Request 对象
        fn:      异步生成器函数，签名为 async fn(provider, model_name) -> AsyncGenerator[str, None]

    Returns:
        tuple: (generator, provider_key, is_user_key)
    """
    user_api_key = getattr(request.state, "user_api_key", None)

    if not user_api_key:
        # 无用户 Key，走服务端 fallback 链
        chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
        budget = TIMEOUT_CONFIG.get(feature, 30) * 1.5

        for provider_key in chain:
            provider = app.state.providers.get(provider_key)
            if not provider:
                continue
            model_name = _resolve_model_name(provider_key, feature)
            try:
                _FEATURE_CONTEXT.set(feature)
                gen = fn(provider, model_name)
                return gen, provider_key, False
            except Exception as e:
                logger.warning(
                    "Provider [%s] stream failed for feature=%s: %s, trying next...",
                    provider_key, feature, str(e),
                )
            finally:
                _FEATURE_CONTEXT.set("")

        raise RuntimeError("所有 AI 服务暂时不可用")

    # 有用户 Key，先尝试用户 Key 的 Provider
    provider, model_name, is_user_key = get_provider_for_request(app, feature, request)
    if is_user_key:
        try:
            _FEATURE_CONTEXT.set(feature)
            gen = fn(provider, model_name)
            provider_key = MODEL_ROUTING.get(feature, ("unknown", ""))[0]
            return gen, provider_key, True
        except Exception as e:
            logger.warning(
                "用户 Key 流式调用失败，降级到服务端 fallback: feature=%s, error=%s",
                feature, str(e),
            )
        finally:
            _FEATURE_CONTEXT.set("")

    # 降级到服务端 fallback 链
    chain = PROVIDER_FALLBACK_CHAIN.get(feature, ["fallback"])
    for provider_key in chain:
        provider = app.state.providers.get(provider_key)
        if not provider:
            continue
        model_name = _resolve_model_name(provider_key, feature)
        try:
            _FEATURE_CONTEXT.set(feature)
            gen = fn(provider, model_name)
            return gen, provider_key, False
        except Exception as e:
            logger.warning(
                "Provider [%s] stream failed for feature=%s: %s, trying next...",
                provider_key, feature, str(e),
            )
        finally:
            _FEATURE_CONTEXT.set("")

    raise RuntimeError("所有 AI 服务暂时不可用")


# ============================================================
# 超时配置（单位：秒）
# ============================================================

TIMEOUT_CONFIG: dict[str, int] = {
    "summarize": 30,          # 笔记摘要，模型响应可能较慢
    "generate_cards": 30,
    "evaluate": 20,
    "recommend": 10,
    "vision_extract": 20,
    "transcribe": 30,
    "tag_content": 10,
    "optimize_card": 15,
    "feynman_question": 15,
    "feynman_evaluate": 15,
    "sort_inspiration": 15,
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point": 15,
    "socratic": 30,           # 多轮对话，需要更长时间
    "predict": 15,
    "rescue": 30,             # 三级救援内容较多
    "inspiration_draft": 15,
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": 20,
    "socratic_evaluate": 15,
    "socratic_deepening": 15,
    # Path B: 多模态课堂分析（多图 + 长文本生成，需要宽裕超时）
    "multimodal_analyze": 120,
    # Path C: 视频分析（视频处理 + 长文本生成，需要更长超时）
    "video_analyze": 300,
}

# ============================================================
# 频率限制（每日上限）
# ============================================================

RATE_LIMITS: dict[str, int] = {
    "daily_total": 50,
    "summarize": 15,
    "generate_cards": 10,
    "evaluate": 10,
    "recommend": 15,
    "vision_extract": 20,
    "transcribe": 30,
    "tag_content": 30,
    "optimize_card": 15,
    "feynman_question": 15,
    "feynman_evaluate": 15,
    "sort_inspiration": 20,
    # v1.0.0/v1.1.0 新增 Chain
    "anchor_point": 15,
    "socratic": 20,           # 多轮对话，频率稍高
    "predict": 15,
    "rescue": 10,             # 救援场景，适度限制
    "inspiration_draft": 15,
    # FEAT-022: 苏格拉底式学习
    "socratic_brainstorm": 15,
    "socratic_evaluate": 20,
    "socratic_deepening": 15,
    # Path B: 多模态课堂分析（单次分析成本较高，适度限制）
    "multimodal_analyze": 5,
    # Path C: 视频分析（单次成本最高，严格限制）
    "video_analyze": 3,
}

# ============================================================
# 应用配置
# ============================================================

PLACEHOLDER_PREFIXES = ("sk-your-", "your-", "change-this", "placeholder")


def is_valid_api_key(key: str) -> bool:
    """检查 API Key 是否为有效配置（非占位符）"""
    return bool(key) and not any(key.startswith(p) for p in PLACEHOLDER_PREFIXES)


# Supabase 项目地址，提前读取以推导 JWKS 端点等配置
_supabase_url = os.getenv("SUPABASE_URL", "")

APP_CONFIG = {
    "app_env": os.getenv("APP_ENV", "development"),
    "title": "课伴 AI 网关",
    "version": "0.1.0-alpha",
    "description": "课伴(KeBan) AI 增强服务网关 — MVP-2 Alpha",
    "cors_origins": [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    ],
    "jwt_secret": os.getenv("SUPABASE_JWT_SECRET", ""),
    "jwt_algorithm": "ES256",
    "supabase_url": _supabase_url,
    "supabase_jwks_url": os.getenv(
        "SUPABASE_JWKS_URL",
        # 从 SUPABASE_URL 推导 JWKS 端点（Supabase 标准路径需含 /auth/v1 前缀）
        f"{_supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json" if _supabase_url else "",
    ),
    "redis_url": os.getenv("REDIS_URL", "redis://localhost:6379/0"),
}
