/**
 * RitualStepIntention — 实施意图步骤（A4，可选 if…then… 执行计划）
 * Implementation intention step (optional if-then plan, skippable)
 *
 * @ai-context: 目标设定后的可选一步——"如果 [情境]，我就 [行动]"把意图
 * 绑定到具体触发情境（心理学实施意图范式）。整步可跳过（可逆 > 不可逆），
 * 提醒时间可选；保存与提醒由 intentionRepository + useIntentionCoach 闭环。
 * 受控组件：ifPart/thenPart/triggerAt 由容器持有。
 * @ai-context: Optional skippable step binding an action to a concrete cue.
 * Controlled component; persistence is handled by the container.
 */
import { Waypoints } from 'lucide-react';

interface Props {
  ifPart: string;
  thenPart: string;
  onIfChange: (v: string) => void;
  onThenChange: (v: string) => void;
  /** 提醒时间（HH:mm 本地时间字符串，空=不设） */
  triggerTime: string;
  onTriggerTimeChange: (v: string) => void;
  /** Enter 键或主按钮推进（容器负责落库） */
  onSubmit: () => void;
  /** 跳过本步（不保存） */
  onSkipStep: () => void;
}

export function RitualStepIntention({
  ifPart, thenPart, onIfChange, onThenChange,
  triggerTime, onTriggerTimeChange, onSubmit, onSkipStep,
}: Props) {
  return (
    <div className="flex flex-col gap-5 animate-[fade-in-up_0.4s_ease-out]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-focus">
          <Waypoints className="w-5 h-5" strokeWidth={1.5} />
          <span className="text-sm font-semibold">给意图一个触发器（可选）</span>
        </div>
        <button
          type="button"
          onClick={onSkipStep}
          className="text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-200"
        >
          跳过这一步
        </button>
      </div>

      {/* if…then… 填空：情境 + 行动两要素 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary flex-shrink-0">如果</span>
          <input
            type="text"
            value={ifPart}
            onChange={(e) => onIfChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder="遇到什么情境（如：学累到想刷手机）"
            aria-label="实施意图情境"
            autoFocus
            className="flex-1 min-w-0 px-3 py-2 rounded-kb-md bg-bg-secondary/40 border border-border/60 text-text-primary text-sm placeholder:text-text-tertiary/70 outline-none focus:border-focus/60"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary flex-shrink-0">我就</span>
          <input
            type="text"
            value={thenPart}
            onChange={(e) => onThenChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder="做什么行动（如：先深呼吸 1 分钟再继续）"
            aria-label="实施意图行动"
            className="flex-1 min-w-0 px-3 py-2 rounded-kb-md bg-bg-secondary/40 border border-border/60 text-text-primary text-sm placeholder:text-text-tertiary/70 outline-none focus:border-focus/60"
          />
        </div>
        {/* 可选提醒时间：留空则不设定时提醒（到期判断见 isIntentionDue） */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-tertiary flex-shrink-0">提醒时间</span>
          <input
            type="time"
            value={triggerTime}
            onChange={(e) => onTriggerTimeChange(e.target.value)}
            aria-label="实施意图提醒时间（可选）"
            className="px-2 py-1.5 rounded-kb-md bg-bg-secondary/40 border border-border/60 text-text-primary text-xs outline-none focus:border-focus/60"
          />
          <span className="text-xs text-text-tertiary">留空则不定时提醒</span>
        </div>
      </div>

      <p className="text-xs text-text-tertiary">
        把行动绑定到具体情境，执行率会显著提高——到时我会轻轻提醒你
      </p>
    </div>
  );
}
