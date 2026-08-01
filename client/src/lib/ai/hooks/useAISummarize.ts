/**
 * @ai-context: Summarize 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 * @ai-context: P2-12 流式落地——summarizeStream 经 aiPluginLoader.summarizeNoteStream
 * 逐 chunk 累积渐进文本（streamingText），完成后从全文派生 keyPoints；
 * 流式失败自动降级非流式 summarize。cancelRef/streamIdRef 防竞态与卸载泄漏。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { getLocalFallbackMessage } from '../LocalFallback';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { SummarizeResult, SummarizeOptions } from '../types';

/** 从摘要全文派生关键要点：切分 bullet/编号行，纯客户端增强（无则返回空数组，与原行为一致） */
function deriveKeyPoints(summary: string): string[] {
  return summary
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-*•·]|\d+[.、)])\s*/.test(l))
    .map((l) => l.replace(/^([-*•·]|\d+[.、)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

/**
 * AI 摘要 hook
 */
export function useAISummarize() {
  const [state, setState] = useState<AIState<SummarizeResult>>({
    ...INITIAL_STATE,
  });
  /** 流式渐进文本（逐 chunk 累积） */
  const [streamingText, setStreamingText] = useState('');
  /** 是否正在流式输出 */
  const [isStreaming, setIsStreaming] = useState(false);
  const cancelRef = useRef(false);
  const streamIdRef = useRef(0);

  const summarize = useCallback(async (content: string, options?: SummarizeOptions) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.summarizeNote(content, options);
      soundPlayer.play('ai_analysis_done');
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, getLocalFallbackMessage('summarize')));
      throw error;
    }
  }, []);

  /**
   * 流式摘要：逐 chunk 渐进显示，完成后派生结构化结果；失败降级非流式
   */
  const summarizeStream = useCallback(async (content: string, options?: SummarizeOptions) => {
    cancelRef.current = false;
    const streamId = ++streamIdRef.current;
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    setIsStreaming(true);
    setStreamingText('');
    let accumulated = '';
    try {
      const iterable = aiPluginLoader.summarizeNoteStream(content, options);
      for await (const chunk of iterable) {
        if (cancelRef.current || streamIdRef.current !== streamId) return;
        accumulated += chunk;
        setStreamingText(accumulated);
      }
      if (cancelRef.current || streamIdRef.current !== streamId) return;
      const result: SummarizeResult = {
        summary: accumulated,
        keyPoints: deriveKeyPoints(accumulated),
        generatedAt: new Date(),
      };
      soundPlayer.play('ai_analysis_done');
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      setIsStreaming(false);
      return result;
    } catch (error: unknown) {
      if (cancelRef.current || streamIdRef.current !== streamId) return;
      // 流式失败 → 降级非流式（非流式内部自行处理错误态）
      setIsStreaming(false);
      return summarize(content, options);
    }
  }, [summarize]);

  /** 取消当前流式输出 */
  const cancelStream = useCallback(() => {
    cancelRef.current = true;
    setIsStreaming(false);
  }, []);

  // 组件卸载时自动取消，避免对已卸载组件 setState
  useEffect(() => () => { cancelRef.current = true; }, []);

  return { ...state, streamingText, isStreaming, summarize, summarizeStream, cancelStream };
}
