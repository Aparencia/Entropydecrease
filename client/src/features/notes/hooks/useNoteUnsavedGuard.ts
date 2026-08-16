/**
 * 未保存更改导航守卫 hook（M19）
 * Unsaved-changes navigation guard hook (M19)
 *
 * @ai-context: 从 NoteEditPage 拆出。beforeunload（关闭标签页/刷新）与
 * useBlocker（应用内导航）双守卫：导航被拦截时由页面弹确认框，确认"保存并
 * 离开"走 handleSaveAndLeave（文本模板立即落盘后再放行；free/mindmap/cornell
 * 走各自防抖保存管线，卸载清空为既有行为，直接放行）。proceed 仅在 blocked
 * 态存在（unblocked/proceeding 为 undefined），显式收窄避免 TS2722。
 * @ai-context: Extracted from NoteEditPage. Dual guard: beforeunload (tab
 * close/refresh) + useBlocker (in-app navigation); when blocked the page shows
 * a confirm dialog, and "save & leave" runs handleSaveAndLeave (text templates
 * persist immediately; free/mindmap/cornell rely on their debounced pipelines
 * — flush-on-unmount is existing behavior — and pass through). proceed exists
 * only in the blocked state (unblocked/proceeding are undefined), narrowed
 * explicitly to avoid TS2722.
 */
import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import type { Note } from '@/types/models';
import type { SaveStatus } from '../components/NoteEditHeader';

interface UseNoteUnsavedGuardOptions {
  isDirty: boolean;
  saveStatus: SaveStatus;
  editor: Editor | null;
  noteId: string | null;
  note: Note | null;
  titleRef: React.RefObject<HTMLInputElement>;
  updateNote: (id: string, changes: Partial<Note>) => Promise<void>;
}

/**
 * 返回导航拦截 blocker 与"保存并离开"处理器。
 * Returns the navigation blocker and save-and-leave handler.
 */
export function useNoteUnsavedGuard({ isDirty, saveStatus, editor, noteId, note, titleRef, updateNote }: UseNoteUnsavedGuardOptions) {
  // 编辑未保存确认：beforeunload（关闭标签页）+ useBlocker（应用内导航）
  const hasPendingChanges = isDirty || saveStatus === 'saving' || saveStatus === 'failed';
  useEffect(() => {
    if (!hasPendingChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasPendingChanges]);
  // M19: 捕获 blocker——导航被拦截时弹确认框，而不是静默卡住页面
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        hasPendingChanges && currentLocation.pathname !== nextLocation.pathname,
      [hasPendingChanges],
    ),
  );

  // M19: 保存并离开——文本模板立即落盘后再放行；自由画布/导图/康奈尔走各自
  // 防抖保存管线（卸载清空为既有行为），此处直接放行
  const handleSaveAndLeave = () => {
    if (editor && noteId && note && !['free', 'mindmap', 'cornell'].includes(note.template)) {
      updateNote(noteId, {
        content: JSON.stringify(editor.getJSON()),
        title: titleRef.current?.value || note?.title,
      });
    }
    // 基线修复：proceed 仅在 blocked 态存在（unblocked/proceeding 为 undefined），
    // 确认框只在 blocked 时展示，此处仍显式收窄避免 TS2722
    if (blocker.state === 'blocked') blocker.proceed();
  };

  return { blocker, handleSaveAndLeave };
}
