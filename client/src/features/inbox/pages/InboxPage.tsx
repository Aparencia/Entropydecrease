/**
 * 统一收件箱页 — 三路来源待沉淀项汇聚与操作
 * Unified inbox page — convergent tray for pending captures
 *
 * @ai-context: 展示 inbox_items 全部条目（来源/状态筛选）。剪贴板来源由
 * 全局快捷键 Ctrl+Shift+B 实时灌入（capture-clipboard → ShortcutRoot →
 * inboxRepository）；inspiration/import 来源已具备 schema 与筛选位，
 * 待后续管线接线。操作：沉淀（settled）/ 归档（archived，可逆）/ 删除。
 * @ai-context: Lists inbox_items with source/status filters. Clipboard items
 * flow in live via the global shortcut; inspiration/import sources are
 * schema-ready for future pipelines. Actions: settle / archive / delete.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inbox, CheckCircle2, Archive, Trash2, Clipboard } from 'lucide-react';
import { useToast } from '@/components/ui';
import RitualHeader from '@/features/inspiration/components/RitualHeader';
import { SOURCE_META, STATUS_META } from '../types';
import type { InboxItem } from '../types';
import { listInboxItems, updateInboxStatus, deleteInboxItem } from '../lib/inboxRepository';
import { cn } from '@/lib/utils';

type SourceFilter = 'all' | InboxItem['source'];
type StatusFilter = 'all' | InboxItem['status'];

export default function InboxPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    const rows = await listInboxItems();
    setItems(rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(
      (i) =>
        (sourceFilter === 'all' || i.source === sourceFilter) &&
        (statusFilter === 'all' || i.status === statusFilter),
    );
  }, [items, sourceFilter, statusFilter]);

  const handleSettle = async (item: InboxItem) => {
    const ok = await updateInboxStatus(item.id, 'settled');
    if (ok) {
      toast({ type: 'success', message: '已标记为沉淀' });
      void load();
    }
  };

  const handleArchive = async (item: InboxItem) => {
    const ok = await updateInboxStatus(item.id, 'archived');
    if (ok) {
      toast({ type: 'info', message: '已归档（可再标记回待沉淀）' });
      void load();
    }
  };

  const handleDelete = async (item: InboxItem) => {
    const ok = await deleteInboxItem(item.id);
    if (ok) {
      toast({ type: 'info', message: '已删除' });
      void load();
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items?.length ?? 0 };
    for (const s of ['clipboard', 'inspiration', 'import'] as const) {
      c[s] = items?.filter((i) => i.source === s).length ?? 0;
    }
    return c;
  }, [items]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-kb-lg py-kb-xl">
      <RitualHeader title="收件箱" note="万物入井 待时而序">
        <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-bg-secondary/60 px-3 py-1.5 text-c1 text-text-tertiary backdrop-blur-xl">
          <Clipboard className="w-3.5 h-3.5" />
          Ctrl+Shift+B 随时收藏
        </div>
      </RitualHeader>

      {/* ── 筛选栏 ── */}
      <div className="flex flex-col gap-2 rounded-2xl border border-border/30 bg-bg-secondary/40 p-3 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSourceFilter('all')}
            className={cn(
              'rounded-full px-3 py-1 text-c1 font-medium transition-colors',
              sourceFilter === 'all' ? 'bg-brand-600/20 text-brand-400' : 'text-text-tertiary hover:text-text-secondary',
            )}
          >
            全部 {counts.all}
          </button>
          {(Object.keys(SOURCE_META) as InboxItem['source'][]).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(sourceFilter === s ? 'all' : s)}
              className={cn(
                'rounded-full px-3 py-1 text-c1 font-medium transition-colors',
                sourceFilter === s ? 'bg-brand-600/20 text-brand-400' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {SOURCE_META[s].label} {counts[s]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {(Object.keys(STATUS_META) as InboxItem['status'][]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-c1 transition-colors',
                statusFilter === s ? 'text-text-primary underline underline-offset-4' : 'text-text-tertiary hover:text-text-secondary',
              )}
            >
              {STATUS_META[s].label}
            </button>
          ))}
          {statusFilter !== 'all' && (
            <button onClick={() => setStatusFilter('all')} className="text-c1 text-text-tertiary hover:text-text-secondary">
              清除
            </button>
          )}
        </div>
      </div>

      {/* ── 条目列表 ── */}
      {items === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-bg-secondary/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="kb-ritual-empty py-kb-xl">
          <Inbox className="mx-auto mb-2 w-8 h-8 text-text-tertiary/40" />
          <p className="kb-ritual-empty-title">{items.length === 0 ? '收件箱尚空' : '没有匹配的条目'}</p>
          <p className="kb-ritual-empty-note">
            {items.length === 0 ? '选中内容后按 Ctrl+Shift+B 收藏到这里' : '换个筛选条件试试'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-2xl border border-border/30 bg-bg-secondary/50 p-4 backdrop-blur-xl transition-colors hover:border-accent-400/40"
            >
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-c1 font-medium ${SOURCE_META[item.source].badge}`}>
                  {SOURCE_META[item.source].label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-c1 font-medium ${STATUS_META[item.status].badge}`}>
                  {STATUS_META[item.status].label}
                </span>
                <span className="ml-auto text-c1 text-text-tertiary">
                  {new Date(item.created_at).toLocaleString()}
                </span>
              </div>
              {item.title && <p className="text-b2 font-medium text-text-primary">{item.title}</p>}
              <p className="line-clamp-3 whitespace-pre-wrap text-c1 text-text-secondary">{item.content}</p>
              <div className="flex items-center justify-end gap-1.5">
                {item.status === 'new' && (
                  <button
                    onClick={() => void handleSettle(item)}
                    className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-c1 font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> 标记沉淀
                  </button>
                )}
                {item.status !== 'archived' && (
                  <button
                    onClick={() => void handleArchive(item)}
                    className="flex items-center gap-1 rounded-full bg-bg-tertiary px-3 py-1 text-c1 font-medium text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    <Archive className="w-3.5 h-3.5" /> 归档
                  </button>
                )}
                {item.status === 'archived' && (
                  <button
                    onClick={() => void handleSettle(item)}
                    className="rounded-full bg-bg-tertiary px-3 py-1 text-c1 font-medium text-text-tertiary transition-colors hover:text-text-secondary"
                  >
                    恢复待沉淀
                  </button>
                )}
                <button
                  onClick={() => void handleDelete(item)}
                  className="flex items-center gap-1 rounded-full bg-bg-tertiary px-3 py-1 text-c1 font-medium text-text-tertiary transition-colors hover:text-semantic-error"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
