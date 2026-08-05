/**
 * P1 今日学习计划 Handler
 *
 * 处理 ai_learning_plan IPC 请求，调用 AI 网关根据客户端聚合的学习状态
 * 生成今日任务计划；本地 Ollama 可用时本地生成（离线降级路径之一），
 * 全部不可用时由渲染层本地规则规划兜底（degraded 语义）。
 *
 * @ai-context: P1 learning-plan IPC handler——AIFeatureDef 注册表模式，
 * authToken 由渲染进程从 supabase session 显式注入透传（主进程不自动注入）。
 * 请求响应契约与网关 learning_plan 路由的 Pydantic model 对齐。
 */

import { safeHandle } from '../../ipcUtils.js';
import { logger } from '../../logger.js';
import { callWithLocalFallback, gatewayUrl, parseModelJson, type AIFeatureDef } from '../utils.js';
import { generateText } from '../ollama/OllamaProvider.js';

// ================================================================
// IPC Handler
// ================================================================

/**
 * ai_learning_plan — POST /api/v1/ai/learning-plan
 */
function register(): void {
  safeHandle(
    'ai_learning_plan',
    async (
      _event,
      args: {
        masterySummary?: string;
        dueCounts?: Record<string, number>;
        peakHours?: number[];
        weeklyGoalMinutes?: number;
        todayMinutes?: number;
        authToken?: string;
      },
    ) => {
      // 所有字段均可选（服务端 Pydantic 模型均为 Optional）：
      // masterySummary 允许空串（新用户无掌握度数据时 AI 仍可生成入门计划），
      // 其他字段为 undefined 时后端跳过拼接。仅校验类型，避免 requireText
      // 拒绝空串导致新用户永远回退本地规划（AI 路径被静默跳过）。
      if (args?.masterySummary !== undefined && typeof args.masterySummary !== 'string') {
        throw new Error('IPC 入参错误: masterySummary 必须为字符串');
      }
      if (args?.dueCounts !== undefined && (typeof args.dueCounts !== 'object' || args.dueCounts === null || Array.isArray(args.dueCounts))) {
        throw new Error('IPC 入参错误: dueCounts 必须为对象');
      }
      const startMs = Date.now();
      logger.info(
        `[AI] [learning-plan] IPC received: mastery_len=${args.masterySummary?.length ?? 0}, due_decks=${Object.keys(args.dueCounts ?? {}).length}, hasAuth=${!!args.authToken}`,
      );

      // 前端 camelCase → 后端 snake_case
      const reqBody = {
        mastery_summary: args.masterySummary ?? '',
        due_counts: args.dueCounts ?? undefined,
        peak_hours: args.peakHours ?? undefined,
        weekly_goal_minutes: args.weeklyGoalMinutes ?? undefined,
        today_minutes: args.todayMinutes ?? undefined,
      };

      logger.info(`[AI] [learning-plan] Target: ${gatewayUrl()}/api/v1/ai/learning-plan`);

      interface PlanItemResp {
        module: string;
        title: string;
        minutes: number;
        task: string;
        reason: string;
        order: number;
      }

      interface LearningPlanResp {
        date: string;
        items: PlanItemResp[];
        note: string;
        status: string;
        model: string;
        tokens_used: number;
        latency_ms: number;
      }

      try {
        // 本地优先：Ollama 可用时本地生成（离线降级路径之一）
        const localHandler = async (): Promise<LearningPlanResp> => {
          const contextLines = [
            args.masterySummary ? `掌握度摘要：${args.masterySummary}` : '',
            args.dueCounts && Object.keys(args.dueCounts).length > 0
              ? `今日到期卡片：${Object.entries(args.dueCounts).map(([k, v]) => `${k} ${v} 张`).join('、')}`
              : '',
            args.peakHours?.length ? `个人高峰时段：${args.peakHours.join(',')} 点` : '',
            args.weeklyGoalMinutes != null ? `周目标：${args.weeklyGoalMinutes} 分钟` : '',
            args.todayMinutes != null ? `今日已学习：${args.todayMinutes} 分钟` : '',
          ].filter(Boolean).join('\n') || '（无历史数据，生成一份轻量入门计划）';

          const prompt = `用户今日学习状态：\n${contextLines}\n\n请生成今日学习计划。任务模块仅限：pomodoro(深潜番茄钟)/notes(结礁笔记)/flashcards(闪卡复习)/feynman(费曼讲解)/inspiration(灵感沉淀)。到期卡片优先复习；单任务10-60分钟，共2-4项，总时长不超过90分钟；高峰时段安排深度学习。返回JSON: {"date":"YYYY-MM-DD","items":[{"module":"...","title":"...","minutes":30,"task":"具体做什么","reason":"为什么安排这个","order":1}],"note":"一句鼓励语"}`;
          const result = await generateText(prompt, '你是一位学习规划教练，只输出 JSON。', { temperature: 0.6, maxTokens: 1024 });
          const parsed = parseModelJson<Partial<LearningPlanResp>>(result.content, {});
          const items = Array.isArray(parsed.items) ? parsed.items : [];
          return {
            date: parsed.date ?? new Date().toISOString().slice(0, 10),
            items,
            note: parsed.note ?? '',
            status: items.length > 0 ? 'success' : 'degraded',
            model: result.model,
            tokens_used: result.tokens_used,
            latency_ms: result.latency_ms,
          };
        };

        const { data: resp, source, requestId } = await callWithLocalFallback<typeof reqBody, LearningPlanResp>(
          '/api/v1/ai/learning-plan',
          reqBody,
          localHandler,
          args.authToken,
          30000,
        );

        const elapsed = Date.now() - startMs;
        logger.info(
          `[AI] [learning-plan] ✔ Success (${source}): items=${resp.items?.length ?? 0}, status=${resp.status}, model=${resp.model}, total=${elapsed}ms, reqId=${requestId ?? 'N/A'}`,
        );
        return {
          date: resp.date,
          items: resp.items ?? [],
          note: resp.note ?? '',
          status: resp.status,
          model: resp.model,
          tokensUsed: resp.tokens_used,
          latencyMs: resp.latency_ms,
          requestId,
          source,
        };
      } catch (err) {
        const elapsed = Date.now() - startMs;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error(`[AI] [learning-plan] ✖ Failed after ${elapsed}ms: ${error.message}`);
        throw error;
      }
    },
  );
}

// ================================================================
// 功能定义导出
// ================================================================

export const feature: AIFeatureDef = {
  id: 'ai_learning_plan',
  name: 'P1 今日学习计划',
  version: '1.0.0',
  register,
};
