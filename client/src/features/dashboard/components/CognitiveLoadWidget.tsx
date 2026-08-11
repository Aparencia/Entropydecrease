/**
 * 认知负荷小部件（1.13 A5 UI）
 * Cognitive load widget
 *
 * @ai-context: 展示当前认知负荷水平的轻量小部件——三段式（低/中/高）
 * 仪表条 + 分级建议文案。数据源：useBehaviorSignals 经 cognitiveLoadStore
 * 发布的 EMA 平滑值（0-100，见 assistant/lib/cognitiveLoad）；阈值与
 * cognitiveLoad.ts 模型一致（LOAD_RECOVER_THRESHOLD=50 / LOAD_HIGH_THRESHOLD=70）。
 * 纯展示组件：传 load（0-1）时完全受控，便于测试与复用。
 */
import { useCurrentLoad } from '@/features/assistant/lib/cognitiveLoadStore';
import { cn } from '@/lib/utils';

interface Props {
  /** 当前负荷 0-1（缺省时从 cognitiveLoadStore 订阅实时值） */
  load?: number;
  /** 是否显示骨架占位 */
  loading?: boolean;
}

/** 负荷等级（阈值与 cognitiveLoad.ts 模型一致，0-1 归一化） */
type LoadLevel = 'low' | 'medium' | 'high';

const LEVEL_META: Record<LoadLevel, { label: string; bar: string; text: string; suggestion: string }> = {
  low: {
    label: '低负荷',
    bar: 'bg-emerald-400',
    text: 'text-emerald-400',
    suggestion: '大脑很轻松，适合攻克需要深度思考的新概念。',
  },
  medium: {
    label: '中负荷',
    bar: 'bg-amber-400',
    text: 'text-amber-400',
    suggestion: '节奏不错，先完成手头任务，再继续新内容会更稳。',
  },
  high: {
    label: '高负荷',
    bar: 'bg-red-400',
    text: 'text-red-400',
    suggestion: '大脑正在高速运转——先暂停切换，专注一件最重要的事。',
  },
};

function levelOf(load01: number): LoadLevel {
  if (load01 >= 0.7) return 'high';
  if (load01 >= 0.5) return 'medium';
  return 'low';
}

export default function CognitiveLoadWidget({ load, loading }: Props) {
  const storeLoad = useCurrentLoad();
  // 受控优先：props.load（0-1）→ 共享存储（0-100）→ 默认 0
  const load01 = load !== undefined ? load : storeLoad / 100;
  const meta = LEVEL_META[levelOf(load01)];
  const percent = Math.round(load01 * 100);

  if (loading) {
    return (
      <div className="rounded-kb-xl border border-border/15 bg-bg-elevated/30 p-5 animate-pulse-skeleton">
        <div className="h-4 w-24 bg-bg-tertiary rounded-kb-sm mb-4" />
        <div className="h-2.5 w-full bg-bg-tertiary rounded-full mb-2" />
        <div className="h-3 w-2/3 bg-bg-tertiary rounded-kb-sm" />
      </div>
    );
  }

  return (
    <div className="rounded-kb-xl border border-border/15 bg-bg-elevated/30 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-b3 font-semibold text-text-primary">认知负荷</h3>
        <span className={cn('text-c1 font-medium tabular-nums', meta.text)}>
          {meta.label} · {percent}%
        </span>
      </div>

      {/* 三段式仪表条：0-50-70-100 分段着色，与模型阈值一致 */}
      <div className="relative h-2.5 rounded-full bg-bg-tertiary/50 overflow-hidden mb-3" role="meter" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="当前认知负荷">
        <div
          className={cn('h-full rounded-full transition-all duration-500', meta.bar)}
          style={{ width: `${Math.max(4, percent)}%` }}
        />
        {/* 阈值刻度：50（恢复）/70（高） */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-bg-elevated/80" />
        <div className="absolute top-0 bottom-0 left-[70%] w-px bg-bg-elevated/80" />
      </div>

      <p className="text-c1 text-text-secondary leading-relaxed">{meta.suggestion}</p>
    </div>
  );
}
