/**
 * 时光胶囊卡片 — 密封/已开启两种形态
 *
 * @ai-context: 3.16 时光胶囊。密封态展示倒计时与锁，到期可开启；已开启态
 * 展示封存内容与学习快照；开启时有轻量 CSS 动画（尊重 prefers-reduced-motion
 * 由页面层控制，本组件动画成本极低）。
 */
import { Hourglass, Lock, Gift, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAPSULE_MILESTONE_LABELS } from '../types';
import type { TimeCapsule } from '../types';

interface CapsuleCardProps {
  capsule: TimeCapsule;
  due?: boolean;
  onOpen?: (capsule: TimeCapsule) => void;
  onDelete?: (id: string) => void;
}

/** 剩余天数（不足 1 天显示小时） */
function remainingText(openAt: string): string {
  const diff = new Date(openAt).getTime() - Date.now();
  if (diff <= 0) return '已到期';
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days >= 1) return `还剩 ${days} 天`;
  const hours = Math.max(1, Math.ceil(diff / (60 * 60 * 1000)));
  return `还剩 ${hours} 小时`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function CapsuleCard({ capsule, due, onOpen, onDelete }: CapsuleCardProps) {
  const isSealed = capsule.status === 'sealed';

  return (
    <>
      {/* 开启动画 keyframes（组件级内嵌，避免全局样式污染） */}
      <style>{`
        @keyframes ed-capsule-open {
          0% { transform: scale(0.92) rotate(-2deg); opacity: 0.4; }
          60% { transform: scale(1.02) rotate(0.5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
    <div
      className={cn(
        'relative rounded-kb-xl border bg-bg-elevated p-4',
        isSealed ? 'border-border-subtle' : 'border-brand-300/40 bg-brand-500/5',
        due && 'border-amber-400/60',
      )}
      style={isSealed ? undefined : { animation: 'ed-capsule-open 0.5s ease-out' }}
    >
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(capsule.id)}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-kb-full text-text-tertiary hover:text-red-500 hover:bg-bg-tertiary transition-colors"
          title="删除胶囊"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.5} />
        </button>
      )}

      {/* 头部 */}
      <div className="flex items-center gap-2 pr-8">
        {isSealed ? (
          <Hourglass className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
        ) : (
          <Gift className="w-4 h-4 text-brand-600 flex-shrink-0" strokeWidth={1.5} />
        )}
        <span className="text-sm font-medium text-text-primary truncate">{capsule.title}</span>
      </div>

      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-tertiary flex-wrap">
        <span className="rounded-kb-full bg-bg-tertiary px-2 py-0.5">
          {CAPSULE_MILESTONE_LABELS[capsule.milestone]}
        </span>
        <span>{formatDate(capsule.sealedAt)} 封装</span>
        {isSealed ? (
          <span className={cn('font-medium', due && 'text-amber-600')}>
            <Lock className="w-3 h-3 inline mr-0.5" strokeWidth={1.6} />
            {remainingText(capsule.openAt)}
          </span>
        ) : (
          <span className="text-emerald-600">
            <CheckCircle2 className="w-3 h-3 inline mr-0.5" strokeWidth={1.6} />
            {capsule.openedAt ? `${formatDate(capsule.openedAt)} 开启` : '已开启'}
          </span>
        )}
      </div>

      {/* 内容 */}
      {isSealed ? (
        due ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => onOpen?.(capsule)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-kb-full text-xs font-medium bg-brand-500/10 text-brand-600 border border-brand-300/50 hover:bg-brand-500/15 transition-colors"
            >
              <Gift className="w-3.5 h-3.5" strokeWidth={1.6} />
              开启胶囊
            </button>
          </div>
        ) : (
          <div className="mt-2.5 text-xs text-text-tertiary line-clamp-2 italic">
            「{capsule.content || '一封写给未来的信'}」
          </div>
        )
      ) : (
        <>
          <div className="mt-2.5 text-sm text-text-primary leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
            {capsule.content || '（无内容）'}
          </div>
          {/* 学习快照 */}
          <div className="mt-3 rounded-kb-lg border border-border-subtle bg-bg-secondary/50 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary">封装时掌握度</span>
              <span className="font-medium text-brand-600">{capsule.snapshot.masterySnapshot}/100</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-kb-full bg-bg-tertiary overflow-hidden">
              <div
                className="h-full rounded-kb-full bg-gradient-to-r from-brand-400 to-accent-500 transition-all duration-kb-fast"
                style={{ width: `${Math.min(100, capsule.snapshot.masterySnapshot)}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-text-tertiary">
              <div>
                <div className="text-sm font-medium text-text-primary">{capsule.snapshot.stats.flashcardsReviewed}</div>
                复习卡片
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">{capsule.snapshot.stats.notesCreated}</div>
                笔记
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">{capsule.snapshot.stats.pomodoroFocusMinutes}</div>
                专注分钟
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    </>
  );
}
