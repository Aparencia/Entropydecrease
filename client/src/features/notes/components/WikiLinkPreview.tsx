/**
 * WikiLinkPreview — 双链悬浮预览卡片（多标签增强版）
 * WikiLinkPreview — Hover preview card with multi-tab support
 *
 * @ai-context: 在 NoteEditPage 编辑区 hover `[[wiki link]]` 时弹出预览卡片，
 * 支持多标签切换：摘要/链接/锚点。显示目标笔记的标题、摘要、模板标签、创建时间。
 * 点击卡片可导航到编辑页。
 * @ai-context: Shows a floating preview card with multi-tab support
 * (summary/links/anchor points) when hovering a [[wiki link]] in the editor.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNoteStore } from '../store/useNoteStore';
import { extractNoteText } from '../lib/extractNoteText';
import { getBacklinks } from '../lib/links/noteLinkStore';
import type { Note } from '@/types/models';

/** 模板标签色映射 */
const TEMPLATE_COLORS: Record<string, string> = {
  cornell: 'rgb(91,138,114)',
  outline: 'rgb(96,165,250)',
  mindmap: 'rgb(251,191,36)',
  todo: 'rgb(16,185,129)',
};

type PreviewTab = 'summary' | 'links' | 'anchors';

interface WikiLinkPreviewProps {
  editorContainerRef: React.RefObject<HTMLDivElement | null>;
}

export function WikiLinkPreview({ editorContainerRef }: WikiLinkPreviewProps) {
  const navigate = useNavigate();
  const notes = useNoteStore((s) => s.notes);
  const [target, setTarget] = useState<{ note: Note; x: number; y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>('summary');
  const [backlinkCount, setBacklinkCount] = useState<number>(0);
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
    setActiveTab('summary');

    // 异步查询反向链接数
    getBacklinks(noteId).then((links) => setBacklinkCount(links.length)).catch((err) => {
      console.debug('[WikiLinkPreview] load backlink count failed', err);
    });
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

  const { note } = target;
  const snippet = extractNoteText(note.content).slice(0, 100);
  const color = TEMPLATE_COLORS[note.template] || 'rgb(156,163,175)';

  const tabs: { key: PreviewTab; label: string }[] = [
    { key: 'summary', label: '摘要' },
    { key: 'links', label: `链接 (${backlinkCount})` },
    { key: 'anchors', label: '锚点' },
  ];

  return (
    <div
      className="wiki-link-preview fixed z-[9999] w-72 rounded-xl border border-border/40 bg-bg-elevated/95 backdrop-blur-xl shadow-xl pointer-events-auto"
      style={{ left: Math.min(target.x, window.innerWidth - 300), top: Math.max(target.y, 8) }}
      onMouseEnter={() => clearTimeout(hideTimer.current)}
      onMouseLeave={() => setTarget(null)}
      onClick={() => {
        setTarget(null);
        if (note.id) navigate(`/notes/${note.id}`);
      }}
    >
      {/* 头部：标题 + 模板标签 */}
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: color }}
          />
          <h4 className="text-[13px] font-semibold text-text-primary truncate">
            {note.title}
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium"
            style={{ background: `${color}15`, color }}
          >
            {note.template}
          </span>
          <span className="text-[10px] text-text-tertiary font-mono">
            {new Date(note.createdAt).toLocaleDateString('zh-CN')}
          </span>
        </div>
      </div>

      {/* 标签切换 */}
      <div className="flex border-b border-border/30 px-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={(e) => { e.stopPropagation(); setActiveTab(tab.key); }}
            className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors border-b-2 ${
              activeTab === tab.key
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 标签内容 */}
      <div className="p-3 min-h-[60px]">
        {activeTab === 'summary' && (
          <div>
            {snippet ? (
              <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-4">
                {snippet}
              </p>
            ) : (
              <p className="text-[11px] text-text-tertiary italic">暂无内容</p>
            )}
          </div>
        )}

        {activeTab === 'links' && (
          <div>
            {backlinkCount > 0 ? (
              <p className="text-[11px] text-text-secondary">
                被 <span className="text-text-primary font-medium">{backlinkCount}</span> 篇笔记引用
              </p>
            ) : (
              <p className="text-[11px] text-text-tertiary italic">暂无反向链接</p>
            )}
          </div>
        )}

        {activeTab === 'anchors' && (
          <div>
            <p className="text-[11px] text-text-tertiary italic">
              锚点功能将在 AI 分析后可用
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default WikiLinkPreview;