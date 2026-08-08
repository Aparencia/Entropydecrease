/**
 * ClosingCeremony — R3 结束仪式分支（总结 + 复习卡闭环）
 * Closing ceremony branch (summary + review-card closure)
 *
 * @ai-context: 开场仪式（StartupRitual）走完回顾/目标/意图/呼吸后，先经
 * RitualComplete 定格，再追加本结束仪式分支：总结今日目标/掌握/用时/连续
 * 天数，并依据掌握标记展示复习卡闭环状态（模糊/未掌握 → 已安排 1 张复习
 * 卡；已掌握 → 无需安排）。展示型组件，无副作用；落库与建卡由页面层在
 * onClose 后经 ritualService 执行（RIT-06 闭环）。
 * @ai-context: Pure presentational closing branch appended after the
 * startup ritual; persistence stays in ritualService via the page layer.
 */
import { motion } from 'framer-motion';
import { Sparkles, Target, Timer, Flame, Layers, HelpCircle } from 'lucide-react';
import type { MicroGoal } from '../../types';
import type { MasteryMark } from '@/types/ritual';
import { shouldScheduleReviewCard } from '../../utils/ritualHelpers';

interface Props {
  goal?: MicroGoal;
  masteryMark?: MasteryMark;
  /** 含今天在内的连续火种天数 */
  streakDays: number;
  /** 仪式全程用时（毫秒） */
  durationMs: number;
  /** 结束仪式 → 触发完成（页面层落库 + 复习卡闭环） */
  onClose: () => void;
  /** D2 蔡格尼克悬念：AI 回顾小问的问题文本 */
  suspenseQuestion?: string;
}

const MASTERY_LABEL: Record<MasteryMark, string> = {
  mastered: '已掌握',
  fuzzy: '模糊',
  unmastered: '未掌握',
};

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

export function ClosingCeremony({ goal, masteryMark, streakDays, durationMs, onClose, suspenseQuestion }: Props) {
  const reviewCardPlanned = shouldScheduleReviewCard(masteryMark);

  return (
    <motion.div
      className="flex flex-col items-center gap-5 text-center animate-[fade-in-up_0.4s_ease-out]"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex items-center gap-2 text-accent-400">
        <Sparkles className="w-5 h-5" strokeWidth={1.5} />
        <span className="text-b1 font-semibold">今日仪式完成</span>
      </div>

      <h2 className="text-xl font-semibold text-text-primary">告别这一小段，去开始学习吧</h2>

      {/* 仪式总结卡 */}
      <div className="w-full rounded-kb-lg border border-border/50 bg-bg-secondary/30 p-4 flex flex-col gap-2.5 text-left">
        {goal ? (
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 text-focus flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <span className="text-sm text-text-primary">今日目标：{goal.text}</span>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 text-text-tertiary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <span className="text-sm text-text-tertiary">今日没有设定目标，随心而学</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
          <span className="text-sm text-text-secondary">
            上次掌握度：{masteryMark ? MASTERY_LABEL[masteryMark] : '未标记'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
          <span className="text-sm text-text-secondary">仪式用时：{formatDuration(durationMs)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-amber flex-shrink-0" strokeWidth={1.5} />
          <span className="text-sm text-text-secondary">连续 {streakDays} 天</span>
        </div>
      </div>

      {/* 复习卡闭环状态（R3：与 ritualService 建卡判定一致） */}
      <div
        className={`w-full rounded-kb-lg border px-4 py-2.5 text-sm ${
          reviewCardPlanned
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600'
            : 'border-border/40 bg-bg-tertiary/20 text-text-tertiary'
        }`}
      >
        {reviewCardPlanned
          ? '已为你安排 1 张复习卡，今天记得回顾 ✦'
          : masteryMark
            ? '已掌握的内容无需额外复习卡'
            : '标记掌握度后可为模糊内容安排复习卡'}
      </div>

      {/* D2 蔡格尼克悬念引擎：AI 回顾小问，制造未完成感 */}
      {suspenseQuestion && (
        <motion.div
          className="w-full rounded-kb-lg border border-brand-500/20 bg-brand-500/5 px-4 py-3"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-brand-400 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-400/70 font-medium tracking-wider uppercase">未解悬念</span>
              <p className="text-sm text-text-primary leading-relaxed">{suspenseQuestion}</p>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                下次学习时回想一下这个问题，看看有没有新的理解
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="flex items-center gap-1.5 px-5 py-2.5 rounded-kb-full bg-focus text-white text-sm font-medium hover:bg-focus/90 active:scale-95 transition-all duration-200 shadow-[0_0_12px_rgba(74,155,217,0.35)]"
      >
        <Sparkles className="w-4 h-4" strokeWidth={2} />
        开始学习
      </button>
    </motion.div>
  );
}
