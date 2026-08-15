/**
 * 笔记生命周期管理
 * Note lifecycle management
 *
 * @ai-context: 每篇笔记经历完整生命周期：萌芽（新建）→生长（编辑中）→
 * 整理（已分类链接）→复习（进入复习循环）→沉淀（掌握后归档）。
 * 生命周期状态自动驱动UI行为，半衰期动态调整。
 * @ai-context: Each note goes through a lifecycle: sprout (new) → grow
 * (editing) → sort (categorized/linked) → review (review cycle) →
 * settle (mastered/archived). Lifecycle drives UI behavior.
 */
import { useMemo } from 'react';
import { Sprout, TrendingUp, FolderTree, RefreshCw, Archive, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LifecycleStage = 'sprout' | 'grow' | 'sort' | 'review' | 'settle';

interface NoteLifecycleProps {
  stage: LifecycleStage;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 字数 */
  wordCount: number;
  /** 链接数 */
  linkCount: number;
  /** 是否已完成合书测试 */
  hasClosedBookTest: boolean;
  /** 半衰期天数 */
  expiresInDays?: number;
}

const STAGE_META: Record<LifecycleStage, { label: string; icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>; color: string; desc: string }> = {
  sprout: { label: '萌芽', icon: Sprout, color: 'text-emerald-500', desc: '新创建的笔记，开始记录想法' },
  grow: { label: '生长', icon: TrendingUp, color: 'text-blue-500', desc: '正在编辑完善中' },
  sort: { label: '整理', icon: FolderTree, color: 'text-indigo-500', desc: '已分类、已建立链接' },
  review: { label: '复习', icon: RefreshCw, color: 'text-violet-500', desc: '进入复习循环' },
  settle: { label: '沉淀', icon: Archive, color: 'text-purple-500', desc: '已掌握，归档保存' },
};

export function NoteLifecycle({ stage, createdAt, updatedAt: _updatedAt, wordCount, linkCount, hasClosedBookTest: _hasClosedBookTest, expiresInDays }: NoteLifecycleProps) {
  const meta = STAGE_META[stage];
  const Icon = meta.icon;

  const nextStage = useMemo((): LifecycleStage | null => {
    const order: LifecycleStage[] = ['sprout', 'grow', 'sort', 'review', 'settle'];
    const idx = order.indexOf(stage);
    return idx < order.length - 1 ? order[idx + 1] : null;
  }, [stage]);

  const daysSinceCreate = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);

  return (
    <div className="p-3 rounded-kb-md border border-border/30 bg-bg-secondary">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: meta.color.replace('text-', '') }} />
        <span className="text-b3 font-medium text-text-primary">{meta.label}</span>
        <span className="text-c1 text-text-tertiary ml-auto">{meta.desc}</span>
      </div>

      {/* 生命周期进度条 */}
      <div className="flex items-center gap-1 mb-3">
        {(Object.entries(STAGE_META) as [LifecycleStage, typeof meta][]).map(([key]) => {
          const order = ['sprout', 'grow', 'sort', 'review', 'settle'];
          const currentIdx = order.indexOf(stage);
          const keyIdx = order.indexOf(key);
          const isActive = key === stage;
          const isPast = keyIdx <= currentIdx;

          return (
            <div key={key} className="flex items-center flex-1">
              <div className={cn(
                'w-2 h-2 rounded-full transition-colors',
                isPast ? 'bg-brand-500' : 'bg-bg-tertiary',
                isActive && 'ring-2 ring-brand-300 ring-offset-1 ring-offset-bg-secondary',
              )} />
              {keyIdx < 4 && (
                <div className={cn('flex-1 h-0.5', isPast ? 'bg-brand-500/50' : 'bg-bg-tertiary')} />
              )}
            </div>
          );
        })}
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-2 gap-2 text-c1 text-text-tertiary">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" strokeWidth={1.5} />
          <span>创建 {daysSinceCreate} 天</span>
        </div>
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" strokeWidth={1.5} />
          <span>{wordCount} 字</span>
        </div>
        <div className="flex items-center gap-1">
          <FolderTree className="w-3 h-3" strokeWidth={1.5} />
          <span>{linkCount} 链接</span>
        </div>
        {expiresInDays !== undefined && (
          <div className="flex items-center gap-1">
            <RefreshCw className="w-3 h-3" strokeWidth={1.5} />
            <span>半衰期 {expiresInDays} 天</span>
          </div>
        )}
      </div>

      {/* 下一步提示 */}
      {nextStage && (
        <div className="mt-2 pt-2 border-t border-border/20">
          <p className="text-c1 text-text-tertiary">
            下一步：<span className={meta.color}>{STAGE_META[nextStage].label}</span>
            {' — '}{STAGE_META[nextStage].desc}
          </p>
        </div>
      )}
    </div>
  );
}

export default NoteLifecycle;