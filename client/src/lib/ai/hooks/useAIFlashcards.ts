/**
 * @ai-context: Flashcards 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 * @ai-context: A 组流式接入——generateStream 经 aiPluginLoader.generateFlashcardsStream
 * 逐 chunk 累积 JSON 文本（网关 /generate-cards/stream SSE，模板强制 JSON），完成后
 * 宽松解析为 FlashcardResult；解析失败自动降级非流式 generate。cancelRef/streamIdRef
 * 防竞态与卸载泄漏（与 useAISummarize 流式模式一致）。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { getLocalFallbackMessage } from '../LocalFallback';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { FlashcardResult, FlashcardOptions } from '../types';

/**
 * 宽松解析流式累积的 JSON 文本（AI 输出可能带前后缀说明文字）
 * 优先整体解析；失败时截取首个 { ... } 块再试
 */
function parseFlashcardsJson(text: string): FlashcardResult | null {
  try {
    const parsed = JSON.parse(text) as FlashcardResult;
    if (Array.isArray(parsed.cards)) return parsed;
  } catch { /* fallthrough */ }
  const block = text.match(/\{[\s\S]*\}/);
  if (!block) return null;
  try {
    const parsed = JSON.parse(block[0]) as FlashcardResult;
    if (Array.isArray(parsed.cards)) return parsed;
  } catch { /* fallthrough */ }
  return null;
}

/**
 * AI 闪卡生成 hook
 */
export function useAIFlashcards() {
  const [state, setState] = useState<AIState<FlashcardResult>>({
    ...INITIAL_STATE,
  });
  /** 流式渐进文本（逐 chunk 累积） */
  const [streamingText, setStreamingText] = useState('');
  /** 是否正在流式输出 */
  const [isStreaming, setIsStreaming] = useState(false);
  const cancelRef = useRef(false);
  const streamIdRef = useRef(0);

  const generate = useCallback(async (content: string, options?: FlashcardOptions) => {
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    try {
      const result = await aiPluginLoader.generateFlashcards(content, options);
      soundPlayer.play('ai_analysis_done');
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      setState(resolveAIErrorState(error, getLocalFallbackMessage('flashcard')));
      throw error;
    }
  }, []);

  /**
   * 流式闪卡生成：逐 chunk 累积 JSON，完成后解析结构化结果；失败降级非流式
   */
  const generateStream = useCallback(async (content: string, options?: FlashcardOptions) => {
    cancelRef.current = false;
    const streamId = ++streamIdRef.current;
    setState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    setIsStreaming(true);
    setStreamingText('');
    let accumulated = '';
    try {
      const iterable = aiPluginLoader.generateFlashcardsStream(content, options);
      for await (const chunk of iterable) {
        if (cancelRef.current || streamIdRef.current !== streamId) return;
        accumulated += chunk;
        setStreamingText(accumulated);
      }
      if (cancelRef.current || streamIdRef.current !== streamId) return;
      const parsed = parseFlashcardsJson(accumulated);
      if (!parsed) {
        throw new Error('AI 流式返回无法解析为闪卡 JSON');
      }
      const result: FlashcardResult = {
        ...parsed,
        generatedAt: new Date(),
      };
      soundPlayer.play('ai_analysis_done');
      setState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      setIsStreaming(false);
      return result;
    } catch {
      if (cancelRef.current || streamIdRef.current !== streamId) return;
      // 流式失败 → 降级非流式（非流式内部自行处理错误态）
      setIsStreaming(false);
      return generate(content, options);
    }
  }, [generate]);

  /** 取消当前流式输出 */
  const cancelStream = useCallback(() => {
    cancelRef.current = true;
    setIsStreaming(false);
  }, []);

  // 组件卸载时自动取消，避免对已卸载组件 setState
  useEffect(() => () => { cancelRef.current = true; }, []);

  return { ...state, streamingText, isStreaming, generate, generateStream, cancelStream };
}
