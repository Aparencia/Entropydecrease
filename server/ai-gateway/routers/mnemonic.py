"""
熵减 AI 网关 —— 个性化记忆术生成器路由

POST /api/v1/ai/mnemonic
调用 MnemonicChain 生成个性化记忆术。

@ai-context: 记忆术路由——输入内容、学习风格，输出3种记忆编码。
"""

import logging
from pydantic import BaseModel, Field, field_validator
from fastapi import APIRouter, Request, HTTPException

from config import call_with_fallback_for_request
from chains.mnemonic_chain import MnemonicChain

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/ai", tags=["记忆术生成器"])


# ============================================================
# 请求/响应模型
# ============================================================


class MnemonicRequest(BaseModel):
    content: str = Field(..., description="需要记忆的内容", min_length=1, max_length=2000)
    learning_style: str = Field(default="visual", description="学习风格偏好：visual/auditory/verbal")
    user_context: str = Field(default="", description="用户背景信息", max_length=1000)

    @field_validator("content")
    @classmethod
    def content_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("内容不能为空白")
        return v.strip()

    @field_validator("learning_style")
    @classmethod
    def validate_style(cls, v: str) -> str:
        if v not in ("visual", "auditory", "verbal"):
            raise ValueError("无效的学习风格，可选：visual/auditory/verbal")
        return v


class MnemonicItem(BaseModel):
    type: str = Field(..., description="记忆术类型：phonetic/story/spatial")
    type_name: str = Field(default="", description="类型中文名称")
    mnemonic: str = Field(..., description="记忆编码内容")
    association: str = Field(default="", description="关联解释")
    example: str = Field(default="", description="使用示例")


class MnemonicResponse(BaseModel):
    mnemonics: list[MnemonicItem] = Field(default_factory=list, description="记忆术列表")
    status: str = Field(default="success")
    model: str = Field(default="unknown")
    tokens_used: int = Field(default=0)
    latency_ms: int = Field(default=0)


# ============================================================
# 路由处理
# ============================================================


@router.post("/mnemonic", response_model=MnemonicResponse, summary="个性化记忆术生成")
async def mnemonic(request: Request, body: MnemonicRequest) -> MnemonicResponse:
    user_id = getattr(request.state, "user_id", "anonymous")
    logger.info("记忆术生成: user=%s, content=%s, style=%s", user_id, body.content[:50], body.learning_style)

    async def _run_chain(provider, model_name):
        chain = MnemonicChain(provider=provider, model=model_name)
        return await chain.run(
            content=body.content,
            learning_style=body.learning_style,
            user_context=body.user_context,
        )

    try:
        result, used_provider, is_user_key = await call_with_fallback_for_request(
            request.app, "mnemonic", request, _run_chain
        )
        mnemonics = [
            MnemonicItem(
                type=m.get("type", ""),
                type_name=m.get("type_name", ""),
                mnemonic=m.get("mnemonic", ""),
                association=m.get("association", ""),
                example=m.get("example", ""),
            )
            for m in result.get("mnemonics", [])
        ]
        response = MnemonicResponse(
            mnemonics=mnemonics,
            status=result.get("status", "success"),
            model=result.get("model", "unknown"),
            tokens_used=result.get("tokens_used", 0),
            latency_ms=result.get("latency_ms", 0),
        )
        logger.info("记忆术生成完成: provider=%s, count=%d", used_provider, len(mnemonics))
    except RuntimeError as e:
        logger.warning("记忆术生成服务不可用，降级响应: %s", str(e))
        response = MnemonicResponse(
            mnemonics=[
                MnemonicItem(
                    type="story",
                    type_name="故事",
                    mnemonic="将需要记忆的内容编成一个简短有趣的故事。",
                    association="故事联想帮助记忆",
                    example="试着自己编个故事",
                ),
            ],
            status="fallback",
            model="local_rule",
        )
    return response