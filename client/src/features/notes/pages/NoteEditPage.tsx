/**
 * 笔记编辑页
 *
 * @ai-context: 2026-07 拆分后的组合层。编辑器实例与自动保存见 useNoteEditor，
 * AI 摘要/闪卡衍生见 useNoteAI，顶栏/工具栏/摘要浮层为独立组件。
 * 三种模板分支渲染：free=自由画布、cornell=康奈尔布局、其余=TipTap 正文
 * （todo 模板把统计置顶，其余置底）；工具栏仅在 free/cornell 外显示。
 */
import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { EditorContent } from '@tiptap/react';
import { useNoteStore } from '../store/useNoteStore';
import { CornellLayout } from '../components/CornellLayout';
import FreeCanvas from '../components/FreeCanvas';
import { MindmapEditor } from '../components/mindmap/MindmapEditor';
import { BacklinksPanel } from '../components/BacklinksPanel';
import { noteToMarkdown } from '../lib/markdown/noteMarkdown';
import { parseMindmapData, createDefaultMindmap } from '../lib/mindmap/mindmapOps';
import type { FreeCanvasData, MindmapData } from '@/types/models';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { CaptureSidebar } from '../components/CaptureSidebar';
import { TodoStats } from '../components/TodoStats';
import { useCaptureStore } from '@/stores/useCaptureStore';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { RescuePanel } from '@/components/RescuePanel';
import { useStuckTimer } from '@/hooks/useStuckTimer';
import { assistantEventBus } from '@/features/assistant/lib/eventBus';
import { NoteEditHeader } from '../components/NoteEditHeader';
import { NoteTagsEditor } from '../components/NoteTagsEditor';
import { EditorToolbar } from '../components/EditorToolbar';
import { AISummaryModal } from '../components/AISummaryModal';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { useNoteAI } from '../hooks/useNoteAI';
import { useEditorContextMenu } from '../hooks/useEditorContextMenu';
import { useAIAnchorPoint } from '@/lib/ai/hooks/useAIAnchorPoint';
import { AnchorPointSidebar } from '../components/AnchorPoint';
import { FEYNMAN_RECOMMEND_MIN_CONTENT } from '../components/FeynmanRecommendSidebar';
import { ClosedBookTest } from '../components/ClosedBookTest';
import { ContentTierModal } from '../components/ContentTierModal';
import { useConceptConflict } from '../hooks/useConceptConflict';
import { Tip } from '@/components/ui/Tip';
import { Button } from '@/components/ui';
import { EyeOff, Layers, Volume2 } from 'lucide-react';
import { SoundAnchorPicker } from '@/features/soundanchor/components/SoundAnchorPicker';
import { cn } from '@/lib/utils';

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
      // @ai-context: T4 孵化效应——同步发射助手事件，驱动学伴主动触发气泡
      assistantEventBus.emit('stuck:incubation', {
        currentHour: new Date().getHours(),
        stuckSource: 'note',
      });
    },
  });

  // 细粒度 selector：整 store 订阅（useShallow(s => s)）会在任何字段变化时
  // 重渲染整页，键入场景下与 healthText 叠加放大卡顿
  const notes = useNoteStore((s) => s.notes);
  const updateNote = useNoteStore((s) => s.updateNote);
  const selectNote = useNoteStore((s) => s.selectNote);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const isLoading = useNoteStore((s) => s.isLoading);
  const note = notes.find((n) => n.id === noteId) || null;

  const titleRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { editor, saveStatus, isDirty, debouncedSave, handleImageSelect } = useNoteEditor({
    noteId,
    rawContent: note?.content,
    noteKey: note?.id,
    updateNote,
  });

  const ai = useNoteAI(editor, noteId);

  // === N2 合书测试模式 ===
  const [closedBook, setClosedBook] = useState(false);

  // === N5 策略性遗忘标记 ===
  const [tierOpen, setTierOpen] = useState(false);
  const [soundAnchorOpen, setSoundAnchorOpen] = useState(false);

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

  // === N6 概念冲突检测：内容稳定后自动比对新旧理解 ===
  const { conflicts, dismiss: dismissConflicts } = useConceptConflict(noteId, healthText, notes);

  const ctxMenu = useEditorContextMenu({
    editor,
    disabled: note?.template === 'cornell',
    persistCards: ai.persistCards,
    onFlashcardError: ai.handleFlashcardError,
  });

  // === 记忆锚点自动触发 ===
  // 策略：追踪用户编辑活跃度，每 12 分钟活跃编辑后自动触发 AI 锚点生成。
  // 活跃度基于编辑器 onUpdate 回调——每次编辑重置 30 秒无操作计时器，
  // 累计活跃时间达到阈值后触发并重置计时器。
  const ANCHOR_ACTIVE_THRESHOLD_MS = 12 * 60 * 1000; // 12 分钟活跃编辑阈值
  const ANCHOR_IDLE_TIMEOUT_MS = 30 * 1000; // 30 秒无操作视为暂停
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
  
  // 自由画布变更回调（稳定引用，避免每次渲染重建）
  const handleFreeCanvasChange = useCallback(
    (data: FreeCanvasData) => {
      if (noteId) debouncedSave(() => JSON.stringify(data));
    },
    [noteId, debouncedSave],
  );

  // 思维导图数据解析（模板笔记提供合法 JSON；损坏/空时回退默认导图）
  const mindmapData = useMemo<MindmapData>(() => {
    if (note?.template === 'mindmap' && note.content) {
      const parsed = parseMindmapData(note.content);
      if (parsed) return parsed;
    }
    return createDefaultMindmap();
  }, [note?.id, note?.content, note?.template]);

  // 思维导图变更回调（序列化整棵树防抖保存）
  const handleMindmapChange = useCallback(
    (data: MindmapData) => {
      if (noteId) debouncedSave(() => JSON.stringify(data));
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
  }, [refreshHealthText]);

  // 内容分层入口：同理先取最新快照
  const handleOpenTier = useCallback(() => {
    refreshHealthText();
    setTierOpen(true);
  }, [refreshHealthText]);

  // 阶段四：导出当前笔记为 Markdown（导图笔记降级为大纲）
  const handleExportMarkdown = () => {
    if (!note) return;
    const md = noteToMarkdown(note.content);
    const rawName = (note.title || '未命名笔记').replace(/[\\/:*?"<>|]/g, '_').replace(/^\.+/, '').slice(0, 200).trim() || '未命名笔记';
    const filename = `${rawName}.md`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="flex items-center gap-2 text-text-tertiary">
          <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
          <span className="text-b2">加载中...</span>
        </div>
      </div>
    );
  }

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

  const isFree = note.template === 'free';
  const isCornell = note.template === 'cornell';
  const isMindmap = note.template === 'mindmap';

  return (
    <div className="flex h-full">
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden" data-free-canvas-wrapper>
      <NoteEditHeader
        title={note.title}
        titleRef={titleRef}
        saveStatus={saveStatus}
        aiLoading={ai.aiLoading}
        onBack={() => navigate('/notes')}
        onTitleBlur={handleTitleBlur}
        onTitleKeyDown={handleTitleKeyDown}
        onManualSave={handleManualSave}
        onOpenRescue={() => { setRescueOpen(true); stuckTimer.start(); }}
        onSummarize={ai.startSummarize}
        onExportMarkdown={handleExportMarkdown}
      />

      {/* 标签编辑行（所有模板共用） */}
      {noteId && <NoteTagsEditor noteId={noteId} tags={note.tags} />}

      {/* 3.11 声音记忆锚点：绑定当前笔记概念的声音 */}
      {noteId && (
        <div className="px-kb-md pt-1">
          <button
            type="button"
            onClick={() => setSoundAnchorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-kb-full text-xs text-brand-600 hover:text-brand-700 hover:bg-brand-500/10 border border-brand-300/40 bg-brand-500/5 transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" strokeWidth={1.6} />
            绑定声音锚点
          </button>
        </div>
      )}

      {/* 工具栏（康奈尔/自由画布/思维导图模式隐藏） */}
      {!isCornell && !isFree && !isMindmap && (
        <EditorToolbar editor={editor} onPickImage={() => imageInputRef.current?.click()} healthContent={healthText} onToggleClosedBook={handleOpenClosedBook} />
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
      {isFree ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <FreeCanvas content={freeCanvasData} onChange={handleFreeCanvasChange} />
        </div>
      ) : isMindmap ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <MindmapEditor data={mindmapData} onChange={handleMindmapChange} />
        </div>
      ) : (
        <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto px-kb-md py-kb-lg bg-[rgba(255,253,250,0.3)] dark:bg-[rgba(16,24,44,0.5)]">
          <div
            className={cn('max-w-[720px] mx-auto transition-all duration-300', closedBook && 'blur-md select-none pointer-events-none')}
            onContextMenu={closedBook ? undefined : ctxMenu.onContextMenu}
          >
            {isCornell ? (
              <CornellLayout
                content={(() => { try { return JSON.parse(note.content || '{}'); } catch { return {}; } })()}
                onChange={(data) => {
                  if (noteId) debouncedSave(() => JSON.stringify(data));
                }}
              />
            ) : (
              <>
                {/* v0.11.0: 待办笔记模板时在编辑器顶部显示进度统计 */}
                {note.template === 'todo' && (
                  <div className="mb-4 sticky top-0 z-10 bg-bg-primary/90 backdrop-blur-sm rounded-kb-md">
                    <TodoStats editor={editor} />
                  </div>
                )}
                <EditorContent editor={editor} />
                {/* 非待办笔记模板时在底部显示统计 */}
                {note.template !== 'todo' && <TodoStats editor={editor} />}
                {/* 阶段二：反向链接面板（无引用时不显示） */}
                <BacklinksPanel noteId={note.id} />
              </>
            )}
          </div>
        </div>
        {/* N2 合书测试：遮罩层/入口按钮（康奈尔布局不适用） */}
        {closedBook ? (
          <div className="absolute inset-0 z-20 overflow-y-auto bg-bg-primary/40">
            <ClosedBookTest
              noteTitle={note.title}
              noteText={healthText}
              onClose={() => setClosedBook(false)}
            />
          </div>
        ) : !isCornell && (
          <div className="absolute right-4 top-4 z-10 flex flex-col gap-2">
          <Tip text="合书测试：隐藏笔记，凭回忆自测" side="left">
            <button
              onClick={handleOpenClosedBook}
              className="p-2 rounded-full bg-bg-primary/80 backdrop-blur-sm border border-border/40 text-text-tertiary hover:text-brand-600 hover:border-brand-300 shadow-sm transition-all duration-200"
            >
              <EyeOff className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </Tip>
          {/* N5 内容分层入口：策略性遗忘标记 */}
          <Tip text="内容分层：聚焦核心概念" side="left">
            <button
              onClick={handleOpenTier}
              className="p-2 rounded-full bg-bg-primary/80 backdrop-blur-sm border border-border/40 text-text-tertiary hover:text-brand-600 hover:border-brand-300 shadow-sm transition-all duration-200"
            >
              <Layers className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </Tip>
          </div>
        )}
        </div>
      )}

      {/* 选中文本右键菜单 */}
      {ctxMenu.isOpen && ctxMenu.context && (
        <ContextMenu<string>
          groups={ctxMenu.groups}
          position={ctxMenu.position}
          context={ctxMenu.context}
          onSelect={ctxMenu.handleSelect}
          onClose={ctxMenu.close}
        />
      )}
    </div>

    {/* AI 记忆锚点侧边栏 — 活跃编辑 12 分钟后自动生成；N6 冲突卡、N4 费曼推荐也在此展示 */}
    {/* N4: 正文达推荐阈值时提前显示侧边栏（含费曼引导卡），锚点仍按 12 分钟节奏生成 */}
    {(anchorPoints.length > 0 || conflicts.length > 0 || healthText.trim().length >= FEYNMAN_RECOMMEND_MIN_CONTENT) && noteId && (
      <AnchorPointSidebar
        noteId={noteId}
        anchorPoints={anchorPoints}
        conflicts={conflicts}
        onDismissConflicts={dismissConflicts}
        noteContent={healthText}
        noteTitle={note?.title ?? ''}
      />
    )}

    {/* 回声定位侧边栏 */}
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
      onClose={() => { setRescueOpen(false); stuckTimer.stop(); }}
      context={{
        topic: note.title || '笔记',
        relatedContent: editor?.getText().slice(0, 500),
        mode: 'note',
      }}
      onSuggestion={(action) => {
        if (action === 'pomodoro') navigate('/pomodoro');
        else if (action === 'flashcard') navigate('/flashcards');
      }}
    />

    {/* AI 摘要结果浮层 */}
    {ai.summaryModalOpen && (
      <AISummaryModal
        data={ai.aiData}
        loading={ai.aiLoading}
        error={ai.aiError}
        needsConfig={ai.aiNeedsConfig}
        isStreaming={ai.isStreaming}
        streamingText={ai.streamingText}
        flashcardLoading={ai.flashcardLoading}
        convertedKeys={ai.convertedKeys}
        onClose={() => ai.setSummaryModalOpen(false)}
        onGoSettings={() => navigate('/settings')}
        onCopySummary={ai.handleCopySummary}
        onGenerateFlashcard={ai.handleGenerateFlashcard}
        onGenerateAllFlashcards={ai.handleGenerateAllFlashcards}
        onInsertNote={ai.handleInsertNote}
        onRegenerate={ai.handleRegenerate}
        onExport={ai.handleExport}
        onCancelStream={ai.cancelStream}
      />
    )}
    {/* N5 内容分层弹窗（策略性遗忘标记） */}
    <ContentTierModal open={tierOpen} onClose={() => setTierOpen(false)} noteText={healthText} noteId={noteId} />

    {/* 3.11 声音记忆锚点选择器：绑定当前笔记概念 */}
    <SoundAnchorPicker
      open={soundAnchorOpen}
      conceptId={noteId ?? 'note'}
      conceptTitle={note.title || '未命名笔记'}
      onClose={() => setSoundAnchorOpen(false)}
    />

    {/* M19: 导航拦截确认框——未保存更改时离开需显式确认，不再静默拦截 */}
    {blocker.state === 'blocked' && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-dialog-title"
      >
        <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-bg-secondary p-5 shadow-xl">
          <h3 id="unsaved-dialog-title" className="text-b1 font-semibold text-text-primary mb-2">
            {saveStatus === 'failed' ? '保存失败' : '有未保存的更改'}
          </h3>
          <p className="text-c1 text-text-secondary mb-4">
            {saveStatus === 'failed'
              ? '上次保存失败，离开将丢失未保存的内容'
              : '离开前要保存这次编辑吗？'}
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="primary" size="sm" onClick={handleSaveAndLeave}>
              {saveStatus === 'failed' ? '仍要离开' : '保存并离开'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { if (blocker.state === 'blocked') blocker.proceed(); }}>
              放弃更改
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { if (blocker.state === 'blocked') blocker.reset(); }}>
              取消
            </Button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}
