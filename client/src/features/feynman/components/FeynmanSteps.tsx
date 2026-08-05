/**
 * 费曼学习会话步骤组件（步骤 1/2/3）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出。三个步骤均为受控展示组件：
 * StepConcept 选概念+初始讲解、StepExplain 讲解编辑（失焦保存）、
 * StepWeakPoints 讲解文本展示+选中标记薄弱点。步骤 4（总结+AI 面板）
 * 因与 AI 评估/反问面板耦合仍留在父页面。stagger 动画经 useFeynmanStagger。
 */
import type { RefObject, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Highlighter, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useFeynmanStagger } from './feynmanAnimations';
import { FeynmanRecorder } from './FeynmanRecorder';

// ── 步骤 1: 选择概念 ──

interface StepConceptProps {
  concept?: string;
  explanation: string;
  onExplanationChange: (v: string) => void;
  /** E2: 费曼笔记 id，供录音持久化关联（跨会话回放） */
  noteId?: string | null;
}

export function StepConcept({ concept, explanation, onExplanationChange, noteId }: StepConceptProps) {
  const { container, item } = useFeynmanStagger();
  return (
    <motion.div
      className="flex flex-col gap-kb-md py-kb-md"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <h2 className="text-h2 font-semibold text-text-primary">选择要学习的概念</h2>
        <p className="text-b2 text-text-tertiary mt-1">
          输入一个你想要深入理解的概念名称，这将成为本次浮出水面学习的主题。
        </p>
      </motion.div>
      <motion.div variants={item}>
        <label className="text-b2 font-medium text-text-primary mb-kb-xs block">概念名称</label>
        <div className={cn(
          'px-3 py-2.5 rounded-kb-md',
          'bg-bg-secondary border border-border/70',
          'text-b1 text-text-primary',
        )}>
          {concept || '—'}
        </div>
      </motion.div>
      <motion.div variants={item}>
        <label className="text-b2 font-medium text-text-primary mb-kb-xs block">初始讲解</label>
        <div className={cn(
          'relative min-h-[200px] flex flex-col',
          'border border-border/50 rounded-kb-lg overflow-hidden',
          'bg-bg-elevated',
        )}>
          <textarea
            value={explanation}
            onChange={(e) => onExplanationChange(e.target.value)}
            placeholder="在这里写下你对这个概念的初步理解..."
            className={cn(
              'flex-1 p-kb-md bg-transparent outline-none resize-none',
              'text-b1 text-text-primary placeholder:text-text-tertiary/60',
              'min-h-[180px]',
            )}
          />
        </div>
        {/* E2 口头讲解入口（ASR 不可用时自动隐藏；noteId 关联录音持久化，concept 供录音后 AI 自评） */}
        <FeynmanRecorder explanation={explanation} onExplanationChange={onExplanationChange} noteId={noteId} concept={concept} />
      </motion.div>
      <motion.div variants={item} className={cn(
        'p-kb-md rounded-kb-lg',
        'bg-feynman/5 border border-feynman/20',
        'text-b2 text-text-secondary leading-relaxed',
      )}>
        <p className="font-medium text-feynman mb-1">浮出水面小贴士</p>
        <p className="text-text-tertiary">
          选择一个你正在学习但尚未完全掌握的概念。用简单的语言向"一个完全不懂的人"解释它，
          是检验真正理解的最佳方式。
        </p>
      </motion.div>
    </motion.div>
  );
}

// ── 步骤 2: 讲解概念 ──

interface StepExplainProps {
  concept?: string;
  explanation: string;
  onExplanationChange: (v: string) => void;
  onBlur: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function StepExplain({ concept, explanation, onExplanationChange, onBlur, onContextMenu }: StepExplainProps) {
  const { container, item } = useFeynmanStagger();
  return (
    <motion.div
      className="flex flex-col gap-kb-md py-kb-md"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item}>
        <h2 className="text-h2 font-semibold text-text-primary">讲解「{concept || '...'}」</h2>
        <p className="text-b2 text-text-tertiary mt-1">
          用最简洁的语言，像教给一个完全不懂的人那样，解释这个概念的核心内容。
        </p>
      </motion.div>
      <motion.div variants={item} className={cn(
        'relative min-h-[300px] flex flex-col',
        'border border-border/50 rounded-kb-lg overflow-hidden',
        'bg-bg-elevated',
      )}>
        <textarea
          value={explanation}
          onChange={(e) => onExplanationChange(e.target.value)}
          onBlur={onBlur}
          onContextMenu={onContextMenu}
          placeholder="在这里写下你的讲解... 尽量用通俗易懂的语言，避免直接引用教科书定义。"
          className={cn(
            'flex-1 p-kb-md bg-transparent outline-none resize-none',
            'text-b1 text-text-primary placeholder:text-text-tertiary/60',
            'min-h-[280px]',
          )}
        />
        <div className={cn(
          'px-kb-md py-2 border-t border-border/40',
          'flex items-center justify-between text-c1 text-text-tertiary',
        )}>
          <span>失焦自动保存</span>
          <span>{explanation.length} 字</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── 步骤 3: 标注薄弱 ──

interface SelectionPopup {
  text: string;
  start: number;
  end: number;
}

interface StepWeakPointsProps {
  weakPointsCount: number;
  weakPanelOpen: boolean;
  onToggleWeakPanel: () => void;
  explanationRef: RefObject<HTMLDivElement>;
  onTextSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  renderExplanation: () => ReactNode;
  selectionPopup: SelectionPopup | null;
  onAddWeakPoint: () => void;
  onClearSelection: () => void;
}

export function StepWeakPoints({
  weakPointsCount, weakPanelOpen, onToggleWeakPanel,
  explanationRef, onTextSelect, onContextMenu, renderExplanation,
  selectionPopup, onAddWeakPoint, onClearSelection,
}: StepWeakPointsProps) {
  const { container, item } = useFeynmanStagger();
  return (
    <motion.div
      className="flex flex-col gap-kb-md py-kb-md"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h2 className="text-h2 font-semibold text-text-primary">标注薄弱环节</h2>
          <p className="text-b2 text-text-tertiary mt-1">
            回顾你的讲解，选中说不清楚的文本来标记为薄弱点。
          </p>
        </div>
        <button
          onClick={onToggleWeakPanel}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2',
            'border transition-all duration-kb-fast',
            weakPanelOpen
              ? 'border-[#F59E0B]/40 bg-[#F59E0B]/5 text-[#F59E0B]'
              : 'border-border/50 text-text-secondary hover:bg-bg-tertiary',
          )}
        >
          <Highlighter className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          薄弱点 ({weakPointsCount})
        </button>
      </motion.div>

      {/* 讲解文本展示（可选中） */}
      <motion.div variants={item}
        ref={explanationRef}
        onMouseUp={onTextSelect}
        onKeyUp={onTextSelect}
        onContextMenu={onContextMenu}
        className={cn(
          'min-h-[200px] p-kb-md select-text',
          'border border-border/50 rounded-kb-lg',
          'bg-bg-elevated',
          'text-b2 text-text-secondary leading-relaxed',
          'whitespace-pre-wrap',
        )}
      >
        {renderExplanation()}
      </motion.div>

      {/* 选中文本弹窗 */}
      {selectionPopup && (
        <div className={cn(
          'flex items-center gap-2 p-kb-sm rounded-kb-md',
          'bg-[#F59E0B]/10 border border-[#F59E0B]/30',
        )}>
          <span className="text-b2 text-text-secondary flex-1 truncate">
            选中: "{selectionPopup.text.slice(0, 40)}{selectionPopup.text.length > 40 ? '...' : ''}"
          </span>
          <Button size="sm" onClick={onAddWeakPoint}>
            <Highlighter className="w-icon-sm h-icon-sm mr-1" strokeWidth={1.5} />
            标记为薄弱点
          </Button>
          <button
            onClick={onClearSelection}
            className="p-1 text-text-tertiary hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
