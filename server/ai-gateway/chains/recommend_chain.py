"""
熵减 AI 网关 — 番茄钟推荐 Chain

编排番茄钟时长推荐的完整流程：
1. 分析用户历史专注数据
2. 调用模型生成个性化推荐
3. AI 不可用时降级为本地规则引擎

@ai-context: 番茄钟推荐 Chain：基于专注历史推荐时长与策略。
"""

import json
import logging
from typing import Any
from pathlib import Path

from providers.base_provider import AIProvider
from providers.fallback_provider import FallbackProvider

logger = logging.getLogger(__name__)

# Prompt 模板路径
PROMPT_TEMPLATE_PATH = Path(__file__).parent.parent / "prompts" / "recommend_v1.txt"


class RecommendChain:
    """番茄钟推荐链"""

    def __init__(self, provider: AIProvider, model: str = "deepseek-chat"):
        self.provider = provider
        self.model = model
        self._prompt_template: str | None = None

    def _load_prompt_template(self) -> str:
        """加载 prompt 模板文件"""
        if self._prompt_template is None:
            self._prompt_template = PROMPT_TEMPLATE_PATH.read_text(encoding="utf-8")
        return self._prompt_template

    def _format_history(self, history: list[dict[str, Any]], mode: str | None = None) -> str:
        """将专注历史记录格式化为可读文本"""
        if not history:
            return "暂无历史记录（首次使用）"

        # pomodoro 模式取最近14天数据，其他取最近20条
        if mode == "pomodoro":
            from datetime import datetime, timedelta
            cutoff = datetime.now() - timedelta(days=14)
            recent = [
                s for s in history
                if self._parse_date(s.get("date", "")) >= cutoff
            ] if history else []
            if not recent:
                recent = history[-20:]
        else:
            recent = history[-20:]

        lines = []
        for i, session in enumerate(recent, 1):
            duration = session.get("duration_minutes", session.get("duration", 25))
            completed = "完成" if session.get("completed", False) else "未完成"
            subject = session.get("subject", "")
            line = f"  {i}. {duration}分钟 [{completed}]"
            if subject:
                line += f" - {subject}"
            # pomodoro 模式额外展示中断次数
            if mode == "pomodoro":
                interruptions = session.get("interruptions", 0)
                if interruptions:
                    line += f" (中断{interruptions}次)"
            lines.append(line)
        return "\n".join(lines)

    @staticmethod
    def _parse_date(date_str: str):
        """安全解析日期字符串"""
        from datetime import datetime
        for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
            try:
                return datetime.strptime(date_str, fmt)
            except (ValueError, TypeError):
                continue
        return datetime.min

    def _preprocess_history(self, history: list[dict[str, Any]], mode: str | None = None) -> dict[str, Any]:
        """预处理历史数据，计算统计指标"""
        if not history:
            return {"total": 0, "completed": 0, "avg_duration": 0, "completion_rate": 0}

        total = len(history)
        completed_sessions = [s for s in history if s.get("completed", False)]
        completed = len(completed_sessions)

        durations = [
            s.get("duration_minutes", s.get("duration", 25))
            for s in completed_sessions
        ]
        avg_duration = sum(durations) / len(durations) if durations else 0
        completion_rate = completed / total if total > 0 else 0

        stats: dict[str, Any] = {
            "total": total,
            "completed": completed,
            "avg_duration": round(avg_duration, 1),
            "completion_rate": round(completion_rate, 2),
        }

        # pomodoro 模式额外计算科目分布和中断统计
        if mode == "pomodoro":
            subjects: dict[str, int] = {}
            total_interruptions = 0
            for s in history:
                subj = s.get("subject", "")
                if subj:
                    subjects[subj] = subjects.get(subj, 0) + 1
                total_interruptions += s.get("interruptions", 0)
            stats["subject_distribution"] = subjects
            stats["total_interruptions"] = total_interruptions

        return stats

    def _parse_recommendation(self, content: str) -> dict[str, Any]:
        """解析推荐结果 JSON"""
        # 尝试直接解析
        try:
            data = json.loads(content)
            return self._validate_recommendation(data)
        except json.JSONDecodeError:
            pass

        # 尝试提取 markdown 代码块
        if "```json" in content:
            try:
                start = content.index("```json") + 7
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
                return self._validate_recommendation(data)
            except (json.JSONDecodeError, ValueError):
                pass

        if "```" in content:
            try:
                start = content.index("```") + 3
                end = content.index("```", start)
                data = json.loads(content[start:end].strip())
                return self._validate_recommendation(data)
            except (json.JSONDecodeError, ValueError):
                pass

        logger.error("无法解析推荐 JSON: %s", content[:200])
        return {"recommended_minutes": 25, "break_minutes": 5, "reason": "解析失败，使用默认推荐"}

    def _validate_recommendation(self, data: dict[str, Any]) -> dict[str, Any]:
        """验证并规范化推荐结果"""
        recommended = int(data.get("recommended_minutes", 25))
        recommended = max(15, min(50, recommended))

        break_minutes = int(data.get("break_minutes", 5))
        break_minutes = max(3, min(15, break_minutes))

        reason = str(data.get("reason", "基于您的专注历史分析"))

        return {
            "recommended_minutes": recommended,
            "break_minutes": break_minutes,
            "reason": reason,
        }

    async def run(
        self,
        history: list[dict[str, Any]],
        mode: str | None = None,
    ) -> dict[str, Any]:
        """
        执行番茄钟推荐

        Args:
            history: 历史专注记录列表
            mode: 推荐模式，'pomodoro' 为增强模式（14天历史+科目分布）

        Returns:
            dict: 推荐的番茄钟配置
        """
        logger.info("RecommendChain.run: history_count=%d, mode=%s", len(history), mode)

        # 1. 预处理历史数据
        stats = self._preprocess_history(history, mode=mode)
        history_text = self._format_history(history, mode=mode)

        # 2. 加载 prompt 模板并填充
        template = self._load_prompt_template()
        prompt = template.format(history=history_text)

        # pomodoro 模式追加额外上下文
        if mode == "pomodoro" and "subject_distribution" in stats:
            subj_info = ", ".join(
                f"{k}({v}次)" for k, v in stats["subject_distribution"].items()
            )
            prompt += (
                f"\n\n科目分布: {subj_info}"
                f"\n总中断次数: {stats.get('total_interruptions', 0)}"
                f"\n请综合考虑14天内的完成率、中断频率和科目分布来推荐时长。"
            )

        # 3. 调用 provider
        try:
            result = await self.provider.generate(
                prompt=prompt,
                system_prompt=(
                    "你是一个专注力管理助手，擅长根据用户的专注历史数据给出个性化的番茄钟时长建议。\n"
                    "请基于数据分析给出科学的推荐。\n\n"
                    "## 输出格式\n"
                    "请务必以 JSON 格式输出，包含：recommended_minutes、break_minutes、reason。"
                ),
                model=self.model,
                temperature=0.3,
                max_tokens=512,
                response_format={"type": "json_object"},
            )

            # 4. 解析 JSON 输出
            recommendation = self._parse_recommendation(result["content"])
            return {
                **recommendation,
                "source": "ai",
                "model": result["model"],
                "tokens_used": result["tokens_used"],
                "latency_ms": result["latency_ms"],
                "stats": stats,
            }

        except Exception as e:
            # 5. AI 不可用时降级到本地规则引擎
            logger.warning("AI 推荐不可用，降级到本地规则引擎: %s", str(e))
            fallback_result = FallbackProvider.recommend_duration_fallback(history)
            return {
                **fallback_result,
                "break_minutes": 5,
                "source": "local_rule",
                "model": "local_rule",
                "tokens_used": 0,
                "latency_ms": 0,
                "stats": stats,
            }
