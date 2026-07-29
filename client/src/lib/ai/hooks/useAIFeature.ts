/**
 * 通用 AI 功能 hook 工厂
 *
 * 替代重复的 useAI* hook 模板代码，统一状态管理、错误处理和音效播放逻辑。
 * 适用于没有缓存降级需求的简单 AI 功能调用场景。
 *
 * @ai-context: Feature 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */

import { useState, useCallback } from 'react';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';

/** 工厂配置 */
export interface UseAIFeatureConfig<TInput, TOutput> {
  /** AI 调用函数 */
  callFn: (input: TInput) => Promise<TOutput>;
  /** 本地降级消息（可选） */
  fallbackMessage?: { message: string; suggestion: string };
  /** 成功后播放提示音，默认 true */
  soundOnSuccess?: boolean;
  /** 成功后自定义 isFallback 值（如深潜推荐需要标记本地降级） */
  resolveIsFallback?: (result: TOutput) => boolean;
}

/**
 * 通用 AI 功能 hook 工厂
 *
 * @example
 * ```tsx
 * const { data, loading, error, execute } = useAIFeature({
 *   callFn: (content: string) => aiPluginLoader.summarizeNote(content),
 *   fallbackMessage: { message: 'AI 摘要服务暂时不可用', suggestion: '请稍后重试' },
 * });
 * ```
 */
export function useAIFeature<TInput, TOutput>(config: UseAIFeatureConfig<TInput, TOutput>) {
  const [state, setState] = useState<AIState<TOutput>>({ ...INITIAL_STATE });

  const execute = useCallback(async (input: TInput): Promise<TOutput | null> => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await config.callFn(input);
      if (config.soundOnSuccess !== false) {
        soundPlayer.play('ai_analysis_done');
      }
      setState({
        data: result,
        loading: false,
        error: null,
        isFallback: config.resolveIsFallback ? config.resolveIsFallback(result) : false,
        needsConfig: false,
      });
      return result;
    } catch (error: unknown) {
      const errorState = resolveAIErrorState(error, config.fallbackMessage);
      setState(errorState as AIState<TOutput>);
      return null;
    }
  }, [config]);

  return {
    ...state,
    execute,
  };
}
