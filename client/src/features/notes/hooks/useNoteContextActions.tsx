/**
 * @ai-context: 笔记右键菜单动作 Hook：菜单分组定义（ctxMenuGroups）+ 菜单项选择处理
 * （打开/置顶/复制/导出/保质期/AI 摘要/闪卡/播客/删除）。自 NotesPage.tsx 原样拆出，
 * 页面内与笔记相关的动作经 options 注入（onPodcast 由页面编排播客状态流）。
 * @ai-context: Note context-menu actions hook (groups + select handler) extracted
 * verbatim from NotesPage.tsx. Note-related actions are injected via options;
 * onPodcast lets the page drive the podcast state flow.
 */
import { useCallback, useMemo } from 'react';
import { BookOpen, Pin, Copy, Download, Sparkles, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { copyText } from '@/lib/utils/clipboard';
import { useAISummarize, useAIFlashcards } from '@/lib/ai/useAI';
import { useAIErrorHandler } from '@/lib/ai/hooks/useAIErrorHandler';
import { noteStore } from '@/lib/storage';
import type { Note } from '@/types/models';
import { useNoteStore } from '../store/useNoteStore';
import { extractNoteText } from '../lib/extractNoteText';

interface NoteContextActionOptions {
  /** 打开编辑（进入笔记页） */
  onOpen: (id: string) => void;
  /** 置顶/取消置顶 */
  onTogglePin: (id: string) => void;
  /** 复制笔记 */
  onDuplicate: (note: Note) => void;
  /** 导出笔记为 Markdown */
  onExport: (note: Note) => void;
  /** 请求删除笔记 */
  onDelete: (id: string) => void;
  /** 以笔记标题为主题生成播客（页面负责设置 topic/showPodcast 并调用 generatePodcast） */
  onPodcast: (topic: string) => void;
}

export function useNoteContextActions({
  onOpen,
  onTogglePin,
  onDuplicate,
  onExport,
  onDelete,
  onPodcast,
}: NoteContextActionOptions) {
  const { toast } = useToast();
  const { summarize } = useAISummarize();
  const { generateStream: aiGenerateCardsStream } = useAIFlashcards();
  const handleSummarizeError = useAIErrorHandler('AI 摘要生成失败');
  const handleFlashcardError = useAIErrorHandler('AI 闪卡生成失败');
  const setExpiry = useNoteStore((s) => s.setExpiry);

  const ctxMenuGroups = useMemo<ContextMenuGroup[]>(() => [
    { label: '笔记操作', items: [
      { key: 'open', label: '打开编辑', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'pin', label: '置顶/取消置顶', icon: <Pin className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'duplicate', label: '复制', icon: <Copy className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'export', label: '导出', icon: <Download className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'expiry', label: '设置保质期', icon: <span className="w-4 h-4 flex items-center justify-center text-xs">⏳</span> },
    ]},
    { label: 'AI 操作', items: [
      { key: 'ai-summary', label: '生成摘要', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'ai-flashcard', label: '生成闪卡', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
      // P1 AI 播客：笔记转双人播客脚本 + TTS 播放
      { key: 'ai-podcast', label: '🎧 生成播客', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
    ]},
    { items: [
      { key: 'delete', label: '删除', icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />, danger: true },
    ]},
  ], []);

  const handleCtxMenuSelect = useCallback(async (itemKey: string, noteCtx: Note) => {
    switch (itemKey) {
      case 'open': onOpen(noteCtx.id); break;
      case 'pin': onTogglePin(noteCtx.id); break;
      case 'duplicate': onDuplicate(noteCtx); break;
      case 'export': onExport(noteCtx); break;
      case 'delete': onDelete(noteCtx.id); break;
            case 'expiry': {
              const days = prompt('设置知识保质期（天）：\n输入天数，例如 30 表示 30 天后过期；留空或输入 0 可清除已设保质期。', '30');
              if (days === null) break;
              const n = parseInt(days, 10);
              if (isNaN(n) || n < 0) { toast({ type: 'warning', message: '请输入有效天数' }); break; }
              const expiresAt = n > 0 ? new Date(Date.now() + n * 86400000) : null;
              await setExpiry(noteCtx.id, expiresAt);
              toast({ type: 'success', message: expiresAt ? `保质期已设为 ${n} 天` : '已清除保质期', silent: true });
              break;
            }
      case 'ai-summary': {
        // P1-1：预览仅 300 字符，AI 摘要需全文（显式操作，惰性取回）
        const full = (await noteStore.getById(noteCtx.id))?.content ?? '';
        const text = extractNoteText(full);
        if (text.length < 10) { toast({ type: 'warning', message: '笔记内容太少，无法生成摘要' }); break; }
        toast({ type: 'info', message: 'AI 正在生成摘要...' });
        try {
          const result = await summarize(text, { maxLength: 200, style: 'bullet', language: 'zh' });
          if (result?.summary) { await copyText(result.summary); toast({ type: 'success', message: 'AI 摘要已生成并复制到剪贴板', silent: true }); }
          else { toast({ type: 'warning', message: 'AI 未能生成摘要，请检查内容或稍后重试', silent: true }); }
        } catch (error) { handleSummarizeError(error); }
        break;
      }
      case 'ai-flashcard': {
        // P1-1：预览仅 300 字符，AI 闪卡需全文（显式操作，惰性取回）
        const full = (await noteStore.getById(noteCtx.id))?.content ?? '';
        const text = extractNoteText(full);
        if (text.length < 20) { toast({ type: 'warning', message: '笔记内容太少，无法生成闪卡' }); break; }
        toast({ type: 'info', message: 'AI 闪卡生成中...' });
        try {
          // A 组流式接入：走 /generate-cards/stream SSE（打字机累积），失败自动降级非流式
          const result = await aiGenerateCardsStream(text, { count: 10, difficulty: 'medium' });
          if (result?.cards?.length) { toast({ type: 'success', message: `AI 已生成 ${result.cards.length} 张闪卡，请在笔记编辑页中使用右键菜单逐张添加`, silent: true }); }
          else { toast({ type: 'warning', message: 'AI 未能生成闪卡，请检查内容或稍后重试', silent: true }); }
        } catch (error) { handleFlashcardError(error); }
        break;
      }
      case 'ai-podcast': {
        // P1 AI 播客：以笔记标题为主题生成播客（useAIPodcast 自带网关直连 + 本地降级）
        const topic = noteCtx.title || '知识小酌';
        onPodcast(topic);
        break;
      }
    }
  }, [onOpen, onTogglePin, onDuplicate, onExport, onDelete, onPodcast, toast, summarize, aiGenerateCardsStream, handleSummarizeError, handleFlashcardError, setExpiry]);

  return { ctxMenuGroups, handleCtxMenuSelect };
}
