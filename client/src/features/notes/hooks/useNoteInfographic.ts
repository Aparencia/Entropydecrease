/**
 * 知识信息图生成 hook（弹窗开关 + AI 调用 + 降级提示）
 * Infographic generation hook (dialog toggle + AI call + fallback toast)
 *
 * @ai-context: 从 NoteEditPage 拆出。承载信息图弹窗开关、useAIInfographic 状态
 * （AI 网关不可用时 hook 内部回退默认图，优雅降级）与降级 toast（网关不可用时
 * 温和告知，结果仍展示默认图不阻断）。生成入口 handleGenerateInfographic 仍在
 * 页面 actions 中编排。
 * @ai-context: Extracted from NoteEditPage. Holds the infographic dialog
 * toggle, useAIInfographic state (graceful fallback to a default graphic when
 * the AI gateway is unavailable) and the fallback toast (gentle notice; the
 * default graphic still renders, nothing blocked). The generation entry
 * handleGenerateInfographic stays orchestrated in the page actions.
 */
import { useEffect, useState } from 'react';
import { useAIInfographic } from '@/lib/ai/hooks/useAIInfographic';
import { useToast } from '@/components/ui';

/**
 * 返回信息图弹窗开关与生成状态。
 * Returns infographic dialog toggle and generation state.
 */
export function useNoteInfographic() {
  // === 知识信息图生成（AI 网关不可用时 hook 内部回退默认图，优雅降级）===
  const [infographicOpen, setInfographicOpen] = useState(false);
  const {
    infographic,
    loading: infographicLoading,
    error: infographicError,
    isFallback,
    generateInfographic,
  } = useAIInfographic();
  const { toast } = useToast();

  // AI 信息图降级提示：网关不可用时 toast 温和告知（结果仍展示默认图，不阻断）
  useEffect(() => {
    if (infographicError) {
      toast({ type: 'info', message: infographicError, duration: 3000 });
    }
  }, [infographicError, toast]);

  return {
    infographicOpen, setInfographicOpen,
    infographic, infographicLoading, infographicError, isFallback,
    generateInfographic,
  };
}
