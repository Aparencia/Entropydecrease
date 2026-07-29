/**
 * 笔记 TipTap 编辑器实例与自动保存 hook
 *
 * @ai-context: 从 NoteEditPage 拆出。扩展集合为编辑能力契约（表格/任务
 * 列表/图片/对齐/颜色/高亮）；内容以 TipTap JSON 字符串持久化，
 * 解析失败回退 undefined 让编辑器空开而非崩溃。
 * 自动保存 500ms debounce，保存状态"已保存"2s 后自动隐藏；卸载时清理
 * 两个定时器与 editor 实例（切换笔记时避免残留监听）。
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Image } from '@tiptap/extension-image';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import type { SaveStatus } from '../components/NoteEditHeader';

const SAVE_STATUS_HIDE_DELAY_MS = 2000;
const AUTOSAVE_DEBOUNCE_MS = 500;

interface UseNoteEditorOptions {
  noteId: string | null;
  /** 笔记正文（TipTap JSON 字符串） */
  rawContent: string | undefined;
  /** 随 note.id 变化重建初始内容 */
  noteKey: string | undefined;
  updateNote: (id: string, changes: { content: string }) => Promise<void> | void;
}

export function useNoteEditor({ noteId, rawContent, noteKey, updateNote }: UseNoteEditorOptions) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 解析初始内容（仅在切换笔记时重算）
  const initialContent = useMemo(() => {
    if (!rawContent) return undefined;
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && parsed.type === 'doc') return parsed;
      return undefined;
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在 note.id 变化时重新计算
  }, [noteKey]);

  const debouncedSave = useCallback(
    (content: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (noteId) {
          setSaveStatus('saving');
          try {
            await updateNote(noteId, { content });
            soundPlayer.play('note_autosave');
            setSaveStatus('saved');
            if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVE_STATUS_HIDE_DELAY_MS);
          } catch {
            setSaveStatus('failed');
          }
        }
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [noteId, updateNote],
  );

  // 清理 debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      // Underline 已由 StarterKit 内置，无需重复引入
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({ placeholder: '开始记录你的笔记...' }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'todo-item' } }),
      Image.configure({ inline: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      TextStyle,
    ],
    content: initialContent,
    onUpdate: ({ editor: e }) => {
      debouncedSave(JSON.stringify(e.getJSON()));
    },
  });

  // 确保编辑器在组件卸载或笔记切换时正确销毁
  useEffect(() => {
    return () => {
      if (editor) {
        editor.destroy();
      }
    };
  }, [editor]);

  /** 图片上传（读为 base64 内嵌） */
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  }, [editor]);

  return { editor, saveStatus, debouncedSave, handleImageSelect };
}
