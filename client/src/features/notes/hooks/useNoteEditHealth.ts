/**
 * 编辑器实时文本健康度追踪 hook（N3）
 * Editor live-text health tracking hook (N3)
 *
 * @ai-context: 从 NoteEditPage 拆出。跟踪编辑器实时文本供工具栏指示器/合书
 * 测试/内容分层/锚点侧边栏等消费。流畅度修复：原版每次键入同步 setHealthText
 * 导致整页每键重渲染；现改为 1s 防抖 + 打开消费面板时惰性取最新快照
 * （refreshHealthText）。同时提供阅读模式排版的内容难度估算（1-5 文本长度启发式）。
 * @ai-context: Extracted from NoteEditPage. Tracks live editor text for the
 * toolbar indicator / closed-book test / content-tiering / anchor sidebar.
 * Fluidity fix: the original set healthText on every keystroke (full-page
 * re-render per key); now 1s-debounced plus a lazy latest-snapshot refresh
 * (refreshHealthText) when a consumer panel opens. Also derives the reading
 * typography content difficulty (1-5 heuristic on text length).
 */
import { useEffect, useMemo, useCallback, useState } from 'react';
import type { Editor } from '@tiptap/react';

/**
 * 返回实时文本、惰性刷新器与阅读难度分。
 * Returns live text, lazy refresher and reading difficulty score.
 *
 * @param editor - TipTap 编辑器实例（可能为 null）
 */
export function useNoteEditHealth(editor: Editor | null) {
  // === N3 笔记健康度：跟踪编辑器实时文本供工具栏指示器计算 ===
  // 流畅度修复：原版每次键入同步 setHealthText 导致 457 行整页每键重渲染。
  // 现改为 1s 防抖 + 打开消费面板时惰性取最新快照，键入路径不再触发整页重渲染
  const [healthText, setHealthText] = useState('');
  useEffect(() => {
    // @ai-context: StrictMode 双调用下编辑器可能处于已销毁态（schema=null），
    // getText 会抛 TypeError，此处双重防御。
    if (!editor || editor.isDestroyed) return;
    setHealthText(editor.getText());
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onHealthUpdate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setHealthText(editor.getText()), 1000);
    };
    editor.on('update', onHealthUpdate);
    return () => {
      editor.off('update', onHealthUpdate);
      if (timer) clearTimeout(timer);
    };
  }, [editor]);

  /** 惰性快照：打开消费 healthText 的面板前取编辑器最新文本，避免防抖窗口内数据滞后 */
  const refreshHealthText = useCallback(() => {
    if (editor) setHealthText(editor.getText());
  }, [editor]);

  // === 阅读模式排版：内容难度估算（1-5，文本长度启发式）→ 自适应 CSS 变量 ===
  const contentDifficulty = useMemo(() => {
    const len = (healthText || '').trim().length;
    if (len < 200) return 1;
    if (len < 600) return 2;
    if (len < 1200) return 3;
    if (len < 2000) return 4;
    return 5;
  }, [healthText]);

  return { healthText, refreshHealthText, contentDifficulty };
}
