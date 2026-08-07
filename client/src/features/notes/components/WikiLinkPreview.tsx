/**
 * WikiLinkPreview — 双链悬浮预览卡片
 * WikiLinkPreview — Hover preview card for [[wiki links]]
 *
 * @ai-context: 在 NoteEditPage 编辑区 hover `[[笔记名]]` 时弹出预览卡片，
 * 显示目标笔记的标题、摘要、模板标签、创建时间。点击卡片可导航到编辑页。
 * 基于 mouseover/mouseout 事件委托检测 .wiki-link 元素，无额外依赖。
 * @ai-context: Shows a floating preview card when hovering a [[wiki link]]
 * in the editor. Displays title, summary, template tag, and creation time.
 * Uses event delegation on .wiki-link elements. Click navigates to edit page.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNoteStore } from '../store/useNoteStore';
import { extractNoteText } from '../lib/extractNoteText';
import type { Note } from '@/types/models';

/** 模板标签色映射 */
const TEMPLATE_COLORS: Record<string, string> = {
  cornell: 'rgb(91,138,114)',
  outline: 'rgb(96,165,250)',
  mindmap: 'rgb(251,191,36)',
  todo: 'rgb(16,185,129)',
};

interface WikiLinkPreviewProps {
  /** 编辑器容器 ref */
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function WikiLinkPreview({ editorContainerRef }: WikiLinkPreviewProps) {
  const navigate = useNavigate();
  const notes = useNoteStore((s) => s.notes);
  const [target, setTarget] = useState<{ note: Note; x: number; y: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseOver = useCallback((e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.wiki-link') as HTMLElement | null;
    if (!el) return;
    const noteId = el.getAttribute('data-id');
    if (!noteId) return;
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    clearTimeout(hideTimer.current);
    setTarget({ note, x: e.clientX, y: e.clientY - 8 });
  }, [notes]);

  const handleMouseOut = useCallback((e: MouseEvent) => {
    const related = (e.relatedTarget as HTMLElement | null)?.closest('.wiki-link, .wiki-link-preview');
    if (related) return;
    hideTimer.current = setTimeout(() => setTarget(null), 150);
  }, []);

  useEffect(() => {
    const el = editorContainerRef.current;
    if (!el) return;
    el.addEventListener('mouseover', handleMouseOver);
    el.addEventListener('mouseout', handleMouseOut);
    return () => {
      el.removeEventListener('mouseover', handleMouseOver);
      el.removeEventListener('mouseout', handleMouseOut);
      clearTimeout(hideTimer.current);
    };
  }, [editorContainerRef, handleMouseOver, handleMouseOut]);

  if (!target) return null;

  const snippet = extractNoteText(target.note.content).slice(0, 100);
  const color = TEMPLATE_COLORS[target.note.template] || 'rgb(156,163,175)';

  return (
    <div
      className="wiki-link-preview fixed z-[9999] w-64 rounded-xl border border-border/40 bg-bg-elevated/95 backdrop-blur-xl shadow-xl p-3 pointer-events-auto"
      style={{ left: Math.min(target.x, window.innerWidth - 280), top: Math.max(target.y, 8) }}
      onMouseEnter={() => clearTimeout(hideTimer.current)}
      onMouseLeave={() => setTarget(null)}
      onClick={() => {
        setTarget(null);
        if (target.note.id) navigate(`/notes/${target.note.id}`);
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: color }}
        />
        <h4 className="text-[13px] font-semibold text-text-primary truncate">
          {target.note.title}
        </h4>
      </div>
      {snippet && (
        <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-3 mb-2">
          {snippet}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: `${color}15`, color }}
        >
          {target.note.template}
        </span>
        <span className="text-[10px] text-text-tertiary ml-auto font-mono">
          {new Date(target.note.createdAt).toLocaleDateString('zh-CN')}
        </span>
      </div>
    </div>
  );
}