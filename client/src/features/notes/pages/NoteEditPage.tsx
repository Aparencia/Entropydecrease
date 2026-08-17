/**
 * 笔记编辑页
 *
 * @ai-context: 2026-07 拆分后的组合层。编辑器实例与自动保存见 useNoteEditor，
 * AI 摘要/闪卡衍生见 useNoteAI，顶栏/工具栏/摘要浮层为独立组件。
 * 2026-08 R3 再拆分（本文件仅保留状态编排与布局组合）：
 * 全文惰性加载 → hooks/useNoteFullContent；卡壳救援 → hooks/useNoteRescue；
 * 健康度文本 → hooks/useNoteEditHealth；阅读模式 → hooks/useNoteReadingMode；
 * 信息图 → hooks/useNoteInfographic；模板数据适配 → hooks/useTemplateNoteData；
 * 导航守卫 → hooks/useNoteUnsavedGuard；页面动作 → hooks/useNoteEditActions；
 * 锚点触发 → hooks/useAnchorPointTracking；视觉提取 → hooks/useVisionExtract；
 * 导出 → lib/noteExportImport；工具行/编辑区/侧栏/弹层/拦截框 → components/。
 * 三种模板分支渲染：free=自由画布、cornell=康奈尔布局、其余=TipTap 正文
 * （todo 模板把统计置顶，其余置底）；工具栏仅在 free/cornell 外显示。
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useNoteStore } from '../store/useNoteStore';
import FreeCanvas from '../components/FreeCanvas';
import { MindmapEditor } from '../components/mindmap/MindmapEditor';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { useCaptureStore } from '@/stores/useCaptureStore';
import { NoteEditHeader } from '../components/NoteEditHeader';
import { NoteTagsEditor } from '../components/NoteTagsEditor';
import { EditorToolbar } from '../components/EditorToolbar';
import { useNoteEditor } from '../hooks/useNoteEditor';
import { useNoteAI } from '../hooks/useNoteAI';
import { useEditorContextMenu } from '../hooks/useEditorContextMenu';
import { useAnchorPointTracking } from '../hooks/useAnchorPointTracking';
import { useVisionExtract } from '../hooks/useVisionExtract';
import { useNoteEditHealth } from '../hooks/useNoteEditHealth';
import { useConceptConflict } from '../hooks/useConceptConflict';
import { useNoteFullContent } from '../hooks/useNoteFullContent';
import { useNoteRescue } from '../hooks/useNoteRescue';
import { useTemplateNoteData } from '../hooks/useTemplateNoteData';
import { useNoteUnsavedGuard } from '../hooks/useNoteUnsavedGuard';
import { useNoteReadingMode } from '../hooks/useNoteReadingMode';
import { useNoteInfographic } from '../hooks/useNoteInfographic';
import { useNoteEditActions } from '../hooks/useNoteEditActions';
import { NoteEditActionBar } from '../components/NoteEditActionBar';
import { NoteEditorArea } from '../components/NoteEditorArea';
import { NoteEditSidebars } from '../components/NoteEditSidebars';
import { NoteEditDialogs } from '../components/NoteEditDialogs';
import { NoteEditBlockerDialog } from '../components/NoteEditBlockerDialog';
import { NoteEditFallback } from '../components/NoteEditFallback';
import { Volume2 } from 'lucide-react';
// 移动端 Capacitor：相机/相册插图走原生选取，桌面/浏览器走隐藏 file input
import { isCapacitor } from '@/lib/platform/platform';
import { pickImage, readDataFile } from '@/lib/capacitor';

export default function NoteEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const noteId = id ?? null;
  const captureOpen = useCaptureStore((s) => s.open);

  // === 卡壳救援（开关 + 计时器 + Ctrl+Shift+H，见 hooks/useNoteRescue）===
  const { rescueOpen, setRescueOpen, stuckTimer } = useNoteRescue();

  // P0-3 优化：直接按 noteId 订阅目标笔记对象（未变更时引用稳定，Object.is 相等），
  // 任何其他笔记 autosave 重建 notes 数组不再触发整页重渲染；
  // 仅本笔记保存时对象重建（必要重渲染）。noteId 无效/未加载时返回 null（引用稳定）。
  const note = useNoteStore((s) => s.notes.find((n) => n.id === noteId) || null);
  const allNotes = useNoteStore((s) => s.notes);
  const updateNote = useNoteStore((s) => s.updateNote);
  const selectNote = useNoteStore((s) => s.selectNote);
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const isLoading = useNoteStore((s) => s.isLoading);

  // P1-1 惰性全文：列表投影后 notes[] 不含 content（图片 base64 内存治理），
  // 打开笔记时按需从库取解密全文；切换笔记时重新加载（见 hooks/useNoteFullContent）
  const fullContent = useNoteFullContent(noteId, note?.content);

  const titleRef = useRef<HTMLInputElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { editor, saveStatus, isDirty, debouncedSave, flushPendingSave, handleImageSelect, insertImageFromFile } = useNoteEditor({ noteId, rawContent: fullContent, noteKey: note?.id, updateNote });

  /**
   * 图片选择入口：Capacitor 壳内走原生相机/相册（系统 Prompt），
   * 桌面/浏览器维持隐藏 file input（PWA 也可用系统文件选择器）
   */
  const handlePickImage = useCallback(async () => {
    if (isCapacitor()) {
      try {
        const picked = await pickImage('prompt');
        if (!picked) return;
        const file = await readDataFile(picked.fileName, 'image/jpeg');
        await insertImageFromFile(file);
      } catch (err) {
        console.warn('[NoteEditPage] Capacitor 插图失败', err);
      }
      return;
    }
    imageInputRef.current?.click();
  }, [insertImageFromFile]);

  // P4 截图视觉提取（隐藏 input ref / 提取中标记 / 变更处理器见 hooks/useVisionExtract）
  const { visionInputRef, visionExtracting, handleVisionExtract } = useVisionExtract(editor);

  const ai = useNoteAI(editor, noteId);

  // === N2 合书测试模式 ===
  const [closedBook, setClosedBook] = useState(false);

  // === 滚书背诵模式（4 轮渐进回忆，与合书测试平行入口）===
  const [recallOpen, setRecallOpen] = useState(false);

  // === N3 笔记健康度：实时文本 + 惰性快照 + 阅读难度（见 hooks/useNoteEditHealth）===
  const { healthText, refreshHealthText, contentDifficulty } = useNoteEditHealth(editor);

  // === 阅读模式（自适应排版 + 只读切换，见 hooks/useNoteReadingMode）===
  const { readingMode, setReadingMode, typographyVars } = useNoteReadingMode(editor, contentDifficulty);

  // 窗口失焦时 flush 未保存的编辑
  useEffect(() => {
    const handleBlur = () => {
      flushPendingSave();
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [flushPendingSave]);

  // === 知识信息图生成（弹窗开关 + 降级提示，见 hooks/useNoteInfographic）===
  const { infographicOpen, setInfographicOpen, infographic, infographicLoading, infographicError, isFallback, generateInfographic } = useNoteInfographic();

  // === N5 策略性遗忘标记 ===
  const [tierOpen, setTierOpen] = useState(false);
  const [soundAnchorOpen, setSoundAnchorOpen] = useState(false);

  // === N6 概念冲突检测：内容稳定后自动比对新旧理解 ===
  const { conflicts, dismiss: dismissConflicts } = useConceptConflict(noteId, healthText, allNotes);

  const ctxMenu = useEditorContextMenu({
    editor,
    disabled: note?.template === 'cornell',
    persistCards: ai.persistCards,
    onFlashcardError: ai.handleFlashcardError,
  });

  // === 记忆锚点自动触发（hooks/useAnchorPointTracking：12 分钟活跃编辑自动生成）===
  const anchorPoints = useAnchorPointTracking(editor, noteId);

  // === 模板数据适配（free 画布 / mindmap 导图，见 hooks/useTemplateNoteData）===
  const { freeCanvasData, handleFreeCanvasChange, mindmapData, handleMindmapChange } = useTemplateNoteData({ note, fullContent, noteId, debouncedSave });

  // 加载笔记数据
  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // 选中当前笔记
  useEffect(() => {
    if (noteId) selectNote(noteId);
  }, [noteId, selectNote]);

  // === 未保存更改导航守卫（beforeunload + useBlocker，见 hooks/useNoteUnsavedGuard）===
  const { blocker, handleSaveAndLeave } = useNoteUnsavedGuard({ isDirty, saveStatus, editor, noteId, note, titleRef, updateNote });

  // === 页面动作处理器（标题/保存/面板入口，见 hooks/useNoteEditActions）===
  const {
    handleTitleBlur, handleTitleKeyDown, handleManualSave,
    handleOpenClosedBook, handleOpenRollingRecall,
    handleGenerateInfographic, handleOpenTier, handleExportMarkdown,
  } = useNoteEditActions({
    editor, noteId, note, titleRef, updateNote, refreshHealthText,
    setClosedBook, setRecallOpen, setTierOpen, setInfographicOpen,
    generateInfographic, fullContent,
  });

  // 加载中 / 笔记缺失回退视图（见 components/NoteEditFallback）
  if (isLoading || !note) {
    return <NoteEditFallback loading={isLoading} onBack={() => navigate('/notes')} />;
  }

  const isFree = note.template === 'free';
  const isCornell = note.template === 'cornell';
  const isMindmap = note.template === 'mindmap';

  return (
    <div className="flex h-full">
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden" data-free-canvas-wrapper>
      <NoteEditHeader
        title={note.title} titleRef={titleRef} saveStatus={saveStatus} aiLoading={ai.aiLoading}
        onBack={() => navigate('/notes')} onTitleBlur={handleTitleBlur} onTitleKeyDown={handleTitleKeyDown}
        onManualSave={handleManualSave} onOpenRescue={() => { setRescueOpen(true); stuckTimer.start(); }}
        onSummarize={ai.startSummarize} onExportMarkdown={handleExportMarkdown}
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
        <EditorToolbar editor={editor} onPickImage={handlePickImage} healthContent={healthText} healthTitle={note?.title} healthTags={note?.tags} onToggleClosedBook={handleOpenClosedBook} />
      )}

      {/* P4 AI 提取图片文字 / 信息图 / 滚书背诵 / 阅读模式 入口（独立于图片插入流程） */}
      {!isCornell && !isFree && !isMindmap && (
        <NoteEditActionBar
          onPickVision={() => visionInputRef.current?.click()}
          visionExtracting={visionExtracting}
          onGenerateInfographic={handleGenerateInfographic}
          infographicLoading={infographicLoading}
          onOpenRollingRecall={handleOpenRollingRecall}
          readingMode={readingMode}
          onToggleReadingMode={() => setReadingMode((v) => !v)}
        />
      )}

      {/* 隐藏的图片上传 input */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />

      {/* P4 隐藏的 AI 提取图片 input */}
      <input ref={visionInputRef} type="file" accept="image/*" className="hidden" onChange={handleVisionExtract} />

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
        <NoteEditorArea
          editor={editor} note={note} noteId={noteId} isCornell={isCornell} closedBook={closedBook}
          readingMode={readingMode} typographyVars={typographyVars as React.CSSProperties}
          onContextMenu={closedBook ? undefined : ctxMenu.onContextMenu} editorWrapperRef={editorWrapperRef}
          fullContent={fullContent} debouncedSave={debouncedSave} healthText={healthText}
          onOpenClosedBook={handleOpenClosedBook} onCloseClosedBook={() => setClosedBook(false)}
          onOpenTier={handleOpenTier}
        />
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

    {/* 右侧/浮层面板：锚点侧边栏 + 回声定位 + 卡壳救援（见 components/NoteEditSidebars） */}
    <NoteEditSidebars
      noteId={noteId} noteTitle={note?.title ?? ''} anchorPoints={anchorPoints} conflicts={conflicts}
      onDismissConflicts={dismissConflicts} healthText={healthText} captureOpen={captureOpen}
      editor={editor} rescueOpen={rescueOpen} onCloseRescue={() => { setRescueOpen(false); stuckTimer.stop(); }}
      onSuggestion={(action) => {
        if (action === 'pomodoro') navigate('/pomodoro');
        else if (action === 'flashcard') navigate('/flashcards');
      }}
    />

    {/* 底部弹层：AI 摘要 + 内容分层 + 信息图 + 滚书背诵 + 声音锚点（见 components/NoteEditDialogs） */}
    <NoteEditDialogs
      ai={ai} noteId={noteId} noteTitle={note?.title ?? ''} healthText={healthText}
      tierOpen={tierOpen} onCloseTier={() => setTierOpen(false)}
      infographicOpen={infographicOpen} onCloseInfographic={() => setInfographicOpen(false)}
      infographic={infographic} infographicLoading={infographicLoading} infographicError={infographicError} isFallback={isFallback}
      recallOpen={recallOpen} onCloseRecall={() => setRecallOpen(false)}
      soundAnchorOpen={soundAnchorOpen} onCloseSoundAnchor={() => setSoundAnchorOpen(false)}
      onGoSettings={() => navigate('/settings')}
    />

    {/* M19: 导航拦截确认框——未保存更改时离开需显式确认（见 components/NoteEditBlockerDialog） */}
    {blocker.state === 'blocked' && (
      <NoteEditBlockerDialog
        blocker={blocker}
        saveStatus={saveStatus}
        onSaveAndLeave={handleSaveAndLeave}
      />
    )}
    </div>
  );
}
