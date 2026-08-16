/**
 * 反向链接面板（笔记底部）——上下文增强版
 * Backlinks panel (bottom of note editor) — enhanced with context preview
 *
 * @ai-context: 查询 noteLinks 中 toId=当前笔记 的链接，解析来源笔记标题，
 * 显示关联上下文段落（前后各 N 字符），按相关性强度排序。无反链时返回 null。
 * 点击 chip 跳转到来源笔记编辑页。
 * @ai-context: Queries noteLinks targeting the current note, resolves source
 * titles, displays context snippets sorted by relevance. null when no backlinks.
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, ArrowUpDown } from 'lucide-react';
import { getBacklinks } from '../lib/links/noteLinkStore';
import { useNoteStore } from '../store/useNoteStore';

interface BacklinkEntry {
  id: string;
  title: string;
  contextText?: string;
  relevanceScore?: number;
}

type SortMode = 'relevance' | 'title' | 'date';

export function BacklinksPanel({ noteId }: { noteId: string }) {
  const navigate = useNavigate();
  const notes = useNoteStore((s) => s.notes);
  const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBacklinks(noteId)
      .then((links) => {
        if (cancelled) return;
        const seen = new Map<string, BacklinkEntry>();
        for (const link of links) {
          if (seen.has(link.fromId)) {
            // 合并来自同一笔记的多个链接上下文
            const existing = seen.get(link.fromId)!;
            if (link.contextText && !existing.contextText?.includes(link.contextText)) {
              existing.contextText = [existing.contextText, link.contextText]
                .filter(Boolean)
                .join(' ... ');
            }
            if (link.relevanceScore && existing.relevanceScore) {
              existing.relevanceScore = Math.max(existing.relevanceScore, link.relevanceScore);
            }
            continue;
          }
          const note = notes.find((n) => n.id === link.fromId);
          if (!note) continue;
          seen.set(link.fromId, {
            id: link.fromId,
            title: note.title || '未命名笔记',
            contextText: link.contextText,
            relevanceScore: link.relevanceScore ?? 0.5,
          });
        }
        setBacklinks([...seen.values()]);
      })
      .catch((err) => {
        console.debug('[BacklinksPanel] load backlinks failed', err);
      });
    return () => { cancelled = true; };
  }, [noteId, notes]);

  const sorted = useMemo(() => {
    const list = [...backlinks];
    switch (sortMode) {
      case 'relevance':
        return list.sort((a, b) => (b.relevanceScore ?? 0.5) - (a.relevanceScore ?? 0.5));
      case 'title':
        return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'date':
        return list;
    }
  }, [backlinks, sortMode]);

  if (backlinks.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-border/40">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-c1 text-text-tertiary">
          <Link2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>{backlinks.length} 个反向链接</span>
        </div>
        <button
          onClick={() => setSortMode((m) => m === 'relevance' ? 'title' : 'relevance')}
          className="flex items-center gap-1 text-c1 text-text-tertiary hover:text-text-primary transition-colors"
          title="切换排序方式"
        >
          <ArrowUpDown className="w-3 h-3" strokeWidth={1.5} />
          <span>{sortMode === 'relevance' ? '按相关度' : '按标题'}</span>
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {sorted.map((b) => (
          <div key={b.id} className="group">
            <button
              onClick={() => navigate(`/notes/${b.id}`)}
              className="inline-flex items-center px-2.5 py-1 rounded-kb-sm bg-brand-50 text-brand-700 text-b3 font-medium hover:bg-brand-100 transition-colors"
            >
              {b.title}
            </button>
            {b.contextText && (
              <button
                onClick={() => setExpandedId(expandedId === b.id ? null : b.id)}
                className="ml-2 text-c1 text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <span className="text-c1 text-text-tertiary/70">
                  &ldquo;{b.contextText.slice(0, expandedId === b.id ? 300 : 80)}{b.contextText.length > 80 && expandedId !== b.id ? '...' : ''}&rdquo;
                </span>
                {b.contextText.length > 80 && (
                  <span className="ml-1 text-c1 text-brand-500 hover:text-brand-600">
                    {expandedId === b.id ? '收起' : '展开'}
                  </span>
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default BacklinksPanel;