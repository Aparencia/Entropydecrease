import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
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
import {
  ArrowLeft, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Highlighter, Heading1, Heading2, Heading3, List, ListOrdered,
  Code, Quote, Undo2, Redo2, Save, Sparkles, X,
  Copy, RefreshCw, Download, ChevronDown, Check,
  Table2, ListTodo, ImageIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AIButton } from '@/components/ui/AIButton';
import { useNoteStore } from '../store/useNoteStore';
import { useShallow } from 'zustand/react/shallow';
import { CornellLayout } from '../components/CornellLayout';
import FreeCanvas from '../components/FreeCanvas';
import type { FreeCanvasData } from '@/types/models';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import { useAISummarize, useAIFlashcards } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { useToast } from '@/components/ui';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/lib/contextMenu';
import { CaptureSidebar } from '../components/CaptureSidebar';
import { TodoStats } from '../components/TodoStats';
import { useCaptureStore } from '@/stores/useCaptureStore';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { RescuePanel } from '@/components/RescuePanel';
import { useStuckTimer } from '@/hooks/useStuckTimer';

const SAVE_STATUS_HIDE_DELAY_MS = 2000;
const AUTOSAVE_DEBOUNCE_MS = 500;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

/** 保存成功微粒子动效 — 3-5个品牌色粒子从中心扩散 */
function SaveParticles({ show }: { show: boolean }) {
  if (!show) return null;
  const particles = Array.from({ length: 4 }, (_, i) => {
    const angle = (i / 4) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 12 + Math.random() * 8;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      delay: i * 30,
      size: 3 + Math.random() * 2,
    };
  });
  return (
    <span className="absolute inset-0 pointer-events-none overflow-visible flex items-center justify-center">
      {particles.map((p, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-brand-500 animate-[particle-burst_200ms_ease-out_forwards]"
          style={{
            width: p.size,
            height: p.size,
            '--px': `${p.x}px`,
            '--py': `${p.y}px`,
            animationDelay: `${p.delay}ms`,
            opacity: 0.9,
          } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

interface ToolbarButtonProps {
  icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon: Icon, label, isActive, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        'p-kb-sm rounded-kb-sm transition-all duration-kb-fast',
        isActive
          ? 'bg-brand-50 text-brand-600'
          : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary',
        'active:bg-bg-secondary active:scale-95',
      )}
    >
      <Icon className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-border/50 mx-1" />;
}

export default function NoteEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const noteId = id ?? null;
  const captureOpen = useCaptureStore((s) => s.open);

  // === 卡壳救援 ===
  const [rescueOpen, setRescueOpen] = useState(false);
  const stuckTimer = useStuckTimer({
    onThreshold: () => {
      window.dispatchEvent(new Event('rescue:show-incubation'));
    },
  });

  const { notes, updateNote, selectNote, loadNotes } = useNoteStore(useShallow(s => s));
  const note = notes.find((n) => n.id === noteId) || null;

  const titleRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI 闪卡持久化
  const { loadDecks, createDeck, createCard } = useFlashcardStore(useShallow(s => s));

  // 获取目标牌组：优先使用已有牌组，否则自动创建默认牌组
  const ensureDefaultDeck = useCallback(async (): Promise<string> => {
    await loadDecks();
    const currentDecks = useFlashcardStore.getState().decks;
    if (currentDecks.length > 0) return currentDecks[0].id;
    return createDeck('AI 闪卡', '由笔记 AI 自动生成的闪卡');
  }, [loadDecks, createDeck]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI Summary state
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const { loading: aiLoading, data: aiData, error: aiError, needsConfig: aiNeedsConfig, summarize } = useAISummarize();
  const { toast } = useToast();

  const handleFlashcardError = useAIErrorHandler('AI 闪卡生成失败');

  // 选中文本右键菜单 hook
  const {
    isOpen: editorCtxOpen,
    position: editorCtxPos,
    context: editorSelectedText,
    handleContextMenu: handleEditorContextMenu,
    close: closeEditorCtx,
  } = useContextMenu<string>();

  // AI 摘要后续操作 hooks
  const { loading: flashcardLoading, generate: generateFlashcards } = useAIFlashcards();
  const handleSummarizeError = useAIErrorHandler('AI 摘要生成失败');
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [convertedKeys, setConvertedKeys] = useState<Set<number>>(new Set());
  const imageInputRef = useRef<HTMLInputElement>(null);

  // === AI 摘要操作辅助函数 ===

  const buildSummaryText = useCallback((data: NonNullable<typeof aiData>) => {
    let text = data.summary;
    if (data.keyPoints && data.keyPoints.length > 0) {
      text += '\n\n关键要点：\n' + data.keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n');
    }
    return text;
  }, []);

  // 解析初始内容
  const initialContent = useMemo(() => {
    if (!note?.content) return undefined;
    try {
      const parsed = JSON.parse(note.content);
      if (parsed && parsed.type === 'doc') return parsed;
      return undefined;
    } catch {
      return undefined;
    }
  // 只在 note.id 变化时重新计算
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // 解析自由画布数据
  const freeCanvasData = useMemo<FreeCanvasData | null>(() => {
    if (!note?.content || note?.template !== 'free') return null;
    try {
      const parsed = JSON.parse(note.content);
      if (parsed && parsed.blocks) return {
        blocks: parsed.blocks,
        canvasWidth: parsed.canvasWidth ?? 3000,
        canvasHeight: parsed.canvasHeight ?? 3000,
      };
      return null;
    } catch { return null; }
  }, [note?.id, note?.content, note?.template]);

  // debounce 保存函数
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
      const json = e.getJSON();
      const contentStr = JSON.stringify(json);
      debouncedSave(contentStr);
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

  // 选中文本右键菜单分组
  const editorCtxGroups = useMemo<ContextMenuGroup[]>(() => [
    {
      label: 'AI 操作',
      items: [
        { key: 'ai-flashcard', label: '生成闪卡', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'ai-explain', label: '解释概念' },
        { key: 'ai-distill', label: '提炼要点' },
        { key: 'ai-highlight', label: '高亮标记' },
      ],
    },
  ], []);

  // 选中文本菜单回调
  const handleEditorCtxSelect = useCallback((itemKey: string, selectedText: string) => {
    if (!editor || !selectedText) return;

    switch (itemKey) {
      case 'ai-flashcard':
        // 复用现有 generateFlashcards 逻辑
        generateFlashcards(selectedText)
          .then(async (result) => {
            if (!result) throw new Error('generate failed');
            const targetDeckId = await ensureDefaultDeck();
            await Promise.all(
              result.cards.map((card) =>
                createCard({ deckId: targetDeckId, front: card.front, back: card.back, type: 'basic', sourceNoteId: noteId ?? undefined }),
              ),
            );
            toast({ type: 'success', message: `已生成 ${result.cards.length} 张闪卡`, silent: true });
          })
          .catch(handleFlashcardError);
        break;
      case 'ai-explain':
        // TODO [v0.5.0-B1.4]: 调用 AI 解释选中概念 — 需调用 summarize API 并展示解释结果
        toast({ type: 'info', message: 'AI 解释功能即将上线' });
        break;
      case 'ai-distill':
        // TODO [v0.5.0-B1.4]: 调用 AI 提炼要点 — 需调用 summarize API 提取关键点
        toast({ type: 'info', message: 'AI 提炼功能即将上线' });
        break;
      case 'ai-highlight':
        // 使用 TipTap 高亮命令直接标记选中文本
        editor.chain().focus().toggleHighlight().run();
        break;
    }
  }, [editor, generateFlashcards, ensureDefaultDeck, createCard, toast, handleFlashcardError]);

  // 图片上传处理
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      editor.chain().focus().setImage({ src: base64 }).run();
    };
    reader.readAsDataURL(file);
    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  }, [editor]);

  const handleInsertNote = useCallback((position: 'cursor' | 'start' | 'end') => {
    if (!editor || !aiData) return;
    const text = buildSummaryText(aiData);
    const htmlContent = text.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('');
    if (position === 'cursor') {
      editor.chain().focus().insertContent(htmlContent).run();
    } else if (position === 'start') {
      const currentHTML = editor.getHTML();
      editor.chain().focus().setContent(htmlContent + currentHTML).run();
    } else {
      const docSize = editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(docSize, htmlContent).run();
    }
    setInsertMenuOpen(false);
    setSummaryModalOpen(false);
    toast({ type: 'success', message: '摘要已插入笔记' });
  }, [editor, aiData, buildSummaryText, toast]);

  const handleCopySummary = useCallback(() => {
    if (!aiData) return;
    navigator.clipboard.writeText(buildSummaryText(aiData)).then(
      () => toast({ type: 'success', message: '摘要已复制到剪贴板' }),
      () => toast({ type: 'error', message: '复制失败' }),
    );
  }, [aiData, buildSummaryText, toast]);

  const handleGenerateFlashcard = useCallback(async (keyPoint: string, index: number) => {
    try {
      const result = await generateFlashcards(keyPoint);
      if (!result) throw new Error('generate failed');
      const targetDeckId = await ensureDefaultDeck();
      await Promise.all(
        result.cards.map((card) =>
          createCard({ deckId: targetDeckId, front: card.front, back: card.back, type: 'basic', sourceNoteId: noteId ?? undefined }),
        ),
      );
      setConvertedKeys(prev => new Set(prev).add(index));
      toast({ type: 'success', message: `已生成 ${result.cards.length} 张闪卡`, silent: true });
    } catch (error) {
      handleFlashcardError(error);
    }
  }, [generateFlashcards, toast, ensureDefaultDeck, createCard, handleFlashcardError]);

  const handleGenerateAllFlashcards = useCallback(async () => {
    if (!aiData?.keyPoints?.length) return;
    try {
      const result = await generateFlashcards(aiData.keyPoints.join('\n'));
      if (!result) throw new Error('generate failed');
      const targetDeckId = await ensureDefaultDeck();
      await Promise.all(
        result.cards.map((card) =>
          createCard({ deckId: targetDeckId, front: card.front, back: card.back, type: 'basic', sourceNoteId: noteId ?? undefined }),
        ),
      );
      setConvertedKeys(new Set(aiData.keyPoints!.map((_, i) => i)));
      toast({ type: 'success', message: `已从全部要点生成 ${result.cards.length} 张闪卡`, silent: true });
    } catch (error) {
      handleFlashcardError(error);
    }
  }, [aiData, generateFlashcards, toast, ensureDefaultDeck, createCard, handleFlashcardError]);

  const handleRegenerate = useCallback(() => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) { toast({ type: 'warning', message: '笔记内容为空' }); return; }
    setConvertedKeys(new Set());
    summarize(text).catch(handleSummarizeError);
  }, [editor, summarize, toast, handleSummarizeError]);

  const handleExport = useCallback(() => {
    if (!aiData) return;
    let md = `## 摘要\n\n${aiData.summary}\n`;
    if (aiData.keyPoints?.length) {
      md += '\n## 关键要点\n\n';
      aiData.keyPoints.forEach((kp, i) => { md += `${i + 1}. ${kp}\n`; });
    }
    md += `\n---\n*由熵减 AI 生成于 ${new Date(aiData.generatedAt).toLocaleString()}*\n`;
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `ai-summary-${Date.now()}.md`; a.click();
    URL.revokeObjectURL(url);
    toast({ type: 'success', message: '摘要已导出' });
  }, [aiData, toast]);

  // 自由画布变更回调（稳定引用，避免每次渲染重建）
  const handleFreeCanvasChange = useCallback(
    (data: FreeCanvasData) => {
      if (noteId) debouncedSave(JSON.stringify(data));
    },
    [noteId, debouncedSave],
  );

  // 加载笔记数据
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Ctrl+Shift+H 快捷键打开救援面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setRescueOpen(true);
        stuckTimer.start();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [stuckTimer]);

  // 选中当前笔记
  useEffect(() => {
    if (noteId) selectNote(noteId);
  }, [noteId, selectNote]);

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

  if (!note) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="flex flex-col items-center gap-kb-md text-center">
          <h3 className="text-h2 font-medium text-text-primary">笔记不存在</h3>
          <p className="text-b2 text-text-tertiary">该笔记可能已被删除</p>
          <button
            onClick={() => navigate('/notes')}
            className="mt-2 text-brand-600 hover:text-brand-700 text-b2 font-medium"
          >
            返回笔记列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden" data-free-canvas-wrapper>
      {/* 顶部栏 */}
      <div className="relative z-10 flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50 flex-shrink-0">
        <button
          onClick={() => navigate('/notes')}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
          aria-label="返回"
        >
          <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
        </button>

        <input
          ref={titleRef}
          defaultValue={note.title}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          placeholder="输入笔记标题..."
          className={cn(
            'flex-1 bg-transparent outline-none text-h2 font-semibold text-text-primary',
            'placeholder:text-text-tertiary/60',
          )}
        />

        <span className={cn(
          'relative text-b3 transition-opacity duration-300 flex-shrink-0',
          saveStatus === 'idle' && 'opacity-0',
          saveStatus === 'saving' && 'text-text-tertiary opacity-100',
          saveStatus === 'saved' && 'text-semantic-success opacity-100',
          saveStatus === 'failed' && 'text-semantic-error opacity-100',
        )}>
          {saveStatus === 'saving' && '保存中...'}
          {saveStatus === 'saved' && '已保存'}
          {saveStatus === 'failed' && '保存失败'}
          <SaveParticles show={saveStatus === 'saved'} />
        </span>

        <button
          onClick={() => {
            if (editor) {
              const content = JSON.stringify(editor.getJSON());
              updateNote(noteId!, { content, title: titleRef.current?.value || note.title });
              soundPlayer.play('note_manual_save');
            }
          }}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium',
            'bg-bg-secondary text-text-secondary border border-border/50',
            'hover:bg-bg-tertiary hover:text-text-primary',
            'active:scale-95 transition-all duration-kb-fast',
          )}
        >
          <Save className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          保存
        </button>

        <button
          onClick={() => {
            setRescueOpen(true);
            stuckTimer.start();
          }}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium',
            'bg-bg-secondary text-text-secondary border border-border/50',
            'hover:bg-bg-tertiary hover:text-text-primary',
            'active:scale-95 transition-all duration-kb-fast',
          )}
          title="卡壳了 (Ctrl+Shift+H)"
        >
          <HelpCircle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          卡壳了
        </button>

        <AIButton
          size="sm"
          loading={aiLoading}
          disabled={aiLoading}
          tooltip="请先写一些笔记内容再生成摘要"
          onClick={() => {
            if (!editor) return;
            const text = editor.getText();
            if (!text.trim()) {
              toast({ type: 'warning', message: '请先写一些笔记内容再生成摘要' });
              return;
            }
            summarize(text)
              .then(() => setSummaryModalOpen(true))
              .catch(handleSummarizeError);
          }}
          title={aiLoading ? '正在生成摘要…' : 'AI 摘要'}
        >
          AI 摘要
        </AIButton>
      </div>

      {/* 工具栏（康奈尔/自由画布模式隐藏）— 极简浮动条 */}
      {note?.template !== 'cornell' && note?.template !== 'free' && (
      <div
        className="sticky top-0 z-20 mx-auto mt-2 flex items-center gap-1 px-4 py-1.5 rounded-[var(--kb-radius-lg)] border border-border/20 flex-shrink-0 overflow-x-auto max-w-fit bg-bg-elevated/70 backdrop-blur-xl shadow-[0_2px_16px_-4px_rgba(0,0,0,0.06)] opacity-70 hover:opacity-100 transition-opacity duration-300"
      >
        <ToolbarButton icon={Undo2} label="撤销" onClick={() => editor?.chain().focus().undo().run()} />
        <ToolbarButton icon={Redo2} label="重做" onClick={() => editor?.chain().focus().redo().run()} />
        <ToolbarDivider />
        <ToolbarButton
          icon={Heading1}
          label="标题 1"
          isActive={editor?.isActive('heading', { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          icon={Heading2}
          label="标题 2"
          isActive={editor?.isActive('heading', { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          icon={Heading3}
          label="标题 3"
          isActive={editor?.isActive('heading', { level: 3 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={Bold}
          label="加粗"
          isActive={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={Italic}
          label="斜体"
          isActive={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={UnderlineIcon}
          label="下划线"
          isActive={editor?.isActive('underline')}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          icon={Strikethrough}
          label="删除线"
          isActive={editor?.isActive('strike')}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          icon={Highlighter}
          label="高亮"
          isActive={editor?.isActive('highlight')}
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={List}
          label="无序列表"
          isActive={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={ListOrdered}
          label="有序列表"
          isActive={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={Quote}
          label="引用"
          isActive={editor?.isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={Code}
          label="代码块"
          isActive={editor?.isActive('codeBlock')}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={Table2}
          label="插入表格"
          onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        />
        <ToolbarButton
          icon={ListTodo}
          label="任务列表"
          isActive={editor?.isActive('taskList')}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        />
        <ToolbarButton
          icon={ImageIcon}
          label="插入图片"
          onClick={() => imageInputRef.current?.click()}
        />
        <ToolbarDivider />
        <ToolbarButton
          icon={AlignLeft}
          label="左对齐"
          isActive={editor?.isActive({ textAlign: 'left' })}
          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
        />
        <ToolbarButton
          icon={AlignCenter}
          label="居中"
          isActive={editor?.isActive({ textAlign: 'center' })}
          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
        />
        <ToolbarButton
          icon={AlignRight}
          label="右对齐"
          isActive={editor?.isActive({ textAlign: 'right' })}
          onClick={() => editor?.chain().focus().setTextAlign('right').run()}
        />
        <ToolbarButton
          icon={AlignJustify}
          label="两端对齐"
          isActive={editor?.isActive({ textAlign: 'justify' })}
          onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
        />
        <ToolbarDivider />
        <label
          title="文字颜色"
          className="relative p-kb-sm rounded-kb-sm cursor-pointer text-text-secondary hover:bg-bg-tertiary hover:text-text-primary active:bg-bg-secondary active:scale-95 transition-all duration-kb-fast"
        >
          <Palette className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          <input
            type="color"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={(e) => editor?.chain().focus().setColor(e.target.value).run()}
          />
        </label>
      </div>
      )}

      {/* 隐藏的图片上传 input */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />

      {/* 编辑区 */}
      {note?.template === 'free' ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <FreeCanvas
            content={freeCanvasData}
            onChange={handleFreeCanvasChange}
          />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto px-kb-md py-kb-lg bg-[rgba(255,253,250,0.3)] dark:bg-[rgba(16,24,44,0.5)]">
        <div
          className="max-w-[720px] mx-auto"
          onContextMenu={(e) => {
            // 仅当 TipTap 编辑器有文本选中时显示自定义菜单
            if (!editor || note?.template === 'cornell') return;
            const { from, to } = editor.state.selection;
            if (from === to) return; // 无选中，fallthrough 到默认右键
            const selected = editor.state.doc.textBetween(from, to, ' ');
            if (!selected.trim()) return;
            handleEditorContextMenu(e, selected);
          }}
        >
          {note?.template === 'cornell' ? (
            <CornellLayout
              content={(() => { try { return JSON.parse(note.content || '{}'); } catch { return {}; } })()}
              onChange={(data) => {
                if (noteId) {
                  const contentStr = JSON.stringify(data);
                  debouncedSave(contentStr);
                }
              }}
            />
          ) : (
            <>
              {/* v0.11.0: 待办笔记模板时在编辑器顶部显示进度统计 */}
              {note?.template === 'todo' && (
                <div className="mb-4 sticky top-0 z-10 bg-bg-primary/90 backdrop-blur-sm rounded-kb-md">
                  <TodoStats editor={editor} />
                </div>
              )}
              <EditorContent editor={editor} />
              {/* 非待办笔记模板时在底部显示统计 */}
              {note?.template !== 'todo' && <TodoStats editor={editor} />}
            </>
          )}
        </div>
      </div>
      )}

      {/* 选中文本右键菜单 */}
      {editorCtxOpen && editorSelectedText && (
        <ContextMenu<string>
          groups={editorCtxGroups}
          position={editorCtxPos}
          context={editorSelectedText}
          onSelect={handleEditorCtxSelect}
          onClose={closeEditorCtx}
        />
      )}

      {/* 回声定位侧边栏 */}
      </div>
      {captureOpen && (
        <CaptureSidebar
          onInsertText={(text) => {
            if (!editor) return;
            const htmlContent = text.split('\n').map((line) => `<p>${line || '<br>'}</p>`).join('');
            const docSize = editor.state.doc.content.size;
            editor.chain().focus().insertContentAt(docSize, htmlContent).run();
          }}
        />
      )}

      {/* 卡壳救援面板 */}
      <RescuePanel
        isOpen={rescueOpen}
        onClose={() => {
          setRescueOpen(false);
          stuckTimer.stop();
        }}
        context={{
          topic: note?.title || '笔记',
          relatedContent: editor?.getText().slice(0, 500),
          mode: 'note',
        }}
        onSuggestion={(action) => {
          if (action === 'pomodoro') navigate('/pomodoro');
          else if (action === 'flashcard') navigate('/flashcards');
        }}
      />

      {/* AI 摘要结果浮层 — 半透明玻璃态 */}
      {summaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-kb-md">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-md"
            onClick={() => setSummaryModalOpen(false)}
            aria-hidden
          />
          <div className={cn(
            'relative w-full max-w-lg bg-bg-elevated/95 dark:bg-bg-elevated/95 backdrop-blur-xl rounded-[20px_12px_18px_14px] shadow-[0_24px_80px_-12px_rgba(0,0,0,0.4)]',
            'border border-brand-200/20 dark:border-brand-800/30 p-kb-lg',
            'animate-in fade-in slide-in-from-bottom-4 duration-300',
          )}>
            <button
              onClick={() => setSummaryModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
            >
              <X className="w-icon-md h-icon-md" />
            </button>
            <h2 className="text-h2 font-semibold text-text-primary flex items-center gap-2 pr-8">
              <Sparkles className="w-icon-md h-icon-md text-brand-500" strokeWidth={1.5} />
              AI 摘要
            </h2>

            {aiLoading && (
              <div className="mt-kb-md flex items-center gap-2 text-b2 text-text-primary">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                正在生成摘要…
              </div>
            )}

            {aiError && !aiLoading && (
              <div className="mt-kb-md p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                {aiError}
                {aiNeedsConfig && (
                  <button
                    onClick={() => navigate('/settings')}
                    className="mt-2 block text-b3 underline hover:no-underline"
                  >
                    前往设置页配置 API Key
                  </button>
                )}
              </div>
            )}

            {aiData && !aiLoading && (
              <div className="mt-kb-md flex flex-col gap-kb-md kb-ai-result-enter">
                {/* 摘要文本 + 复制按钮 */}
                <div className="group relative">
                  <p className="text-b3 font-medium text-text-secondary uppercase tracking-wide mb-1">摘要</p>
                  <p className="text-b2 text-text-primary leading-relaxed pr-8">{aiData.summary}</p>
                  <button
                    onClick={handleCopySummary}
                    title="复制摘要"
                    className="absolute top-0 right-0 p-1.5 rounded-kb-sm text-text-tertiary hover:text-brand-600 hover:bg-brand-50 opacity-0 group-hover:opacity-100 transition-all duration-kb-fast"
                  >
                    <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                  </button>
                </div>

                {/* 关键要点 + 逐项闪卡按钮 */}
                {(aiData.keyPoints?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-b3 font-medium text-text-secondary uppercase tracking-wide mb-1">关键要点</p>
                    <ul className="flex flex-col gap-1.5">
                      {aiData.keyPoints?.map((kp, i) => (
                        <li key={i} className="group flex items-start gap-2 text-b2 text-text-primary rounded-kb-sm px-2 py-1 -mx-2 hover:bg-bg-tertiary/50 transition-colors">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-kb-full bg-brand-500 flex-shrink-0" />
                          <span className="flex-1">{kp}</span>
                          <button
                            onClick={() => handleGenerateFlashcard(kp, i)}
                            disabled={flashcardLoading}
                            title={convertedKeys.has(i) ? '已生成闪卡' : '生成闪卡'}
                            className={`flex-shrink-0 p-1 rounded-kb-sm transition-all duration-kb-fast ${
                              convertedKeys.has(i)
                                ? 'text-semantic-success opacity-100'
                                : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-50 opacity-0 group-hover:opacity-100'
                            } ${flashcardLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {convertedKeys.has(i) ? (
                              <Check className="w-3.5 h-3.5" strokeWidth={2} />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 智能建议区 */}
                {(aiData.keyPoints?.length ?? 0) > 2 && (
                  <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200/30 rounded-kb-md">
                    <span className="text-b2 text-brand-700">
                      💡 检测到 {aiData.keyPoints!.length} 个核心概念，适合制作复习闪卡
                    </span>
                    <AIButton
                      size="sm"
                      onClick={handleGenerateAllFlashcards}
                      disabled={flashcardLoading}
                      loading={flashcardLoading}
                      className="flex-shrink-0"
                    >
                      一键生成
                    </AIButton>
                  </div>
                )}

                {/* 操作区 — 接受 / 拒绝 / 重试 三按钮 */}
                <div className="border-t border-border/30 pt-4 mt-2 flex items-center gap-3">
                  <button
                    onClick={() => handleInsertNote('end')}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--kb-radius-md)] text-b2 font-medium bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.97] transition-all duration-200 shadow-[0_2px_12px_-2px_rgba(91,138,114,0.4)]"
                  >
                    <Check className="w-4 h-4" strokeWidth={2} />
                    接受
                  </button>
                  <button
                    onClick={() => setSummaryModalOpen(false)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--kb-radius-md)] text-b2 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-[0.97] transition-all duration-200"
                  >
                    <X className="w-4 h-4" strokeWidth={1.5} />
                    拒绝
                  </button>
                  <button
                    onClick={handleRegenerate}
                    disabled={aiLoading}
                    className={cn(
                      'flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--kb-radius-md)] text-b2 font-medium bg-bg-secondary text-text-secondary border border-border/50 hover:bg-bg-tertiary hover:text-text-primary active:scale-[0.97] transition-all duration-200',
                      aiLoading && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <RefreshCw className={cn('w-4 h-4', aiLoading && 'animate-spin')} strokeWidth={1.5} />
                    重试
                  </button>
                </div>

                {/* 次级操作 */}
                <div className="flex items-center gap-2 mt-3">
                  <div className="relative">
                    <button
                      onClick={() => setInsertMenuOpen(!insertMenuOpen)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
                    >
                      插入到指定位置
                      <ChevronDown className="w-3 h-3" strokeWidth={1.5} />
                    </button>
                    {insertMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-1 w-36 bg-bg-elevated rounded-[var(--kb-radius-md)] shadow-kb-md border border-border/40 py-1 z-10">
                        <button onClick={() => handleInsertNote('cursor')} className="w-full text-left px-3 py-2 text-b2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors">光标位置</button>
                        <button onClick={() => handleInsertNote('start')} className="w-full text-left px-3 py-2 text-b2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors">笔记开头</button>
                        <button onClick={() => handleInsertNote('end')} className="w-full text-left px-3 py-2 text-b2 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary transition-colors">笔记末尾</button>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleCopySummary}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
                  >
                    <Copy className="w-3 h-3" strokeWidth={1.5} />
                    复制
                  </button>

                  <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--kb-radius-md)] text-b3 font-medium text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
                  >
                    <Download className="w-3 h-3" strokeWidth={1.5} />
                    导出
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
