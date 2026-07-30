/**
 * RitualStepGoal — 微目标步骤（目标接力 + 快选标签 + 三段式填空）
 * Micro-goal step (goal relay + quick tags + structured fill-in)
 *
 * @ai-context: RIT-09 快选标签首位为"昨日未完成目标"接力项（火花图标
 * 高亮）；RIT-11 三段式填空模式与自由输入模式可切换，合成规则复用
 * ritualHelpers.composeStructuredGoal 纯函数。受控组件：goalText 与
 * 已选标签由容器持有。
 * @ai-context: RIT-09 relay tag first (highlighted); RIT-11 structured
 * fill-in toggles with free input, composition delegated to the pure
 * helper. Controlled component: goalText/tags owned by the container.
 */
import { useState } from 'react';
import { Target, Zap, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuickTag } from '../../types';
import { GOAL_VERBS, composeStructuredGoal, type GoalVerb } from '../../utils/ritualHelpers';
import { useSpeechInput } from '../../hooks/useSpeechInput';

interface Props {
  goalText: string;
  onGoalChange: (text: string) => void;
  quickTags: QuickTag[];
  /** 点击快选标签：文本填入 + 记入 goalTags */
  onPickTag: (tag: QuickTag) => void;
  /** Enter 键推进下一步 */
  onSubmit: () => void;
}

export function RitualStepGoal({ goalText, onGoalChange, quickTags, onPickTag, onSubmit }: Props) {
  const [structured, setStructured] = useState(false);
  const [verb, setVerb] = useState<GoalVerb>(GOAL_VERBS[0]);
  const [object, setObject] = useState('');
  const [scope, setScope] = useState('');

  // 三段式任一段变化即合成并回写目标文本
  const syncStructured = (v: GoalVerb, obj: string, sc: string) => {
    const composed = composeStructuredGoal(v, obj, sc);
    if (composed) onGoalChange(composed);
  };

  // 语音输入（RIT-12）：识别结果直接填入目标文本；不支持时隐藏按钮
  const speech = useSpeechInput({ onResult: onGoalChange });

  return (
    <div className="flex flex-col gap-5 animate-[fade-in-up_0.4s_ease-out]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-focus">
          <Target className="w-5 h-5" strokeWidth={1.5} />
          <span className="text-sm font-semibold">设定微目标</span>
        </div>
        <button
          type="button"
          onClick={() => setStructured((s) => !s)}
          className="text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-200"
        >
          {structured ? '自由输入' : '引导填空'}
        </button>
      </div>

      {structured ? (
        /* ── 三段式填空："我要 [动词] [对象] [范围]" ── */
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary flex-shrink-0">我要</span>
            <select
              value={verb}
              onChange={(e) => { const v = e.target.value as GoalVerb; setVerb(v); syncStructured(v, object, scope); }}
              aria-label="目标动词"
              className="px-2 py-2 rounded-kb-md bg-bg-secondary/40 border border-border/60 text-text-primary text-sm outline-none focus:border-focus/60"
            >
              {GOAL_VERBS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <input
              type="text"
              value={object}
              onChange={(e) => { setObject(e.target.value); syncStructured(verb, e.target.value, scope); }}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              placeholder="学什么"
              aria-label="目标对象"
              autoFocus
              className="flex-1 min-w-0 px-3 py-2 rounded-kb-md bg-bg-secondary/40 border border-border/60 text-text-primary text-sm placeholder:text-text-tertiary/70 outline-none focus:border-focus/60"
            />
            <input
              type="text"
              value={scope}
              onChange={(e) => { setScope(e.target.value); syncStructured(verb, object, e.target.value); }}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
              placeholder="哪部分（可选）"
              aria-label="目标范围"
              className="w-28 px-3 py-2 rounded-kb-md bg-bg-secondary/40 border border-border/60 text-text-primary text-sm placeholder:text-text-tertiary/70 outline-none focus:border-focus/60"
            />
          </div>
          {goalText && <p className="text-xs text-text-tertiary">本次目标：{goalText}</p>}
        </div>
      ) : (
        /* ── 自由输入（含语音按钮 RIT-12） ── */
        <div className="relative">
          <input
            type="text"
            value={goalText}
            onChange={(e) => onGoalChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            placeholder="本次我要完成 ____"
            aria-label="微目标"
            autoFocus
            className={cn(
              'w-full px-4 py-3.5 rounded-kb-lg',
              'bg-bg-secondary/40 border border-border/60',
              'text-text-primary text-sm placeholder:text-text-tertiary/70',
              'outline-none focus:border-focus/60 focus:ring-2 focus:ring-focus/20',
              'transition-all duration-200',
              speech.supported && 'pr-11',
            )}
          />
          {speech.supported && (
            <button
              type="button"
              onClick={() => (speech.listening ? speech.stop() : speech.start())}
              aria-label={speech.listening ? '停止语音输入' : '语音输入目标'}
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-kb-full transition-all duration-200',
                speech.listening
                  ? 'text-focus bg-focus/10 animate-pulse'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50',
              )}
            >
              <Mic className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}

      {/* ── 快选标签（接力项置顶高亮） ── */}
      {quickTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickTags.map((tag) => (
            <button
              key={tag.text}
              type="button"
              onClick={() => onPickTag(tag)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-kb-full text-xs border transition-all duration-200',
                tag.relay
                  ? 'text-amber border-amber/50 bg-amber/10 hover:bg-amber/20'
                  : 'text-text-secondary border-border hover:border-text-tertiary hover:bg-bg-tertiary/40',
              )}
            >
              {tag.relay && <Zap className="w-3 h-3" strokeWidth={2} />}
              {tag.relay ? `继续：${tag.text}` : tag.text}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-text-tertiary">写下一个具体、可衡量的小目标，帮助自己聚焦注意力</p>
    </div>
  );
}
