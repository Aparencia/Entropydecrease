"""
熵减 AI 网关 — 多模态课堂分析 Chain

@ai-context Path B 核心链路：客户端捕获关键帧序列 + 语音转写 →
本 Chain 编排多图联合分析 → 输出结构化 Markdown 课堂笔记。

与 VisionExtractChain 的差异：
- VisionExtractChain：单图 JSON 结构化提取（截图实时分析）
- MultimodalAnalyzeChain：多图时序联合分析（课后笔记生成）

关键帧超过 20 帧时分 chunk 并行调用（每 chunk ≤15 帧），
避免单次请求 token 超限，同时降低整体延迟。
"""

import asyncio
import logging
from typing import Any

from providers.base_provider import AIProvider
from chains.multimodal_analyze_utils import (
    format_timestamp,
    strip_markdown_fence,
    warn_if_truncated,
)
from prompts.session_analyze import (
    SESSION_ANALYZE_SYSTEM_PROMPT,
    PARTIAL_ANALYZE_SYSTEM_PROMPT,
    build_session_prompt,
    build_partial_prompt,
    build_course_context,
)

logger = logging.getLogger(__name__)

# 分 chunk 阈值：超过此数量时拆分为多个并行请求
_CHUNK_THRESHOLD = 20
# 每 chunk 最大帧数
_CHUNK_SIZE = 15
# 全量分析生成上限
_FULL_MAX_TOKENS = 4096
# @ai-context partial 片段模式生成上限：GLM-4V-Flash 上限 1024 会被 provider
# clamp，此处 2000 是目标值（partial mode target max_tokens, provider may clamp）
_PARTIAL_MAX_TOKENS = 2000


class MultimodalAnalyzeChain:
    """多模态课堂分析链：多图时序联合 → Markdown 笔记"""

    def __init__(self, provider: AIProvider, model: str | None = None):
        self.provider = provider
        # 未指定模型时使用 Provider 默认视觉模型
        self.model = model or ""

    # ------------------------------------------------------------------
    # Prompt 构建
    # ------------------------------------------------------------------

    def _build_prompt(
        self,
        keyframes: list[dict],
        audio_text: str | None,
        duration: int,
        course_meta: dict | None = None,
        mode: str = "full",
    ) -> tuple[list[str], str]:
        """
        组装多图分析所需的图片列表和文本 Prompt

        @ai-context 时间标注让模型感知帧间时序关系，
        "画面变化类型" 帮助模型区分板书切换 / PPT 翻页 / 板书手写等场景。
        partial 模式使用片段模板，仅输出该片段知识点（无课程概述等全局信息）。

        Args:
            keyframes:  关键帧列表 [{timestamp, image_base64, change_type}]
            audio_text: 语音转写文本（可选，None 表示无语音）
            duration:   课程总时长（秒）
            mode:       分析模式 full / partial

        Returns:
            tuple: (images_base64_list, full_prompt)
        """
        images: list[str] = []
        time_annotations: list[str] = []

        for idx, kf in enumerate(keyframes):
            images.append(kf["image_base64"])
            ts = format_timestamp(kf.get("timestamp", 0.0))
            change = kf.get("change_type", "scene_change")
            time_annotations.append(
                f"第 {idx + 1} 帧出现在 {ts}，画面变化类型为 {change}"
            )

        # 将时间标注嵌入 Prompt 的 keyframes_desc 段落
        keyframes_desc = "\n".join(time_annotations)

        # 语音转写补充段落
        audio_context = ""
        if audio_text and audio_text.strip():
            audio_context = (
                "\n以下是课程语音转写内容（请融合到笔记中）：\n"
                f"{audio_text.strip()}\n"
            )

        # 基础 Prompt 框架：partial 模式使用增量片段模板
        if mode == "partial":
            base_prompt = build_partial_prompt(keyframes_count=len(keyframes))
        else:
            base_prompt = build_session_prompt(
                keyframes_count=len(keyframes),
                audio_segments_count=1 if audio_text else 0,
                duration_seconds=duration,
                course_meta=course_meta,
            )

        # 课程上下文注入（追加到 Prompt 末尾）
        course_context = build_course_context(course_meta)

        # 将时间标注和语音内容拼入 Prompt
        full_prompt = (
            f"{base_prompt}\n\n"
            f"---\n各帧时间标注：\n{keyframes_desc}"
            f"{audio_context}"
            f"{course_context}"
        )

        return images, full_prompt

    # ------------------------------------------------------------------
    # 响应解析 / 截断检测（委托 multimodal_analyze_utils 纯函数）
    # ------------------------------------------------------------------

    def _parse_response(self, raw: str) -> str:
        """解析模型返回内容（去除意外包裹的外层代码块围栏）"""
        return strip_markdown_fence(raw)

    def _warn_if_truncated(self, content: str, tokens_used: int, max_tokens: int) -> None:
        """输出末尾疑似截断时记录告警"""
        warn_if_truncated(content, tokens_used, max_tokens)

    # ------------------------------------------------------------------
    # 单 chunk 执行
    # ------------------------------------------------------------------

    async def _run_chunk(
        self,
        images: list[str],
        prompt: str,
        chunk_label: str,
        system_prompt: str = SESSION_ANALYZE_SYSTEM_PROMPT,
        max_tokens: int = _FULL_MAX_TOKENS,
    ) -> dict[str, Any]:
        """执行单个 chunk 的多图分析调用"""
        logger.info(
            "MultimodalAnalyzeChain %s: images=%d, model=%s",
            chunk_label, len(images), self.model,
        )
        result = await self.provider.generate_vision_multi(
            images_base64=images,
            prompt=prompt,
            system_prompt=system_prompt,
            model=self.model,
            temperature=0.3,
            max_tokens=max_tokens,
            _feature="multimodal_analyze",
        )
        return result

    # ------------------------------------------------------------------
    # 主入口
    # ------------------------------------------------------------------

    async def run(
        self,
        keyframes: list[dict],
        audio_text: str | None,
        duration: int,
        course_meta: dict | None = None,
        mode: str = "full",
    ) -> dict[str, Any]:
        """
        执行多模态课堂分析

        @ai-context 超过 _CHUNK_THRESHOLD 帧时拆分并行调用，
        每 chunk ≤ _CHUNK_SIZE 帧，避免单次请求 token 超限。
        partial 模式使用片段模板 + _PARTIAL_MAX_TOKENS，仅输出片段知识点。

        Args:
            keyframes:   关键帧列表 [{timestamp, image_base64, change_type}]
            audio_text:  语音转写文本（None 表示无语音）
            duration:    课程总时长（秒）
            course_meta: 课程元数据（可选）
            mode:        分析模式 full（全量）/ partial（增量片段）

        Returns:
            dict: {
                "content": str,         # Markdown 笔记内容
                "tokens_used": int,
                "model": str,
                "latency_ms": int,
                "keyframes_analyzed": int,
            }
        """
        if not keyframes:
            return {
                "content": "*（无关键帧数据，无法生成笔记）*",
                "tokens_used": 0,
                "model": self.model,
                "latency_ms": 0,
                "keyframes_analyzed": 0,
            }

        images, full_prompt = self._build_prompt(
            keyframes, audio_text, duration, course_meta, mode=mode,
        )
        total_frames = len(images)

        # partial 模式：片段系统提示词 + 较小的生成上限
        if mode == "partial":
            system_prompt = PARTIAL_ANALYZE_SYSTEM_PROMPT
            max_tokens = _PARTIAL_MAX_TOKENS
        else:
            system_prompt = SESSION_ANALYZE_SYSTEM_PROMPT
            max_tokens = _FULL_MAX_TOKENS

        # ---- 路径 A：单 chunk（≤ 阈值）----
        if total_frames <= _CHUNK_THRESHOLD:
            result = await self._run_chunk(
                images, full_prompt, "single",
                system_prompt=system_prompt, max_tokens=max_tokens,
            )
            content = self._parse_response(result["content"])
            # provider 可能 clamp max_tokens（如 GLM 上限 1024），优先取返回的实际值
            used_max = result.get("max_tokens", max_tokens)
            self._warn_if_truncated(content, result.get("tokens_used", 0), used_max)
            return {
                "content": content,
                "tokens_used": result.get("tokens_used", 0),
                "model": result.get("model", self.model),
                "latency_ms": result.get("latency_ms", 0),
                "keyframes_analyzed": total_frames,
            }

        # ---- 路径 B：多 chunk 并行（> 阈值）----
        # 拆分为每 chunk _CHUNK_SIZE 帧
        chunks: list[list[str]] = [
            images[i : i + _CHUNK_SIZE]
            for i in range(0, total_frames, _CHUNK_SIZE)
        ]

        logger.info(
            "MultimodalAnalyzeChain: 拆分为 %d 个 chunk 并行执行（共 %d 帧）",
            len(chunks), total_frames,
        )

        # 每个 chunk 复用同一个 Prompt（模型可通过帧编号区分上下文）
        chunk_tasks = [
            self._run_chunk(
                chunk_imgs, full_prompt, f"chunk-{idx + 1}/{len(chunks)}",
                system_prompt=system_prompt, max_tokens=max_tokens,
            )
            for idx, chunk_imgs in enumerate(chunks)
        ]
        chunk_results = await asyncio.gather(*chunk_tasks, return_exceptions=True)

        # 合并结果：成功的 chunk 按序拼接，失败的标注警告
        merged_parts: list[str] = []
        total_tokens = 0
        total_latency = 0
        used_model = self.model

        for idx, res in enumerate(chunk_results):
            if isinstance(res, Exception):
                logger.warning("Chunk %d 执行失败: %s", idx + 1, str(res))
                merged_parts.append(
                    f"\n> ⚠️ 第 {idx + 1} 段分析失败，该部分笔记可能不完整\n"
                )
            else:
                chunk_content = self._parse_response(res["content"])
                used_max = res.get("max_tokens", max_tokens)
                self._warn_if_truncated(
                    chunk_content, res.get("tokens_used", 0), used_max,
                )
                merged_parts.append(chunk_content)
                total_tokens += res.get("tokens_used", 0)
                total_latency = max(total_latency, res.get("latency_ms", 0))
                used_model = res.get("model", used_model)

        merged_content = "\n\n---\n\n".join(merged_parts)

        return {
            "content": merged_content,
            "tokens_used": total_tokens,
            "model": used_model,
            "latency_ms": total_latency,
            "keyframes_analyzed": total_frames,
        }
