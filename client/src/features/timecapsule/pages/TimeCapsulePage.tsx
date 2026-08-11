/**
 * 知识时光胶囊页
 *
 * @ai-context: 3.16 时光胶囊。封装（30/60/90 天后开启）+ 到期开启 +
 * 历史列表；快照由 capsuleService 封装时自动采集（Dexie 统计折算掌握度）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Hourglass, Gift, Sparkles } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { Button, EmptyState, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CAPSULE_MILESTONE_LABELS, type CapsuleMilestone, type TimeCapsule } from '../types';
import {
  checkDueCapsules,
  getRecentCapsules,
  openCapsule,
  removeCapsule,
  sealCapsule,
} from '../lib/capsuleService';
import { CapsuleCard } from '../components/CapsuleCard';

function formatOpenDate(milestone: CapsuleMilestone): string {
  return new Date(Date.now() + milestone * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function TimeCapsulePage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [capsules, setCapsules] = useState<TimeCapsule[]>([]);
  const [dueIds, setDueIds] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [milestone, setMilestone] = useState<CapsuleMilestone>(30);
  const [sealing, setSealing] = useState(false);

  const refresh = useCallback(() => {
    setCapsules(getRecentCapsules());
    setDueIds(new Set(checkDueCapsules().map((c) => c.id)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSeal = async () => {
    if (!content.trim()) {
      toast({ type: 'warning', message: '写点什么吧——胶囊里需要封存一段内容' });
      return;
    }
    setSealing(true);
    try {
      await sealCapsule({ title, content, milestone });
      toast({ type: 'success', message: `已封装，${CAPSULE_MILESTONE_LABELS[milestone]}后可开启` });
      setTitle('');
      setContent('');
      refresh();
    } catch {
      toast({ type: 'error', message: '封装失败，请稍后重试' });
    } finally {
      setSealing(false);
    }
  };

  const handleOpen = (capsule: TimeCapsule) => {
    const opened = openCapsule(capsule.id);
    if (!opened) return;
    toast({ type: 'success', message: `「${opened.title}」已开启` });
    refresh();
  };

  const handleDelete = (id: string) => {
    removeCapsule(id);
    toast({ type: 'info', message: '胶囊已删除' });
    refresh();
  };

  const dueCapsules = capsules.filter((c) => dueIds.has(c.id));
  const others = capsules.filter((c) => !dueIds.has(c.id));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶栏 */}
      <div className="flex items-center gap-kb-sm px-kb-md py-3 flex-shrink-0 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
        </button>
        <ModuleRitualHeader title="知识时光胶囊" sealChar="时" sealColor="#C4A37B" compact />
      </div>

      <div className="flex-1 overflow-y-auto px-kb-md py-4 flex flex-col gap-5">
        {/* 封装表单 */}
        <section className="rounded-kb-xl border border-border-subtle bg-bg-elevated p-4">
          <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-1.5">
            <Hourglass className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
            封装一封给未来的信
          </h3>
          <div className="flex flex-col gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题（可选，如：六月学习总结）"
              className="w-full rounded-kb-lg border border-border-subtle bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand-400/60"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="想对未来的自己说什么？当前的学习状态、困惑、目标……"
              rows={3}
              className="w-full resize-none rounded-kb-lg border border-border-subtle bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand-400/60"
            />
            {/* 里程碑选择 */}
            <div className="flex items-center gap-2 flex-wrap">
              {([30, 60, 90] as CapsuleMilestone[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMilestone(m)}
                  className={cn(
                    'px-3 py-1.5 rounded-kb-full text-xs font-medium border transition-colors',
                    milestone === m
                      ? 'bg-brand-500/10 text-brand-600 border-brand-300/50'
                      : 'text-text-tertiary border-border-subtle hover:text-text-primary',
                  )}
                >
                  {CAPSULE_MILESTONE_LABELS[m]}
                </button>
              ))}
              <span className="text-[11px] text-text-tertiary">
                将于 {formatOpenDate(milestone)} 开启
              </span>
            </div>
            <Button onClick={handleSeal} loading={sealing} icon={<Gift className="w-4 h-4" />}>
              封装时光胶囊
            </Button>
            <p className="text-[11px] text-text-tertiary flex items-center gap-1">
              <Sparkles className="w-3 h-3" strokeWidth={1.5} />
              封装时将自动记录当前掌握度快照（复习卡片 / 笔记 / 专注分钟）
            </p>
          </div>
        </section>

        {/* 到期胶囊 */}
        {dueCapsules.length > 0 && (
          <section>
            <h3 className="text-sm font-medium text-amber-600 mb-3">
              可以开启的胶囊（{dueCapsules.length}）
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {dueCapsules.map((c) => (
                <CapsuleCard key={c.id} capsule={c} due onOpen={handleOpen} onDelete={handleDelete} />
              ))}
            </div>
          </section>
        )}

        {/* 全部胶囊 */}
        <section className="flex-1">
          <h3 className="text-sm font-medium text-text-primary mb-3">胶囊收藏（{capsules.length}）</h3>
          {capsules.length === 0 ? (
            <EmptyState
              icon={<Hourglass className="w-10 h-10" strokeWidth={1.2} />}
              title="还没有时光胶囊"
              description="封装现在的学习状态，未来开启时回看成长"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {others.map((c) => (
                <CapsuleCard key={c.id} capsule={c} due={dueIds.has(c.id)} onOpen={handleOpen} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
