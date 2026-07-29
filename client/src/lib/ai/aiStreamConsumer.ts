/**
 * AI 流式消费 React Hook
 *
 * 封装流式 AI 输出的消费逻辑：
 * - 管理流式状态（isStreaming, error）
 * - 累积 chunk 文本
 * - 支持取消流式请求
 * - 流式失败时自动降级到非流式
 *
 * 使用示例：
 * ```tsx
 * const { text, isStreaming, error, startStream, cancelStream } = useAIStream();
 *
 * // 启动流式
 * await startStream(() => aiPluginLoader.summarizeNoteStream(content));
 *
 * // 取消流式
 * cancelStream();
 * ```
 *
 * @ai-context: SSE 流消费与增量 JSON 解析；分片边界处理是易错点，chunk 可能截断多字节字符。
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseAIStreamResult {
  /** 当前累积的文本内容 */
  text: string;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 错误信息 */
  error: string | null;
  /** 启动流式输出 */
  startStream: (streamFn: () => AsyncIterable<string>, fallbackFn?: () => Promise<string>) => Promise<void>;
  /** 取消流式输出 */
  cancelStream: () => void;
  /** 重置状态 */
  reset: () => void;
}

/**
 * AI 流式消费 Hook
 *
 * @returns 流式状态和控制方法
 */
export function useAIStream(): UseAIStreamResult {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelRef = useRef(false);
  const streamIdRef = useRef(0);

  /**
   * 启动流式输出
   *
   * @param streamFn 返回 AsyncIterable<string> 的流式函数
   * @param fallbackFn 可选的非流式降级函数，流式失败时调用
   */
  const startStream = useCallback(
    async (
      streamFn: () => AsyncIterable<string>,
      fallbackFn?: () => Promise<string>,
    ): Promise<void> => {
      // 重置状态
      cancelRef.current = false;
      const currentStreamId = ++streamIdRef.current;
      setText('');
      setIsStreaming(true);
      setError(null);

      let accumulated = '';

      try {
        const iterable = streamFn();

        for await (const chunk of iterable) {
          // 检查是否已取消或被新的流式请求取代
          if (cancelRef.current || streamIdRef.current !== currentStreamId) {
            break;
          }
          accumulated += chunk;
          setText(accumulated);
        }

        // 流正常结束
        if (!cancelRef.current && streamIdRef.current === currentStreamId) {
          setIsStreaming(false);
        }
      } catch (err) {
        // 流式失败，尝试降级到非流式
        if (cancelRef.current || streamIdRef.current !== currentStreamId) {
          return; // 已取消或被取代，静默退出
        }

        if (fallbackFn) {
          try {
            const fallbackText = await fallbackFn();
            setText(fallbackText);
            setIsStreaming(false);
            return;
          } catch (fallbackErr) {
            const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            setError(`流式输出失败，降级也失败: ${fallbackMsg}`);
            setIsStreaming(false);
            return;
          }
        }

        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setIsStreaming(false);
      }
    },
    [],
  );

  /**
   * 取消当前流式输出
   */
  const cancelStream = useCallback(() => {
    cancelRef.current = true;
    setIsStreaming(false);
  }, []);

  /**
   * 重置所有状态
   */
  const reset = useCallback(() => {
    cancelRef.current = true;
    streamIdRef.current++;
    setText('');
    setIsStreaming(false);
    setError(null);
  }, []);

  // 组件卸载时自动取消
  useEffect(() => {
    return () => {
      cancelRef.current = true;
    };
  }, []);

  return {
    text,
    isStreaming,
    error,
    startStream,
    cancelStream,
    reset,
  };
}
