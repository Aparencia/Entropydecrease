/**
 * 笔记编辑页
 *
 * @ai-context: 2026-07 拆分后的组合层。编辑器实例与自动保存见 useNoteEditor，
 * AI 摘要/闪卡衍生见 useNoteAI，顶栏/工具栏/摘要浮层为独立组件。
 * 三种模板分支渲染：free=自由画布、cornell=康奈尔布局、其余=TipTap 正文
 * （todo 模板把统计置顶，其余置底）；工具栏仅在 free/cornell 外显示。
 */
import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EditorContent } from '@tiptap/react';
import { useShallow } from 'zustand/react/shallow';
import { useNoteStore } from '../store/useNoteStore';
import { CornellLayout } from '../components/CornellLayout';
import FreeCanvas from '../components/FreeCanvas';
import type { FreeCanvasData } from '@/types/models';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { CaptureSidebar } from '../components/CaptureSidebar';
import { TodoStats } from '../components/TodoStats';
import { useCaptureStore } from '@/stores/useCaptureStore';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { RescuePanel } from '@/components/RescuePanel';
import { useStuckTimer } from '@/hooks/useStuckTimer';
import { NoteEditHeader } from '../components/NoteEditHeader';
import { EditorToolbar } from '../components/EditorToolbar';
import { AISummaryModal } from '../components/AISummaryModal';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { useNoteAI } from '../hooks/useNoteAI';
import { useEditorContextMenu } from '../hooks/useEditorContextMenu';

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
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { editor, saveStatus, debouncedSave, handleImageSelect } = useNoteEditor({
    noteId,
    rawContent: note?.content,
    noteKey: note?.id,
    updateNote,
  });

  const ai = useNoteAI(editor, noteId);

  const ctxMenu = useEditorContextMenu({
    editor,
    disabled: note?.template === 'cornell',
    persistCards: ai.persistCards,
    onFlashcardError: ai.handleFlashcardError,
  });

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

  const handleManualSave = () => {
    if (!editor || !noteId) return;
    updateNote(noteId, {
      content: JSON.stringify(editor.getJSON()),
      title: titleRef.current?.value || note?.title,
    });
    soundPlayer.play('note_manual_save');
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

  const isFree = note.template === 'free';
  const isCornell = note.template === 'cornell';

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
      />

      {/* 工具栏（康奈尔/自由画布模式隐藏） */}
      {!isCornell && !isFree && (
        <EditorToolbar editor={editor} onPickImage={() => imageInputRef.current?.click()} />
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
      ) : (
        <div className="flex-1 overflow-y-auto px-kb-md py-kb-lg bg-[rgba(255,253,250,0.3)] dark:bg-[rgba(16,24,44,0.5)]">
          <div className="max-w-[720px] mx-auto" onContextMenu={ctxMenu.onContextMenu}>
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
              </>
            )}
          </div>
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
    </div>
  );
}
