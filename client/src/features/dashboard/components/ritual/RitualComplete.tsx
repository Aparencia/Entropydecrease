/**
 * RitualComplete — 仪式收尾定格（今日学习卡 + 火种 + 光尘转场）
 * Ritual completion card (today card + streak flame + light-dust transition)
 *
 * @ai-context: RIT-21 今日卡定格 + RIT-19 火种 + RIT-18 光尘转场（决策 7）。
 * 完成后展示微目标/掌握标记/火种天数；点击"进入学习"或 4s 后自动触发
 * onEnter；退出时卡片以粒子化淡出（framer-motion），reduced-motion 降级为
 * 普通淡出。相机飞行：dashboard 本就是当前 3D 浮层，收尾停留原地，不接管
 * 相机（避免侵入 3D 系统，见 v0.26.0 决策 7 范围说明）。
 * @ai-context: Shows the summary card then light-dust fade-out on exit;
 * reduced motion degrades to a plain fade. No camera takeover.
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, Target, Sparkles } from 'lucide-react';
import type { MicroGoal } from '../../types';
import type { MasteryMark } from '@/types/ritual';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { WorldConditions } from './WorldConditions';

interface Props {
  goal?: MicroGoal;
  masteryMark?: MasteryMark;
  /** 含今天在内的连续火种天数 */
  streakDays: number;
  /** 进入学习（自动 4s 或点击触发） */
  onEnter: () => void;
}

const MASTERY_LABEL: Record<MasteryMark, string> = {
  mastered: '已掌握',
  fuzzy: '模糊',
  unmastered: '未掌握',
};

/** 光尘粒子数（reduced-motion 时不渲染） */
const DUST_COUNT = 24;

export function RitualComplete({ goal, masteryMark, streakDays, onEnter }: Props) {
  const reducedMotion = useReducedMotion();

  // 4s 后自动进入学习（用户也可点击立即进入）
  useEffect(() => {
    const timer = setTimeout(onEnter, 4000);
    return () => clearTimeout(timer);
  }, [onEnter]);

  return (
    <motion.div
      className="flex flex-col items-center gap-5 text-center animate-[fade-in-up_0.4s_ease-out]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* 火种 */}
      <div className="flex items-center gap-2 text-amber">
        <Flame className="w-6 h-6" strokeWidth={1.5} />
        <span className="text-lg font-semibold tabular-nums">连续 {streakDays} 天</span>
      </div>

      <h2 className="text-xl font-semibold text-text-primary">准备好了，开始学习吧</h2>

      {/* 今日卡 */}
      <div className="w-full rounded-kb-lg border border-border/50 bg-bg-secondary/30 p-5 flex flex-col gap-3">
        {goal ? (
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 text-focus flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <span className="text-sm text-text-primary text-left">{goal.text}</span>
          </div>
        ) : (
          <p className="text-sm text-text-tertiary">今天没有设定目标，随心而学 ✨</p>
        )}
        {masteryMark && (
          <p className="text-xs text-text-tertiary text-left">
            上次内容掌握度：{MASTERY_LABEL[masteryMark]}
          </p>
        )}
        {/* 宪法第六条：仪式成为世界的每日开场——今日海况一句话叙事 */}
        <WorldConditions />
      </div>

      <button
        type="button"
        onClick={onEnter}
        className="flex items-center gap-1.5 px-5 py-2.5 rounded-kb-full bg-focus text-white text-sm font-medium hover:bg-focus/90 active:scale-95 transition-all duration-200 shadow-[0_0_12px_rgba(74,155,217,0.35)]"
      >
        <Sparkles className="w-4 h-4" strokeWidth={2} />
        进入学习
      </button>

      {/* 光尘转场（RIT-18）：微光点缓慢上浮淡出；reduced-motion 不渲染 */}
      {!reducedMotion && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: DUST_COUNT }, (_, i) => (
            <motion.span
              key={i}
              className="absolute w-1 h-1 rounded-full bg-focus/60"
              style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%` }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 0.8, 0], y: -30 - (i % 5) * 8 }}
              transition={{ duration: 2 + (i % 4) * 0.5, repeat: Infinity, delay: (i % 6) * 0.3, ease: 'easeOut' }}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
