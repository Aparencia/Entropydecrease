/**
 * 笔记 TipTap 编辑器实例与自动保存 hook
 *
 * @ai-context: 从 NoteEditPage 拆出。扩展集合为编辑能力契约（表格/任务
 * 列表/图片/对齐/颜色/高亮）；内容以 TipTap JSON 字符串持久化，
 * 解析失败回退 undefined 让编辑器空开而非崩溃。
 * 自动保存 2s idle debounce + 内容变更检测 + visibilitychange/blur 即时落盘，
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
import { insertImageFile } from '../lib/insertImage';
import type { SaveStatus } from '../components/NoteEditHeader';

const SAVE_STATUS_HIDE_DELAY_MS = 2000;
/** 小文档防抖窗口（ms）：content 低于大文档阈值时的保存节奏 */
const AUTOSAVE_DEBOUNCE_SMALL_MS = 1000;
/** 大文档防抖窗口（ms）：content 超阈值时延长，降低数 MB 大写入频率 */
const AUTOSAVE_DEBOUNCE_LARGE_MS = 2500;
/** 大文档判定阈值（字节）：content 长度（含 base64 图片）超过即视为大文档 */
const LARGE_DOCUMENT_BYTES = 512 * 1024;
/** idle 调度兜底超时（ms）：requestIdleCallback 持续无空闲时强制执行的时限 */
const IDLE_TIMEOUT_MS = 3000;

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
  const lastSavedContentRef = useRef<string>('');
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);

  // 解析初始内容（切换笔记或全文惰性加载完成时重算；
  // P1-1：rawContent 随 getById 到达从 undefined → 全文）
  const initialContent = useMemo(() => {
    if (!rawContent) return undefined;
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && parsed.type === 'doc') {
        lastSavedContentRef.current = rawContent;
        return parsed;
      }
      return undefined;
    } catch {
      return undefined;
    }
    // Why: noteKey 依赖是刻意的——切换笔记时即使 rawContent 字符串相同（如两篇
    // 笔记内容恰好一致），也需重建 initialContent 让编辑器 setContent 刷新；
    // 移除 noteKey 会导致内容相同的笔记间切换不重置编辑内容。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [noteKey, rawContent]);

  const debouncedSave = useCallback(
    (getContent: () => string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setIsDirty(true);
      // P0-4 写库调度：防抖窗口按已保存内容大小自适应（lastSavedContentRef
      // 无需序列化即可估算长度），回调经 requestIdleCallback 在空闲帧执行——
      // 打字交互期间不触发数 MB 的 IndexedDB 写入与 JSON 序列化，
      // 持续忙碌时由 timeout 兜底保证最终落盘。
      const debounceMs = lastSavedContentRef.current.length > LARGE_DOCUMENT_BYTES
        ? AUTOSAVE_DEBOUNCE_LARGE_MS
        : AUTOSAVE_DEBOUNCE_SMALL_MS;
      debounceRef.current = setTimeout(() => {
        const run = async () => {
          if (noteId) {
            const contentStr = getContent();
            // 内容变更检测：无变化则跳过保存
            if (contentStr === lastSavedContentRef.current) {
              setIsDirty(false);
              return;
            }
            setSaveStatus('saving');
            try {
              // 序列化延迟到防抖回调内执行：避免每次键入都同步 JSON.stringify
              // 整个文档（含 base64 图片可达数 MB）阻塞主线程，仅保存时序列化一次。
              await updateNote(noteId, { content: contentStr });
              lastSavedContentRef.current = contentStr;
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
        };
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(() => { void run(); }, { timeout: IDLE_TIMEOUT_MS });
        } else {
          void run();
        }
      }, debounceMs);
    },
    [noteId, updateNote],
  );

  /** 立即保存未落盘的内容（用于 blur、visibilitychange 等场景） */
  const flushPendingSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (noteId && editorRef.current && isDirty) {
      const contentStr = JSON.stringify(editorRef.current.getJSON());
      if (contentStr !== lastSavedContentRef.current) {
        setSaveStatus('saving');
        // updateNote 签名允许返回 void（同步保存路径），Promise.resolve 统一链式处理
        Promise.resolve(updateNote(noteId, { content: contentStr })).then(() => {
          lastSavedContentRef.current = contentStr;
          setSaveStatus('saved');
          setIsDirty(false);
          if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
          saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), SAVE_STATUS_HIDE_DELAY_MS);
        }).catch(() => {
          setSaveStatus('failed');
        });
      }
    }
  }, [noteId, isDirty, updateNote]);

  // 页面可见性变化时保存（标签页切换/隐藏时触发）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [flushPendingSave]);

  // 浏览器关闭/刷新时同步保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

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
      editorRef.current = e;
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
  // P0-3 优化：initialContent 字符串一次化缓存，切换笔记时不再双 JSON.stringify
  const initialContentStr = useMemo(
    () => (initialContent ? JSON.stringify(initialContent) : ''),
    [initialContent],
  );
  useEffect(() => {
    if (!editor || !initialContent) return;
    // 避免在首次挂载时重复设置（此时编辑器内容已由 content prop 初始化）
    const currentJson = editor.getJSON();
    if (JSON.stringify(currentJson) === initialContentStr) return;
    editor.commands.setContent(initialContent, { emitUpdate: false });
  }, [editor, noteKey, initialContent, initialContentStr]);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    // 先清空 input 以便重复选择同一文件
    e.target.value = '';
    await insertImageFile(editor, file);
  }, [editor]);

  /** 由外部 File 直接插入（Capacitor 相机/相册选取路径） */
  const insertImageFromFile = useCallback(
    (file: File) => {
      if (!editor) return;
      return insertImageFile(editor, file);
    },
    [editor],
  );

  return { editor, saveStatus, isDirty, debouncedSave, flushPendingSave, handleImageSelect, insertImageFromFile };
}
