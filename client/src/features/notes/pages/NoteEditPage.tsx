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
import { noteStore } from '@/lib/storage';
import { CornellLayout } from '../components/CornellLayout';
import FreeCanvas from '../components/FreeCanvas';
import { WikiLinkPreview } from '../components/WikiLinkPreview';
import { PredictionPrompt } from '../components/PredictionPrompt';
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
import { Button, useToast } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { EyeOff, Layers, Volume2, ScanText, BarChart3, BookMarked, BookOpen, Download } from 'lucide-react';
import { SoundAnchorPicker } from '@/features/soundanchor/components/SoundAnchorPicker';
import { cn } from '@/lib/utils';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useAIInfographic } from '@/lib/ai/hooks/useAIInfographic';
import InfographicRenderer from '@/components/InfographicRenderer';
import RollingRecallMode from '../components/RollingRecallMode';
import { ReadingGuide } from '@/components/ReadingGuide';
import { useAdaptiveTypography } from '@/hooks/useAdaptiveTypography';

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
  // 打开笔记时按需从库取解密全文；切换笔记时重新加载
  const [fullContent, setFullContent] = useState<string | undefined>(note?.content);
  useEffect(() => {
    let cancelled = false;
    if (!noteId) {
      setFullContent(undefined);
      return () => { cancelled = true; };
    }
    setFullContent(undefined);
    noteStore.getById(noteId).then((n) => {
      if (!cancelled) setFullContent(n?.content);
    }).catch(() => { /* 读取失败保持空内容 */ });
    return () => { cancelled = true; };
  }, [noteId]);

  const titleRef = useRef<HTMLInputElement>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // P4 截图视觉提取：独立文件入口（不干扰原生图片插入流程）
  const visionInputRef = useRef<HTMLInputElement>(null);
  const [visionExtracting, setVisionExtracting] = useState(false);
  const { toast } = useToast();

  const { editor, saveStatus, isDirty, debouncedSave, flushPendingSave, handleImageSelect } = useNoteEditor({
    noteId,
    rawContent: fullContent,
    noteKey: note?.id,
    updateNote,
  });

  /** P4 AI 提取图片文字/公式：base64 → extractScreenContent → 插入编辑器 */
  const handleVisionExtract = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setVisionExtracting(true);
    toast({ type: 'info', message: 'AI 正在提取图片内容…', duration: 1500 });
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // 剥离 data:image/...;base64, 前缀（插件契约要求裸 base64）
          resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
        };
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
      const result = await aiPluginLoader.extractScreenContent(base64, 'zh');
      const parts = [result.text];
      if (result.keyPoints.length > 0) parts.push('', '**要点**', ...result.keyPoints.map((k) => `- ${k}`));
      if (result.formulas.length > 0) parts.push('', '**公式**', ...result.formulas);
      const insertText = parts.filter(Boolean).join('\n');
      editor.chain().focus().insertContent(insertText).run();
      soundPlayer.play('ai_analysis_done');
      toast({ type: 'success', message: `已提取图片内容（${insertText.length} 字符）`, silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast({ type: 'error', message: `AI 提取失败：${msg}` });
    } finally {
      setVisionExtracting(false);
    }
  }, [editor, toast]);

  const ai = useNoteAI(editor, noteId);

  // === N2 合书测试模式 ===
  const [closedBook, setClosedBook] = useState(false);

  // === 滚书背诵模式（4 轮渐进回忆，与合书测试平行入口）===
  const [recallOpen, setRecallOpen] = useState(false);

  // === 阅读模式（自适应排版 + 阅读引导线）===
  const [readingMode, setReadingMode] = useState(false);

  // === 知识信息图生成（AI 网关不可用时 hook 内部回退默认图，优雅降级）===
  const [infographicOpen, setInfographicOpen] = useState(false);
  const {
    infographic,
    loading: infographicLoading,
    error: infographicError,
    isFallback,
    generateInfographic,
  } = useAIInfographic();

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

  // === 阅读模式排版：内容难度估算（1-5，文本长度启发式）→ 自适应 CSS 变量 ===
  const contentDifficulty = useMemo(() => {
    const len = (healthText || '').trim().length;
    if (len < 200) return 1;
    if (len < 600) return 2;
    if (len < 1200) return 3;
    if (len < 2000) return 4;
    return 5;
  }, [healthText]);

  const typographyVars = useAdaptiveTypography({
    contentDifficulty,
    enableReadingGuide: readingMode,
  });

  // 阅读模式：切换编辑器可编辑态（开启=只读，关闭/卸载=恢复可编辑）
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!readingMode);
  }, [editor, readingMode]);

  // 窗口失焦时 flush 未保存的编辑
  useEffect(() => {
    const handleBlur = () => {
      flushPendingSave();
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [flushPendingSave]);

  // 卸载时兜底恢复可编辑（防 StrictMode 双挂载/路由切换遗留只读态）
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed) editor.setEditable(true);
    };
  }, [editor]);

  // AI 信息图降级提示：网关不可用时 toast 温和告知（结果仍展示默认图，不阻断）
  useEffect(() => {
    if (infographicError) {
      toast({ type: 'info', message: infographicError, duration: 3000 });
    }
  }, [infographicError, toast]);

  // === N6 概念冲突检测：内容稳定后自动比对新旧理解 ===
  const { conflicts, dismiss: dismissConflicts } = useConceptConflict(noteId, healthText, allNotes);

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

  // 解析自由画布数据（全文惰性加载后可得）
  const freeCanvasData = useMemo<FreeCanvasData | null>(() => {
    if (!fullContent || note?.template !== 'free') return null;
    try {
      const parsed = JSON.parse(fullContent);
      if (parsed && parsed.blocks) return {
        blocks: parsed.blocks,
        canvasWidth: parsed.canvasWidth ?? 3000,
        canvasHeight: parsed.canvasHeight ?? 3000,
      };
      return null;
    } catch { return null; }
  }, [note?.id, fullContent, note?.template]);
  
  // 自由画布变更回调（稳定引用，避免每次渲染重建）
  const handleFreeCanvasChange = useCallback(
    (data: FreeCanvasData) => {
      if (noteId) debouncedSave(() => JSON.stringify(data));
    },
    [noteId, debouncedSave],
  );

  // 思维导图数据解析（模板笔记提供合法 JSON；损坏/空时回退默认导图）
  const mindmapData = useMemo<MindmapData>(() => {
    if (note?.template === 'mindmap' && fullContent) {
      const parsed = parseMindmapData(fullContent);
      if (parsed) return parsed;
    }
    return createDefaultMindmap();
  }, [note?.id, fullContent, note?.template]);

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

  // 滚书背诵入口：与合书测试同策略，先取最新快照再打开
  const handleOpenRollingRecall = useCallback(() => {
    refreshHealthText();
    setRecallOpen(true);
  }, [refreshHealthText]);

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
  }, [editor, note?.title, generateInfographic, toast]);

  // 内容分层入口：同理先取最新快照
  const handleOpenTier = useCallback(() => {
    refreshHealthText();
    setTierOpen(true);
  }, [refreshHealthText]);

  // 阶段四：导出当前笔记为 Markdown（导图笔记降级为大纲）
  // P1-1：内存为投影，导出前从库取全文（用户显式操作，成本可接受）
  const handleExportMarkdown = async () => {
    if (!note) return;
    const full = fullContent ?? (await noteStore.getById(note.id))?.content ?? '';
    const md = noteToMarkdown(full);
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
        <EditorToolbar editor={editor} onPickImage={() => imageInputRef.current?.click()} healthContent={healthText} healthTitle={note?.title} healthTags={note?.tags} onToggleClosedBook={handleOpenClosedBook} />
      )}

      {/* P4 AI 提取图片文字 / 信息图 / 滚书背诵 / 阅读模式 入口（独立于图片插入流程） */}
      {!isCornell && !isFree && !isMindmap && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/20 bg-bg-elevated/20">
          <button
            onClick={() => visionInputRef.current?.click()}
            disabled={visionExtracting}
            className="flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 text-text-tertiary transition-colors hover:text-brand-600 hover:bg-brand-500/10 disabled:opacity-50"
            title="选择截图/图片，AI 提取文字与公式后插入笔记"
          >
            <ScanText className="w-3.5 h-3.5" strokeWidth={1.5} />
            {visionExtracting ? '提取中…' : 'AI 提取图片文字'}
          </button>
          <button
            onClick={handleGenerateInfographic}
            disabled={infographicLoading}
            className="flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 text-text-tertiary transition-colors hover:text-brand-600 hover:bg-brand-500/10 disabled:opacity-50"
            title="AI 将笔记内容转化为结构化信息图"
          >
            <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />
            {infographicLoading ? '生成中…' : '生成信息图'}
          </button>
          <button
            onClick={handleOpenRollingRecall}
            className="flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 text-text-tertiary transition-colors hover:text-brand-600 hover:bg-brand-500/10"
            title="滚书背诵：4 轮渐进式回忆（通读→精读→闭卷→默写）"
          >
            <BookMarked className="w-3.5 h-3.5" strokeWidth={1.5} />
            滚书背诵
          </button>
          <button
            onClick={() => setReadingMode((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 transition-colors',
              readingMode
                ? 'text-brand-600 bg-brand-500/10'
                : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-500/10',
            )}
            title="阅读模式：自适应排版 + 阅读引导线，专注阅读"
          >
            <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
            {readingMode ? '退出阅读' : '阅读模式'}
          </button>
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

      {/* P4 隐藏的 AI 提取图片 input */}
      <input
        ref={visionInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleVisionExtract}
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
        <div
          data-reading-guide-container
          className="h-full overflow-y-auto px-kb-md py-kb-lg bg-[rgba(255,253,250,0.3)] dark:bg-[rgba(16,24,44,0.5)]"
          style={readingMode ? (typographyVars as React.CSSProperties) : undefined}
        >
          {/* 阅读模式：引导线叠加（fixed 定位，不占文档流） */}
          {readingMode && <ReadingGuide />}
          <div
            className={cn('max-w-[720px] mx-auto transition-all duration-300', closedBook && 'blur-md select-none pointer-events-none')}
            onContextMenu={closedBook ? undefined : ctxMenu.onContextMenu}
          >
            {isCornell ? (
              <CornellLayout
                content={(() => { try { return JSON.parse(fullContent || '{}'); } catch { return {}; } })()}
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
                <div ref={editorWrapperRef}>
                                <PredictionPrompt noteTitle={note?.title || ''} noteContent={fullContent || ''} noteId={noteId || ''} onDismiss={() => {}} />
                                <EditorContent editor={editor} />
                              </div>
                {/* 非待办笔记模板时在底部显示统计 */}
                {note.template !== 'todo' && <TodoStats editor={editor} />}
                {/* 阶段二：反向链接面板（无引用时不显示） */}
                <BacklinksPanel noteId={note.id} />
                <WikiLinkPreview editorContainerRef={editorWrapperRef} />
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

    {/* 知识信息图弹窗：AI 生成中显示 spinner，失败时 hook 已回退默认图（降级提示见 toast） */}
    <Modal
      open={infographicOpen}
      onClose={() => setInfographicOpen(false)}
      title="知识信息图"
      description={infographicError ?? 'AI 将笔记内容可视化为结构化信息图'}
      size="lg"
    >
      {infographicLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-text-tertiary">
            <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
            <span className="text-b2">AI 正在生成信息图…</span>
          </div>
        </div>
      ) : infographic ? (
        <div className="max-h-[60vh] overflow-y-auto">
          <InfographicRenderer data={infographic} />
          {isFallback && (
            <p className="mt-3 text-c1 text-text-tertiary">AI 信息图服务暂不可用，已展示默认信息图。</p>
          )}
          <div className="flex justify-end mt-3">
            <button
              onClick={() => {
                const svg = document.querySelector('.infographic-renderer svg');
                if (!svg) return;
                const svgData = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `infographic-${Date.now()}.svg`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-kb-md text-c1 font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
              导出 SVG
            </button>
          </div>
        </div>
      ) : null}
    </Modal>

    {/* 滚书背诵弹窗：4 轮渐进式回忆 */}
    <Modal
      open={recallOpen}
      onClose={() => setRecallOpen(false)}
      title="滚书背诵"
      description="4 轮渐进式回忆：通读标记 → 精读理解 → 闭卷回忆 → 默写输出"
      size="lg"
    >
      <RollingRecallMode
        noteContent={healthText}
        noteTitle={note.title}
        onClose={() => setRecallOpen(false)}
        className="max-h-[60vh]"
      />
    </Modal>

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
