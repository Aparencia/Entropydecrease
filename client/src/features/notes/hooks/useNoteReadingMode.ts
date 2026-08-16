/**
 * 阅读模式排版 hook（自适应排版 + 只读切换）
 * Reading-mode typography hook (adaptive layout + read-only toggle)
 *
 * @ai-context: 从 NoteEditPage 拆出。readingMode 开关 + 自适应排版 CSS 变量
 * （useAdaptiveTypography：基于内容难度与 reduced-motion 动态计算字体/行距/
 * 引导线颜色）+ 只读切换（开启=setEditable(false)，关闭/卸载=恢复可编辑；
 * StrictMode 双挂载/路由切换遗留只读态由卸载兜底恢复）。
 * @ai-context: Extracted from NoteEditPage. readingMode toggle + adaptive
 * typography CSS vars (useAdaptiveTypography: dynamic font/line-height/guide
 * color from content difficulty and reduced-motion) + read-only switch (on =
 * setEditable(false); off/unmount restores editable; unmount cleanup guards
 * against a stuck read-only state after StrictMode double-mount/route switch).
 */
import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useAdaptiveTypography, type TypographyCSSVariables } from '@/hooks/useAdaptiveTypography';

/**
 * 返回阅读模式开关、切换器与排版 CSS 变量。
 * Returns reading-mode toggle and typography CSS variables.
 *
 * @param editor - TipTap 编辑器实例（可能为 null）
 * @param contentDifficulty - 内容难度 1-5（阅读模式排版用）
 */
export function useNoteReadingMode(editor: Editor | null, contentDifficulty: number) {
  // === 阅读模式（自适应排版 + 阅读引导线）===
  const [readingMode, setReadingMode] = useState(false);

  const typographyVars: TypographyCSSVariables = useAdaptiveTypography({
    contentDifficulty,
    enableReadingGuide: readingMode,
  });

  // 阅读模式：切换编辑器可编辑态（开启=只读，关闭/卸载=恢复可编辑）
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!readingMode);
  }, [editor, readingMode]);

  // 卸载时兜底恢复可编辑（防 StrictMode 双挂载/路由切换遗留只读态）
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) editor.setEditable(true);
    };
  }, [editor]);

  return { readingMode, setReadingMode, typographyVars };
}
