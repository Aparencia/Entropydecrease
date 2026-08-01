/**
 * 反向链接面板（笔记底部）
 * Backlinks panel (bottom of note editor)
 *
 * @ai-context: 阶段二双向链接。查询 noteLinks 中 toId=当前笔记 的链接，
 * 解析来源笔记标题（取自 useNoteStore.notes），去重后列出可点击跳转的 chip。
 * 无反链时返回 null（不占位）。依赖 notes 变化自动刷新（新建链接后可见）。
 * @ai-context: Queries noteLinks targeting the current note, resolves source
 * titles from the notes store, renders clickable chips; null when no backlinks.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
import { getBacklinks } from '../lib/links/noteLinkStore';
import { useNoteStore } from '../store/useNoteStore';

interface BacklinkEntry {
  id: string;
  title: string;
}

export function BacklinksPanel({ noteId }: { noteId: string }) {
  const navigate = useNavigate();
  const notes = useNoteStore((s) => s.notes);
  const [backlinks, setBacklinks] = useState<BacklinkEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    getBacklinks(noteId)
      .then((links) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const entries: BacklinkEntry[] = [];
        for (const link of links) {
          if (seen.has(link.fromId)) continue;
          const note = notes.find((n) => n.id === link.fromId);
          if (!note) continue;
          seen.add(link.fromId);
          entries.push({ id: note.id, title: note.title });
        }
        setBacklinks(entries);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [noteId, notes]);

  if (backlinks.length === 0) return null;

  return (
    <div className="mt-6 pt-4 border-t border-border/40">
      <div className="flex items-center gap-1.5 text-c1 text-text-tertiary mb-2">
        <Link2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        <span>{backlinks.length} 个反向链接</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {backlinks.map((b) => (
          <button
            key={b.id}
            onClick={() => navigate(`/notes/${b.id}`)}
            className="inline-flex items-center px-2.5 py-1 rounded-kb-sm bg-brand-50 text-brand-700 text-b3 font-medium hover:bg-brand-100 transition-colors"
          >
            {b.title || '未命名笔记'}
          </button>
        ))}
      </div>
    </div>
  );
}
