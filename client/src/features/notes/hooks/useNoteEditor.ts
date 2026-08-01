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
import { WikiLink } from '../components/editor/WikiLink';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { compressImageForNote } from '../lib/imageCompress';
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
    (getContent: () => string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (noteId) {
          setSaveStatus('saving');
          try {
            // 序列化延迟到防抖回调内执行：避免每次键入都同步 JSON.stringify
            // 整个文档（含 base64 图片可达数 MB）阻塞主线程，仅保存时序列化一次。
            await updateNote(noteId, { content: getContent() });
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
      Image.configure({ inline: true, HTMLAttributes: { loading: 'lazy' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Color,
      TextStyle,
      WikiLink,
    ],
    content: initialContent,
    // TipTap v3 不再自动给编辑元素加 tiptap 类（v2 会自动加），
    // 需显式声明，否则 index.css 中 .tiptap 前缀的表格/任务列表/图片等样式全部失效。
    editorProps: { attributes: { class: 'tiptap' } },
    onUpdate: ({ editor: e }) => {
      // 传入 getter 而非预序列化字符串：getJSON/stringify 延迟到防抖回调内执行
      debouncedSave(() => JSON.stringify(e.getJSON()));
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

  /** 图片上传（P2-10：大图压缩降采样后读为 base64 内嵌，小图原样） */
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    // 先清空 input 以便重复选择同一文件
    e.target.value = '';
    const src = await compressImageForNote(file);
    editor.chain().focus().setImage({ src }).run();
  }, [editor]);

  return { editor, saveStatus, debouncedSave, handleImageSelect };
}
