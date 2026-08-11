/**
 * @ai-context: Rescue 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 * @ai-context: P5 流式接入——rescueStream 经 aiPluginLoader.rescueStream 逐 chunk
 * 累积 JSON（rescue_v1 模板强制 JSON），完成后宽松解析；失败自动降级非流式 rescue。
 * cancelRef/streamIdRef 防竞态与卸载泄漏（与 useAISummarize 流式模式一致）。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { resolveAIFallback, setAICache, FallbackLevel } from '../aiServiceFallback';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import { withTimeout } from './withTimeout';
import type { RescueContext, ResourceLink } from '../types';

/** 救援结果结构（与 useAIRescue 状态一致） */
export interface RescueResultData {
  hints: string[];
  resources: ResourceLink[];
  alternativeApproach?: string;
}

/**
 * 宽松解析流式累积的救援 JSON（rescue_v1 模板强制 JSON；AI 输出可能带前后缀）
 */
function parseRescueJson(text: string): RescueResultData | null {
  const tryParse = (s: string): RescueResultData | null => {
    try {
      const parsed = JSON.parse(s) as {
        hints?: string[]; resources?: Array<{ title?: string; url?: string; type?: string }>;
        alternative_approach?: string; alternativeApproach?: string;
      };
      if (Array.isArray(parsed.hints) || parsed.alternative_approach || parsed.alternativeApproach) {
        return {
          hints: Array.isArray(parsed.hints) ? parsed.hints : [],
          resources: Array.isArray(parsed.resources)
            ? parsed.resources.map((r) => ({
                title: r.title ?? '',
                url: r.url ?? '',
                type: (['article', 'video', 'exercise', 'documentation', 'other'] as const)
                  .find((t) => t === r.type) ?? 'other',
              }))
            : [],
          alternativeApproach: parsed.alternative_approach ?? parsed.alternativeApproach,
        };
      }
    } catch { /* fallthrough */ }
    return null;
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const block = text.match(/\{[\s\S]*\}/);
  return block ? tryParse(block[0]) : null;
}

/**
 * AI 学习救援 hook
 *
 * 当用户在学习过程中卡住时，提供三级递进帮助：
 * 1. 提示线索（引导性提示）
 * 2. 简化问题（拆解子问题）
 * 3. 替代路径（全新解决思路）
 *
 * 接入 aiServiceFallback 进行缓存降级
 */
export function useAIRescue() {
  const [state, setState] = useState<AIState<{
    hints: string[]; resources: ResourceLink[]; alternativeApproach?: string;
  }>>({
    ...INITIAL_STATE,
  });
  /** 流式渐进文本（逐 chunk 累积，打字机展示） */
  const [streamingText, setStreamingText] = useState('');
  /** 是否正在流式输出 */
  const [isStreaming, setIsStreaming] = useState(false);
  const cancelRef = useRef(false);
  const streamIdRef = useRef(0);

  const rescue = useCallback(async (context: RescueContext) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    const cacheKey = `rescue:${context.topic.slice(0, 100)}:${context.stuckPoint?.slice(0, 50) || 'default'}`;
    try {
      const result = await withTimeout(aiPluginLoader.rescue(context));
      setAICache(cacheKey, result);
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<typeof state.data>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setState(resolveAIErrorState(error, {
        message: 'AI 学习救援服务暂时不可用',
        suggestion: '试试先放下这个问题，过一会儿再回来思考，或者从基础概念重新开始',
      }));
      return null;
    }
  }, []);

  /**
   * P5 流式学习救援：逐 chunk 累积 JSON，完成后解析结构化结果；失败降级非流式 rescue
   */
  const rescueStream = useCallback(async (context: RescueContext) => {
    cancelRef.current = false;
    const streamId = ++streamIdRef.current;
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    setIsStreaming(true);
    setStreamingText('');
    let accumulated = '';
    try {
      const iterable = aiPluginLoader.rescueStream(context);
      for await (const chunk of iterable) {
        if (cancelRef.current || streamIdRef.current !== streamId) return null;
        accumulated += chunk;
        setStreamingText(accumulated);
      }
      if (cancelRef.current || streamIdRef.current !== streamId) return null;
      const parsed = parseRescueJson(accumulated);
      if (!parsed) {
        throw new Error('AI 流式返回无法解析为救援 JSON');
      }
      const cacheKey = `rescue:${context.topic.slice(0, 100)}:${context.stuckPoint?.slice(0, 50) || 'default'}`;
      setAICache(cacheKey, parsed);
      setState({ data: parsed, loading: false, error: null, isFallback: false, needsConfig: false });
      setIsStreaming(false);
      return parsed;
    } catch (error: unknown) {
      if (cancelRef.current || streamIdRef.current !== streamId) return null;
      // 流式失败 → 降级非流式（非流式内部自行处理错误态与降级链）
      setIsStreaming(false);
      return rescue(context);
    }
  }, [rescue]);

  /** 取消当前流式输出 */
  const cancelStream = useCallback(() => {
    cancelRef.current = true;
    setIsStreaming(false);
  }, []);

  // 组件卸载时自动取消，避免对已卸载组件 setState
  useEffect(() => () => { cancelRef.current = true; }, []);

  return { ...state, streamingText, isStreaming, rescue, rescueStream, cancelStream };
}
