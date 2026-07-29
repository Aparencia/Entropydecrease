/**
 * 费曼学习会话页面框架组件（环境光/顶栏/加载态/空态）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出的页面"外壳"组件。环境光为
 * 暖色+冷色互补双光晕（prefersReduced 时静止）；顶栏含返回/卡壳救援/
 * AI 评估入口；加载/空态为独立早返回分支。均为纯展示，回调注入。
 */
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, HelpCircle, CheckCircle2 } from 'lucide-react';
import { Button, Skeleton, EmptyState } from '@/components/ui';
import { AIButton } from '@/components/ui/AIButton';
import { cn } from '@/lib/utils';

// ── 环境光 ──

export function AmbientLight() {
  const prefersReduced = useReducedMotion();
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* 环境光 - 暖色 */}
      <motion.div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #F59E0B 0%, transparent 70%)' }}
        animate={prefersReduced ? {} : { scale: [1, 1.15, 1], opacity: [0.15, 0.25, 0.15] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* 环境光 - 冷色互补 */}
      {!prefersReduced && (
        <motion.div
          className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #5B8A72 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.08, 0.15, 0.08] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
      )}
    </div>
  );
}

// ── 顶栏 ──

interface FeynmanTopBarProps {
  concept?: string;
  hasExplanation: boolean;
  isCompleted: boolean;
  aiEvalLoading: boolean;
  onBack: () => void;
  onRescue: () => void;
  onAIEval: () => void;
}

export function FeynmanTopBar({
  concept, hasExplanation, isCompleted, aiEvalLoading, onBack, onRescue, onAIEval,
}: FeynmanTopBarProps) {
  return (
    <motion.div
      className="flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50 flex-shrink-0 relative z-10"
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, delay: 0.05 }}
    >
      <button
        onClick={onBack}
        className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
      >
        <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
      </button>
      <h1 className="text-b1 font-semibold text-text-primary flex-1 truncate">
        {concept || '浮出水面'}
      </h1>
      {hasExplanation && (
        <button
          onClick={onRescue}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b2 font-medium',
            'bg-bg-secondary text-text-secondary border border-border/50',
            'hover:bg-bg-tertiary hover:text-text-primary',
            'active:scale-95 transition-all duration-kb-fast',
          )}
          title="卡壳了 (Ctrl+Shift+H)"
        >
          <HelpCircle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          卡壳了
        </button>
      )}
      {hasExplanation && (
        <AIButton
          size="sm"
          loading={aiEvalLoading}
          disabled={aiEvalLoading}
          tooltip="请先完成讲解内容"
          onClick={onAIEval}
          title={aiEvalLoading ? 'AI 评估中…' : 'AI 评估讲解质量'}
        >
          AI 评估
        </AIButton>
      )}
      {isCompleted && (
        <span className="text-c1 font-medium text-semantic-success flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
          已完成
        </span>
      )}
    </motion.div>
  );
}

// ── 加载骨架屏 ──

export function FeynmanLoadingSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50">
        <Skeleton variant="circular" width={32} height={32} />
        <Skeleton variant="text" width={200} />
      </div>
      <div className="px-kb-md py-kb-md">
        <Skeleton variant="rectangular" height={60} />
      </div>
      <div className="flex-1 px-kb-md">
        <Skeleton variant="text" lines={6} />
      </div>
    </div>
  );
}

// ── 会话未找到空态 ──

export function FeynmanNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col h-full items-center justify-center">
      <EmptyState
        title="会话未找到"
        description="该学习会话可能已被删除"
        action={
          <Button size="sm" onClick={onBack}>
            返回列表
          </Button>
        }
      />
    </div>
  );
}

// ── 底部步骤导航 ──

interface FeynmanBottomNavProps {
  currentStep: number;
  isCompleted: boolean;
  onPrev: () => void;
  onNext: () => void;
  onComplete: () => void;
  onBack: () => void;
}

export function FeynmanBottomNav({
  currentStep, isCompleted, onPrev, onNext, onComplete, onBack,
}: FeynmanBottomNavProps) {
  return (
    <motion.div
      className={cn(
        'flex items-center justify-between gap-kb-sm px-kb-md py-3',
        'border-t border-border/50 bg-bg-elevated/90 backdrop-blur-sm flex-shrink-0 relative z-10',
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <Button
        variant="secondary"
        size="sm"
        icon={<ArrowLeft className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
        onClick={onPrev}
        disabled={currentStep === 1}
      >
        上一步
      </Button>

      {currentStep < 4 ? (
        <Button
          size="sm"
          icon={<ArrowRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          iconRight={<span />}
          onClick={onNext}
        >
          下一步
        </Button>
      ) : !isCompleted ? (
        <Button
          size="sm"
          icon={<Check className="w-icon-sm h-icon-sm" strokeWidth={2} />}
          onClick={onComplete}
        >
          完成学习
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={onBack}
        >
          返回列表
        </Button>
      )}
    </motion.div>
  );
}
