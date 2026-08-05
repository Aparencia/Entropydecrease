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
  const [isDirty, setIsDirty] = useState(false);
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
      setIsDirty(true);
      debounceRef.current = setTimeout(async () => {
        if (noteId) {
          setSaveStatus('saving');
          try {
            // 序列化延迟到防抖回调内执行：避免每次键入都同步 JSON.stringify
            // 整个文档（含 base64 图片可达数 MB）阻塞主线程，仅保存时序列化一次。
            await updateNote(noteId, { content: getContent() });
            soundPlayer.play('note_autosave');
            setSaveStatus('saved');
            setIsDirty(false);
            if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
            saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVE_STATUS_HIDE_DELAY_MS);
          } catch {
            setSaveStatus('failed');
            // 保存失败不清除 dirty 标记，下次保存仍会尝试
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

  // 编辑器生命周期由 @tiptap/react v3 useEditor 托管：其 scheduleDestroy 延迟
  // 销毁机制可抵御 React 18 StrictMode 双调用（自定义 destroy effect 会在
  // 双调用 cleanup 阶段同步销毁实例，导致后续 effect 拿到 schema=null 的
  // 已销毁编辑器而崩溃），卸载时 v3 会在下一 tick 自动销毁。

  // 切换笔记时更新编辑器内容（useEditor 的 content 只在初始化时消费一次）
  // 使用 emitUpdate:false 避免触发 onUpdate → debouncedSave 误保存
  // 注意：TipTap v3.27 的 History 命令仅 undo/redo，无 clearHistory（v2 遗留 API），
  // 调用会抛 "Command not found"——切换后不重置历史栈（setContent 后 undo 行为
  // 由 v3 托管，跨笔记撤销属可接受边界，避免运行时崩溃）。
  useEffect(() => {
    if (!editor || !initialContent) return;
    // 避免在首次挂载时重复设置（此时编辑器内容已由 content prop 初始化）
    const currentJson = editor.getJSON();
    if (JSON.stringify(currentJson) === JSON.stringify(initialContent)) return;
    editor.commands.setContent(initialContent, { emitUpdate: false });
  }, [editor, noteKey, initialContent]);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    // 先清空 input 以便重复选择同一文件
    e.target.value = '';
    const src = await compressImageForNote(file);
    editor.chain().focus().setImage({ src }).run();
  }, [editor]);

  return { editor, saveStatus, isDirty, debouncedSave, handleImageSelect };
}
