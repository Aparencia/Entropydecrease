/**
 * 笔记编辑页动作处理器 hook（标题/保存/面板入口）
 * Note-edit page action handlers hook (title/save/panel entries)
 *
 * @ai-context: 从 NoteEditPage 拆出。承载标题保存（blur 差异检测 + Enter 失焦
 * 提交）、手动保存（落盘 + note_manual_save 音效）、合书测试/滚书背诵/内容分层
 * 入口（先取最新文本快照再打开，healthText 为防抖值可能滞后 ≤1s）、信息图生成
 * 入口（实时文本 <20 字符时 toast 拦截）、Markdown 导出（实现见 lib/noteExportImport）。
 * 纯编排转发：不持有状态，全部依赖由页面注入。
 * @ai-context: Extracted from NoteEditPage. Holds title saving (blur with
 * diff-check + Enter-blur submit), manual save (persist + note_manual_save
 * sound), closed-book/rolling-recall/content-tier entries (refresh the latest
 * text snapshot first — healthText is debounced and may lag ≤1s), infographic
 * entry (toast guard when live text <20 chars) and Markdown export (impl in
 * lib/noteExportImport). Pure orchestration: holds no state, all deps injected.
 */
import { useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import type { Note } from '@/types/models';
import { useToast } from '@/components/ui';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { exportNoteAsMarkdown } from '../lib/noteExportImport';

interface UseNoteEditActionsOptions {
  editor: Editor | null;
  noteId: string | null;
  note: Note | null;
  titleRef: React.RefObject<HTMLInputElement>;
  updateNote: (id: string, changes: Partial<Note>) => Promise<void>;
  refreshHealthText: () => void;
  setClosedBook: (v: boolean) => void;
  setRecallOpen: (v: boolean) => void;
  setTierOpen: (v: boolean) => void;
  setInfographicOpen: (v: boolean) => void;
  generateInfographic: (topic: string, style?: 'academic' | 'tech' | 'warm') => Promise<unknown>;
  fullContent: string | undefined;
}

/**
 * 返回页面级动作处理器集合。
 * Returns the page-level action handler collection.
 */
export function useNoteEditActions({
  editor, noteId, note, titleRef, updateNote,
  refreshHealthText, setClosedBook, setRecallOpen, setTierOpen, setInfographicOpen,
  generateInfographic, fullContent,
}: UseNoteEditActionsOptions) {
  const { toast } = useToast();

  // 标题保存
  const handleTitleBlur = () => {
    if (noteId && titleRef.current) {
      const newTitle = titleRef.current.value.trim();
      if (newTitle && newTitle !== note?.title) {
        updateNote(noteId, { title: newTitle });
      }
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      titleRef.current?.blur();
    }
  };

  const handleManualSave = () => {
    if (!editor || !noteId) return;
    updateNote(noteId, {
      content: JSON.stringify(editor.getJSON()),
      title: titleRef.current?.value || note?.title,
    });
    soundPlayer.play('note_manual_save');
  };

  // 合书测试入口：先同步最新文本快照再打开（healthText 为防抖值，可能滞后≤ 1s）
  const handleOpenClosedBook = useCallback(() => {
    refreshHealthText();
    setClosedBook(true);
  }, [refreshHealthText, setClosedBook]);

  // 滚书背诵入口：与合书测试同策略，先取最新快照再打开
  const handleOpenRollingRecall = useCallback(() => {
    refreshHealthText();
    setRecallOpen(true);
  }, [refreshHealthText, setRecallOpen]);

  // 知识信息图入口：取编辑器实时文本调用 AI 网关；hook 内部失败时回退默认图
  const handleGenerateInfographic = useCallback(async () => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (text.length < 20) {
      toast({ type: 'info', message: '笔记内容太少，先写一些内容再生成信息图' });
      return;
    }
    setInfographicOpen(true);
    await generateInfographic(note?.title || '笔记', 'academic');
  }, [editor, note?.title, generateInfographic, setInfographicOpen, toast]);

  // 内容分层入口：同理先取最新快照
  const handleOpenTier = useCallback(() => {
    refreshHealthText();
    setTierOpen(true);
  }, [refreshHealthText, setTierOpen]);

  // 阶段四：导出当前笔记为 Markdown（实现见 lib/noteExportImport）
  const handleExportMarkdown = () => {
    if (!note) return;
    void exportNoteAsMarkdown(note, fullContent);
  };

  return {
    handleTitleBlur, handleTitleKeyDown, handleManualSave,
    handleOpenClosedBook, handleOpenRollingRecall,
    handleGenerateInfographic, handleOpenTier, handleExportMarkdown,
  };
}
