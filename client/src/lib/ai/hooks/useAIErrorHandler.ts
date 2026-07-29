/**
 * 统一 AI 错误处理 hook
 *
 * 用于没有专用错误 UI 区域的快捷入口（右键菜单、工具栏按钮等），
 * 将 AI 错误分类后以 toast 形式展示给用户。
 *
 * @ai-context: ErrorHandler 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */

import { useCallback } from 'react';
import { useToast } from '@/components/ui';
import { classifyRawError } from '../errorClassifier';

/**
 * 统一 AI 错误 toast 处理 hook
 *
 * @param context 触发错误的功能上下文名称（如 "AI 摘要" "AI 闪卡"）
 * @returns 错误处理回调函数，直接传入 catch 中的 error 即可
 *
 * @example
 * ```tsx
 * const handleAIError = useAIErrorHandler('AI 摘要');
 * summarize(text).catch(handleAIError);
 * ```
 */
export function useAIErrorHandler(context: string) {
  const { toast } = useToast();

  return useCallback((error: unknown) => {
    const aiError = classifyRawError(error, 'fetch');
    toast({ type: 'error', message: `${context}：${aiError.message}` });
  }, [context, toast]);
}
