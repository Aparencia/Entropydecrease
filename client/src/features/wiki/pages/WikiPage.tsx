/**
 * 协作知识维基页面 — /wiki
 * Collaborative wiki page
 *
 * @ai-context: 本地优先——页面存于 localStorage（wikiStore），离线完全可用；
 * 多用户合并/多设备同步由现有 CRDT 基座（lib/sync/crdtEngine）承载，本页
 * 是 UI 层：列表 + 编辑器（内容自动保存，版本号随保存递增）。隐私：只展示
 * 贡献者颜色图例，不展示他人编辑内容。永不报错——存储失败静默降级。
 * @ai-context: Local-first wiki UI (list + editor). Pages persist to
 * localStorage; multi-user merge rides the existing CRDT infra. Contributors
 * shown as a color legend only. Storage failures degrade silently.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Trash2, Loader2 } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { Card, CardContent, Button, Input, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';
import type { WikiPage as WikiPageModel } from '../types';
import { createPage, deletePage, loadPages, savePageContent, toggleVote } from '../lib/wikiStore';
import ContributionLegend from '../components/ContributionLegend';
import WikiQualityBadge from '../components/WikiQualityBadge';

export default function WikiPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const nickname = useMemo(() => {
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    return (meta?.['display_name'] as string) || (meta?.['full_name'] as string) || undefined;
  }, [user]);

  const [pages, setPages] = useState<WikiPageModel[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPageRef = useRef<WikiPageModel | null>(null);

  // 首次加载（从 localStorage 恢复）
  useEffect(() => {
    const loaded = loadPages();
    setPages(loaded);
    if (loaded.length > 0) {
      const first = loaded[0];
      setActiveId(first.id);
      setContent(first.content);
      latestPageRef.current = first;
    }
  }, []);

  const active = pages.find((p) => p.id === activeId) ?? null;

  const persistContent = useCallback((page: WikiPageModel, nextContent: string) => {
    const saved = savePageContent(page, nextContent, nickname);
    latestPageRef.current = saved;
    setPages((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
  }, [nickname]);

  // 内容变化 → 300ms 防抖自动保存（本地优先，不打断书写）
  const handleContentChange = (next: string) => {
    setContent(next);
    const page = latestPageRef.current;
    if (!page) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistContent(page, next), 300);
  };

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const handleCreate = () => {
    if (creating) return;
    setCreating(true);
    try {
      const page = createPage(title, nickname);
      setPages((prev) => [page, ...prev]);
      setActiveId(page.id);
      setContent('');
      latestPageRef.current = page;
      setTitle('');
    } catch {
      toast({ type: 'warning', message: '创建失败：本地存储不可用' });
    } finally {
      setCreating(false);
    }
  };

  const handleSelect = (page: WikiPageModel) => {
    // 切换前 flush 未保存的编辑（防抖挂起时直接落盘）
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const current = latestPageRef.current;
      if (current) persistContent(current, content);
    }
    setActiveId(page.id);
    setContent(page.content);
    latestPageRef.current = page;
  };

  const handleDelete = (page: WikiPageModel) => {
    deletePage(page.id);
    const next = pages.filter((p) => p.id !== page.id);
    setPages(next);
    if (activeId === page.id) {
      setActiveId(next[0]?.id ?? null);
      setContent(next[0]?.content ?? '');
      latestPageRef.current = next[0] ?? null;
    }
  };

  const handleVote = (page: WikiPageModel) => {
    const updated = toggleVote(page);
    setPages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  return (
    <div className="mx-auto max-w-5xl px-kb-md py-kb-lg flex flex-col gap-kb-md">
      <ModuleRitualHeader
        title="协作知识维基"
        note="众人共编一部知识之书 —— 合并交给 CRDT，你只管写"
        sealChar="籍"
        sealColor="#7BC4B8"
        actions={<BookOpen className="w-5 h-5 text-feynman" strokeWidth={1.5} />}
      />

      <div className="grid md:grid-cols-[260px_1fr] gap-kb-md items-start">
        {/* ── 页面列表 ── */}
        <Card>
          <CardContent className="flex flex-col gap-kb-sm">
            <div className="flex gap-kb-xs">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="新页面标题…"
                maxLength={40}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                aria-label="新页面标题"
              />
              <Button
                onClick={handleCreate}
                disabled={creating}
                loading={creating}
                icon={creating ? undefined : <Plus className="w-4 h-4" />}
                className="flex-shrink-0"
                aria-label="创建页面"
              />
            </div>

            {pages.length === 0 ? (
              <p className="text-c1 text-text-tertiary text-center py-6">
                还没有页面，创建第一个吧
              </p>
            ) : (
              <ul className="flex flex-col gap-kb-xs max-h-[50vh] overflow-y-auto">
                {pages.map((page) => {
                  const isActive = page.id === activeId;
                  return (
                    <li key={page.id} className="group flex items-center gap-1">
                      <button
                        onClick={() => handleSelect(page)}
                        className={cn(
                          'flex-1 min-w-0 flex items-center gap-2 rounded-kb-md border px-kb-sm py-1.5 text-left transition-colors duration-kb-fast',
                          isActive
                            ? 'border-cyber/40 bg-cyber/5'
                            : 'border-border/40 hover:border-cyber/30 hover:bg-bg-elevated/50',
                        )}
                      >
                        <span className="w-1.5 h-1.5 rounded-kb-full flex-shrink-0" style={{ backgroundColor: page.contributors[0]?.color }} aria-hidden="true" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-b2 text-text-primary truncate">{page.title}</span>
                          <span className="block text-c2 text-text-tertiary/70">v{page.version} · {page.contributors.length} 人</span>
                        </span>
                      </button>
                      <button
                        onClick={() => handleDelete(page)}
                        className="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-red-500 transition-all duration-kb-fast p-1"
                        aria-label={`删除 ${page.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── 编辑器 ── */}
        <Card>
          <CardContent className="flex flex-col gap-kb-sm min-h-[60vh]">
            {!active ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16 text-text-tertiary">
                <Loader2 className="w-5 h-5 animate-spin" />
                <p className="text-c1">选择或创建一个页面开始编写</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-kb-xs">
                  <div className="flex items-center justify-between gap-kb-sm flex-wrap">
                    <h2 className="text-b1 font-medium text-text-primary">{active.title}</h2>
                    <span className="text-c2 text-text-tertiary/70 tabular-nums">v{active.version}</span>
                  </div>
                  <ContributionLegend contributors={active.contributors} />
                  <WikiQualityBadge page={active} onVote={handleVote} />
                </div>

                <textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="支持 Markdown 的页面内容…（自动保存到本地，合并由 CRDT 基座承载）"
                  className="flex-1 min-h-[45vh] w-full resize-y rounded-kb-md border border-border/40 bg-bg-primary px-kb-sm py-2 text-b2 text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:border-cyber/50 transition-colors duration-kb-fast font-mono text-[13px] leading-relaxed"
                  aria-label="页面内容编辑器"
                />
                <p className="text-c2 text-text-tertiary/70">
                  内容自动保存（本地优先）· 与他人协同编辑时，版本合并由现有 CRDT 基础设施完成
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
