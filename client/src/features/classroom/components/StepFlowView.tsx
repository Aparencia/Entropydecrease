/**
 * StepFlowView — 步骤化笔记视图（P2-7/P2-8）
 *
 * @ai-context: 技能场景（软件/手法技巧）的步骤卡片流：每步 = 截图 + 操作
 * 说明 + 时间戳；支持「练习模式」（隐藏说明看截图回忆操作，翻卡对照，
 * 费曼式主动回忆）、「跟着做」checklist 勾选、步骤→闪卡问答导出。
 * 数据源为 smart 会话数据经 extractSteps 提取（内存态，会话内可用）。
 * @ai-context EN: Step-card flow for skill videos: screenshot + instruction
 * + timestamp per step. Practice mode hides instructions for active recall;
 * checklist tracks progress; cards export as Q&A flashcards.
 */
import { useMemo, useState } from 'react';
import { Eye, EyeOff, CheckSquare, Copy, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  extractSteps,
  stepsToChecklist,
  stepsToFlashcards,
} from '@/lib/capture/stepExtractor';
import type { SessionBundle } from '@/lib/capture';

interface StepFlowViewProps {
  bundle: Partial<SessionBundle>;
  /** 是否显示操作说明（练习模式=false 隐藏，点击单卡对照） */
  initiallyPractice?: boolean;
}

export function StepFlowView({ bundle, initiallyPractice = false }: StepFlowViewProps) {
  const [practice, setPractice] = useState(initiallyPractice);
  /** 练习模式下被翻开的卡片 id 集合（对照查看） */
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const { steps, boundaryCount, commandCueCount } = useMemo(
    () => extractSteps(bundle.keyframes ?? [], bundle.audioSegments ?? []),
    [bundle.keyframes, bundle.audioSegments],
  );
  const checklist = useMemo(() => stepsToChecklist(steps), [steps]);

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** 导出步骤闪卡问答（复制到剪贴板，供闪卡模块导入） */
  const exportFlashcards = async () => {
    const cards = stepsToFlashcards(steps);
    const text = cards.map((c) => `${c.front}\n答：${c.back}`).join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (steps.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-10 text-text-tertiary">
        <Layers className="w-8 h-8 mb-2 opacity-30" strokeWidth={1} />
        <p className="text-b3">技能类内容（界面切换 + 操作指令）将自动生成步骤卡片</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* 工具栏：练习模式 / 统计 / 闪卡导出 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/20 flex-shrink-0">
        <button
          onClick={() => setPractice((p) => !p)}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-kb-sm text-[11px] font-medium transition-all',
            practice
              ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/50'
              : 'text-text-tertiary hover:bg-bg-tertiary',
          )}
        >
          {practice ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {practice ? '练习模式（点击卡片对照）' : '查看模式'}
        </button>
        <span className="text-[10px] text-text-tertiary">
          {steps.length} 步 · {boundaryCount} 次界面切换 · {commandCueCount} 条操作指令
        </span>
        <button
          onClick={exportFlashcards}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded-kb-sm text-[11px] text-text-tertiary hover:text-cyber hover:bg-cyber/5 transition-all"
        >
          <Copy className="w-3 h-3" />
          {copied ? '已复制闪卡问答' : '导出步骤闪卡'}
        </button>
      </div>

      {/* 步骤卡片流 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {steps.map((step, idx) => {
          const isRevealed = !practice || revealed.has(step.id);
          return (
            <div
              key={step.id}
              className={cn(
                'rounded-kb-md border border-border/20 bg-bg-elevated/40 p-3',
                practice && 'cursor-pointer transition-colors hover:bg-bg-elevated',
              )}
              onClick={practice ? () => toggleReveal(step.id) : undefined}
            >
              <div className="flex items-start gap-3">
                {/* 步骤截图 */}
                {step.imageBase64 && (
                  <img
                    src={`data:image/jpeg;base64,${step.imageBase64}`}
                    alt={`步骤 ${idx + 1} 截图`}
                    className="w-36 rounded-kb-sm object-cover border border-border/30 flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-tertiary font-mono">
                      {new Date(step.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-b3 font-medium text-text-primary">{step.title}</span>
                  </div>
                  <p className={cn(
                    'mt-1 text-[12px] leading-relaxed text-text-secondary',
                    practice && !isRevealed && 'opacity-0 select-none',
                    practice && !isRevealed && 'h-4', // 占位防跳动
                  )}>
                    {isRevealed ? (step.instruction || '（本步无口述说明，观察截图）') : '••• 回忆一下这一步做了什么 •••'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 跟着做 checklist */}
      <div className="border-t border-border/20 px-3 py-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 mb-1.5">
          <CheckSquare className="w-3.5 h-3.5 text-emerald-500" strokeWidth={1.5} />
          <span className="text-[11px] font-medium text-text-tertiary">
            跟着做（{checked.size}/{checklist.length}）
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
          {checklist.map((item) => (
            <button
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={cn(
                'px-2 py-0.5 rounded-kb-sm text-[11px] border transition-all',
                checked.has(item.id)
                  ? 'border-emerald-300/50 bg-emerald-50 text-emerald-600 line-through'
                  : 'border-border/30 text-text-secondary hover:border-emerald-300/50',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default StepFlowView;
