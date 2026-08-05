/**
 * 自适应挑战阶梯
 * Adaptive difficulty ladder
 *
 * @ai-context: 基于 FSRS-5 间隔信号的五级难度阶梯：讲给小孩 → 讲给同伴 →
 * 讲给教授 → 辩论 → 创新应用。当前档位由 lib/scheduler 的
 * suggestDifficultyTier（interval >14 天 → challenge，>60 天 → master，
 * 失误 ≥5 次或正确 <3 次 → basic）驱动，与复习流写入的 difficultyTier 字段联动。
 *
 * 费曼档位对齐（Feynman tier alignment）：
 * 阶梯的「讲」层级与费曼四维评分对应——explain 层级打磨 expression（表达
 * 通俗度，feynman/types.ts DimensionScore），debate 层级锻炼 logic（逻辑
 * 清晰度）；当某维度低于 WEAK_DIMENSION_THRESHOLD（6 分，
 * feynman/lib/collectWeakDimensions.ts）时，建议先回基础档位夯实，
 * 而不是盲目升阶（稳定性优先，与 suggestDifficultyTier 的回落规则一致）。
 *
 * @ai-context: Five-rung ladder driven by suggestDifficultyTier. The
 * "explain" rungs align with Feynman DimensionScore (expression/logic);
 * dimensions below the weak threshold suggest staying on lower rungs.
 */
import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { GraduationCap, Baby, Users, Award, Swords, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import {
  suggestDifficultyTier,
  type DifficultyTier,
} from '@/lib/scheduler';

/** 阶梯五级定义 / The five ladder rungs */
interface LadderRung {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
}

const LADDER: LadderRung[] = [
  { id: 'child', label: '讲给小孩', description: '用最朴素的语言解释，暴露概念漏洞', icon: <Baby className="w-4 h-4" /> },
  { id: 'peer', label: '讲给同伴', description: '双向问答，检验逻辑自洽', icon: <Users className="w-4 h-4" /> },
  { id: 'professor', label: '讲给教授', description: '严谨推导，接受深度追问', icon: <GraduationCap className="w-4 h-4" /> },
  { id: 'debate', label: '辩论', description: '正反两方交锋，打磨论证结构', icon: <Swords className="w-4 h-4" /> },
  { id: 'innovate', label: '创新应用', description: '迁移到新场景，产出原创解法', icon: <Award className="w-4 h-4" /> },
];

/** 档位 → 阶梯进度（rung 数量） / Tier → rung progress */
const TIER_PROGRESS: Record<DifficultyTier, number> = {
  basic: 2,
  challenge: 4,
  master: 5,
};

const TIER_META: Record<DifficultyTier, { label: string; className: string }> = {
  basic: { label: '基础档', className: 'bg-emerald-500/15 text-emerald-400' },
  challenge: { label: '挑战档', className: 'bg-amber-500/15 text-amber-400' },
  master: { label: '大师档', className: 'bg-violet-500/15 text-violet-400' },
};

export interface DifficultyLadderProps {
  /** 卡片调度状态 / Card scheduling state */
  card: {
    interval: number;
    repetitions: number;
    lapses: number;
    difficultyTier?: DifficultyTier;
  };
  /** 升阶回调（父组件写入更高档位） / Promote callback */
  onPromote?: (tier: DifficultyTier) => void;
  className?: string;
}

export function DifficultyLadder({ card, onPromote, className }: DifficultyLadderProps) {
  // 当前存储档位（惰性迁移，未写入时按建议值兜底） / Persisted tier (fallback to suggestion)
  const current: DifficultyTier = card.difficultyTier ?? suggestDifficultyTier(card);
  // 建议档位（间隔信号实时驱动） / Suggested tier from interval signal
  const suggested: DifficultyTier = suggestDifficultyTier(card);
  const [promoted, setPromoted] = useState(false);

  const currentRungs = TIER_PROGRESS[current];
  const canPromote = suggested !== current && !promoted;

  /** 升阶挑战：把档位写入卡片并通知父组件 / Promote to the suggested tier */
  const handlePromote = () => {
    if (!canPromote) return;
    onPromote?.(suggested);
    setPromoted(true);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col gap-3 rounded-2xl border border-border/40 bg-bg-secondary/60 p-4 backdrop-blur-xl', className)}
    >
      {/* 标题 + 档位徽章 / Header + tier badge */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-b3 font-semibold text-text-primary">
          <Sparkles className="w-4 h-4 text-brand-400" aria-hidden />
          自适应挑战阶梯
        </h3>
        <span className={cn('rounded-full px-2.5 py-0.5 text-c2 font-medium', TIER_META[current].className)}>
          {TIER_META[current].label}
        </span>
      </div>

      {/* 五级阶梯 / Five rungs */}
      <ol className="flex flex-col gap-1.5">
        {LADDER.map((rung, i) => {
          const reached = i < currentRungs;
          const isCurrent = i === currentRungs - 1;
          return (
            <li
              key={rung.id}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors',
                reached
                  ? 'border-brand-400/30 bg-brand-500/8'
                  : 'border-border/20 bg-bg-tertiary/40 opacity-55',
                isCurrent && 'ring-1 ring-brand-400/40',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-c2 font-semibold',
                  reached ? 'bg-brand-500/15 text-brand-400' : 'bg-bg-secondary text-text-tertiary',
                )}
                aria-hidden
              >
                {i + 1}
              </span>
              <span className={cn('flex-shrink-0', reached ? 'text-brand-300' : 'text-text-tertiary')} aria-hidden>
                {rung.icon}
              </span>
              <div className="min-w-0">
                <p className={cn('text-c1 font-medium', reached ? 'text-text-primary' : 'text-text-tertiary')}>
                  {rung.label}
                  {isCurrent && <span className="ml-1.5 text-c2 text-brand-400">← 当前</span>}
                </p>
                <p className="truncate text-c2 text-text-tertiary">{rung.description}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {/* 升阶挑战 / Promote action */}
      <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
        <p className="text-c2 text-text-tertiary">
          {canPromote
            ? `间隔信号建议升阶至「${TIER_META[suggested].label}」`
            : promoted
              ? '升阶挑战已发出，等下次复习验收'
              : '当前档位稳定，继续保持'}
        </p>
        <Button size="sm" variant="ai" onClick={handlePromote} disabled={!canPromote}>
          {canPromote ? `升阶挑战 → ${TIER_META[suggested].label}` : promoted ? '已升阶 ✓' : '升阶挑战'}
        </Button>
      </div>

      {/* 费曼档位对齐提示 / Feynman tier alignment note */}
      <p className="rounded-xl bg-bg-tertiary/50 px-3 py-2 text-c2 leading-relaxed text-text-tertiary">
        <span className="font-medium text-text-secondary">费曼对齐：</span>
        「讲给小孩」打磨表达通俗度（expression）、「辩论」锤炼逻辑清晰度（logic）——
        对应费曼四维评分（DimensionScore，0-10）；若某维低于 6 分
        （WEAK_DIMENSION_THRESHOLD），建议先回到低档夯实再升阶。
      </p>
    </motion.section>
  );
}

export default DifficultyLadder;
