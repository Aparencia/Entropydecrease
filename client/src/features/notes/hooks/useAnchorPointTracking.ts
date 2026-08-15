/**
 * 记忆锚点自动触发 hook
 * Memory anchor auto-trigger hook
 *
 * @ai-context: 从 NoteEditPage 拆出。策略：追踪用户编辑活跃度，每 12 分钟
 * 活跃编辑后自动触发 AI 锚点生成。活跃度基于编辑器 onUpdate 回调——每次编辑
 * 重置 30 秒无操作计时器，定时器每 5 秒累计活跃时间，达到阈值且正文 >100
 * 字符时调用 useAIAnchorPoint 生成锚点并重置计时器。返回锚点列表（引用变化
 * 即触发侧边栏重渲染）。阈值常量模块级声明，引用稳定可直接进依赖数组。
 * @ai-context: Extracted from NoteEditPage. Tracks edit activity via editor
 * onUpdate: each edit resets a 30s idle timer; a 5s interval accrues active
 * time until the 12min threshold; AI anchor points are then generated (body
 * >100 chars) and the accumulator resets. Returns the anchor list; a new
 * reference triggers the sidebar re-render. Thresholds are module-level
 * constants (stable references, safe in dependency arrays).
 */
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useAIAnchorPoint } from '@/lib/ai/hooks/useAIAnchorPoint';

/** 记忆锚点自动触发策略参数（模块级常量，引用稳定，可直接进入依赖数组） */
const ANCHOR_ACTIVE_THRESHOLD_MS = 12 * 60 * 1000; // 12 分钟活跃编辑阈值
const ANCHOR_IDLE_TIMEOUT_MS = 30 * 1000; // 30 秒无操作视为暂停

/**
 * 追踪编辑活跃度并自动生成记忆锚点。
 * Tracks edit activity and auto-generates memory anchor points.
 *
 * @param editor - TipTap 编辑器实例（可能为 null）
 * @param noteId - 当前笔记 id（null 时不启动定时器）
 * @returns 锚点列表（N4：携带 importance 供费曼引导）
 */
export function useAnchorPointTracking(
  editor: Editor | null,
  noteId: string | null,
): Array<{ id: string; concept: string; explanation?: string; createdAt: string; importance?: number }> {
  const anchorAI = useAIAnchorPoint();
  const anchorActiveTimeRef = useRef(0); // 累计活跃编辑时间（毫秒）
  const anchorLastEditRef = useRef(Date.now()); // 上次编辑时间戳
  const anchorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [anchorPoints, setAnchorPoints] = useState<Array<{ id: string; concept: string; explanation?: string; createdAt: string; importance?: number }>>([]);

  // 编辑器活跃跟踪定时器：每 5 秒检查累计活跃时间
  useEffect(() => {
    if (!editor || !noteId) return;

    // 监听编辑器 onUpdate 事件，重置上次编辑时间
    const handleUpdate = () => { anchorLastEditRef.current = Date.now(); };
    editor.on('update', handleUpdate);

    // 定时累计活跃编辑时间，达到阈值时触发锚点生成
    anchorTimerRef.current = setInterval(async () => {
      const now = Date.now();
      // 如果 30 秒内有编辑操作，累加活跃时间
      if (now - anchorLastEditRef.current < ANCHOR_IDLE_TIMEOUT_MS) {
        anchorActiveTimeRef.current += 5000; // 每 5 秒累加
      }
      // 活跃时间超过阈值且笔记内容足够时，触发 AI 锚点生成
      if (anchorActiveTimeRef.current >= ANCHOR_ACTIVE_THRESHOLD_MS) {
        const text = editor.getText();
        if (text.trim().length > 100) {
          const result = await anchorAI.generateAnchorPoints(noteId, text);
          if (result?.anchorPoints) {
            // 将 AI 锚点转换为侧边栏组件所需格式（N4：携带 importance 供费曼引导）
            const mapped = result.anchorPoints.map((ap, i) => ({
              id: `${noteId}-anchor-${Date.now()}-${i}`,
              concept: ap.concept,
              explanation: ap.explanation,
              createdAt: new Date().toISOString(),
              importance: ap.importance,
            }));
            setAnchorPoints((prev) => [...prev, ...mapped]);
          }
        }
        // 重置活跃时间计时器，开始下一轮累计
        anchorActiveTimeRef.current = 0;
      }
    }, 5000);

    return () => {
      editor.off('update', handleUpdate);
      if (anchorTimerRef.current) clearInterval(anchorTimerRef.current);
    };
  }, [editor, noteId, anchorAI]);

  return anchorPoints;
}
