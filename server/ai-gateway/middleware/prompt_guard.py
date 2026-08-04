"""
熵减 AI 网关 — Prompt 注入防护中间件

@ai-context: 对 AI 端点的文本输入进行注入攻击检测，拦截常见 Prompt Injection
模式（角色劫持、指令覆盖、系统提示泄露）。采用正则快速匹配 + 可选的模型辅助
二级判断。仅对 /api/v1/ai/ 路径生效，超限返回 HTTP 400。
@ai-context: 设计为轻量级第一道防线，不替代模型侧安全审核；误报率优先于漏报率
（宁可放行也不误拦正常学习请求）。
"""

import logging
import re

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

# 需要 Prompt 防护的路径前缀
GUARDED_PATHS = ("/api/v1/ai/", "/api/v1/asr/")

# ============================================================
# 注入模式（正则，不区分大小写）
# 设计原则：仅匹配高置信度注入模式，避免误拦正常学习内容
# ============================================================

INJECTION_PATTERNS: list[re.Pattern] = [
    # 指令覆盖类
    re.compile(r"ignore\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompts?|rules?)", re.I),
    re.compile(r"disregard\s+(all\s+)?(previous|above|prior|your)\s+(instructions?|prompts?|rules?)", re.I),
    re.compile(r"forget\s+(all\s+)?(previous|above|your)\s+(instructions?|context|rules?)", re.I),
    # 角色劫持类
    re.compile(r"you\s+are\s+now\s+(a|an|the)\s+", re.I),
    re.compile(r"pretend\s+(you\s+are|to\s+be)\s+", re.I),
    re.compile(r"act\s+as\s+(a|an|if)\s+", re.I),
    re.compile(r"from\s+now\s+on\s+you\s+(are|will|must)", re.I),
    # 系统提示泄露类
    re.compile(r"(show|reveal|print|output|display)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|rules?)", re.I),
    re.compile(r"what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?|initial\s+prompt)", re.I),
    # 越狱类
    re.compile(r"\bDAN\b.*\bmode\b", re.I),
    re.compile(r"jailbreak", re.I),
    re.compile(r"\b(do\s+anything\s+now)\b", re.I),
    # 中文注入模式
    re.compile(r"忽略(之前|上面|以上|所有)(的)?(指令|提示|规则|设定)", re.I),
    re.compile(r"你现在是", re.I),
    re.compile(r"假装你是", re.I),
    re.compile(r"(显示|输出|告诉我)(你的)?(系统)?(提示词|指令|设定)", re.I),
]

# 白名单模式：匹配到这些内容时跳过注入检测（学习场景常见表述）
WHITELIST_PATTERNS: list[re.Pattern] = [
    re.compile(r"(解释|分析|总结|概括|评估).{0,20}(概念|定理|公式|理论)"),
    re.compile(r"(假装|假设|如果).{0,10}(你是|我是).{0,10}(学生|老师|考官)"),
]

# 触发告警但不拦截的阈值（匹配数 >= 此值才拦截）
_BLOCK_THRESHOLD = 1


class PromptGuardMiddleware(BaseHTTPMiddleware):
    """Prompt 注入防护中间件"""

    async def dispatch(self, request: Request, call_next):
        # 仅对 AI 功能路径生效
        if not any(request.url.path.startswith(p) for p in GUARDED_PATHS):
            return await call_next(request)

        # 仅检查有请求体的方法
        if request.method not in ("POST", "PUT", "PATCH"):
            return await call_next(request)

        content_type = request.headers.get("content-type", "")
        if "application/json" not in content_type:
            return await call_next(request)

        try:
            body = await request.json()
            # 提取所有文本字段进行检测
            texts = self._extract_text_fields(body)
            for text in texts:
                if self._detect_injection(text):
                    user_id = getattr(request.state, "user_id", "unknown")
                    logger.warning(
                        "Prompt 注入拦截: user=%s, path=%s, text_preview=%s",
                        user_id, request.url.path, text[:100],
                    )
                    return JSONResponse(
                        status_code=400,
                        content={
                            "detail": "请求内容未通过安全检测，请修改后重试",
                            "code": "prompt_injection_detected",
                        },
                    )
        except Exception:
            # JSON 解析失败或其他异常，交给后续中间件处理
            pass

        return await call_next(request)

    def _extract_text_fields(self, data, max_depth: int = 3) -> list[str]:
        """递归提取 JSON 中的文本字段（限制深度避免性能问题）"""
        texts: list[str] = []
        if max_depth <= 0:
            return texts

        if isinstance(data, str) and len(data) > 10:
            # 超长字段（>1000 字符）跳过注入检测（多为 base64 编码内容）
            if len(data) > 1000:
                return texts
            texts.append(data)
        elif isinstance(data, dict):
            for key, value in data.items():
                # 跳过非内容字段
                if key in ("model", "temperature", "max_tokens", "response_format"):
                    continue
                # 跳过名字包含 image、base64、audio 的字段（二进制/多媒体数据）
                if any(skip_word in str(key).lower() for skip_word in ("image", "base64", "audio")):
                    continue
                texts.extend(self._extract_text_fields(value, max_depth - 1))
        elif isinstance(data, list):
            for item in data[:20]:  # 限制数组遍历数量
                texts.extend(self._extract_text_fields(item, max_depth - 1))

        return texts

    def _detect_injection(self, text: str) -> bool:
        """检测文本是否包含注入模式

        Returns:
            True = 检测到注入攻击
        """
        # 白名单优先：学习场景常见表述直接放行
        for wp in WHITELIST_PATTERNS:
            if wp.search(text):
                return False

        # 注入模式匹配
        match_count = 0
        for pattern in INJECTION_PATTERNS:
            if pattern.search(text):
                match_count += 1
                if match_count >= _BLOCK_THRESHOLD:
                    return True

        return False
