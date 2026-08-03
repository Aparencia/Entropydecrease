/**
 * 深潜完成庆祝覆盖层
 * Deep dive completion celebration overlay
 *
 * @ai-context: 工作阶段结束时展示的全屏正反馈：深海粒子动画 + 本次摘要 +
 * 养成进度 + 水母守夜人文案。尊重自主权：无倒计时自动消失，用户主动关闭。
 * @ai-context: Full-screen positive feedback shown when work phase ends:
 * deep-sea particle animation + session summary + growth progress +
 * jellyfish guardian quote. No auto-dismiss; user closes explicitly.
 */
import { useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Waves, Anchor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { DEEP_SEA_EASE } from '@/lib/animation/presets';

// ─── 水母守夜人文案池 / Jellyfish guardian quote pool ──────────────
const GUARDIAN_QUOTES = [
  '又深了一段，你的珊瑚在生长',
  '深海的宁静，属于坚持下潜的你',
  '每一段专注，都是向更深处的一次呼吸',
  '水母为你守夜，你只管向下探索',
  '又一片海域被你点亮了',
  '深处的光，只给愿意下潜的人',
  '你的专注，让深海不再寂静',
];

/** 根据日期选择文案（7 天不重复） / Pick quote by day (no repeat in 7 days) */
function pickQuote(): string {
  const dayIndex = Math.floor(Date.now() / 86_400_000) % GUARDIAN_QUOTES.length;
  return GUARDIAN_QUOTES[dayIndex];
}

export interface CompletionCelebrationProps {
  /** 是否显示 / Whether visible */
  visible: boolean;
  /** 本次专注时长（秒） / Session duration (seconds) */
  durationSeconds: number;
  /** 本次目标文字 / Session goal text */
  goal: string | null;
  /** 预设名称 / Preset name */
  presetName: string | null;
  /** 累计深度（米） / Cumulative depth (meters) */
  totalDepth: number;
  /** 本次新增深度（米） / Depth gained this session (meters) */
  depthGained: number;
  /** 关闭回调 / Close callback */
  onClose: () => void;
  /** "继续深潜"回调 / "Continue diving" callback */
  onContinue: () => void;
}

export function CompletionCelebration({
  visible, durationSeconds, goal, presetName,
  totalDepth, depthGained, onClose, onContinue,
}: CompletionCelebrationProps) {
  const prefersReduced = useReducedMotion();
  const quote = useMemo(pickQuote, []);

  const minutes = Math.round(durationSeconds / 60);
  const depthLabel = totalDepth >= 1000
    ? `${(totalDepth / 1000).toFixed(1)}km`
    : `${Math.round(totalDepth)}m`;

  const handleContinue = useCallback(() => onContinue(), [onContinue]);

  return createPortal(
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* 背景遮罩 / Background overlay */}
          <div
            className="absolute inset-0 bg-gradient-to-b from-[#0a1628]/95 via-[#0d2847]/90 to-[#061224]/95"
            onClick={onClose}
          />

          {/* 气泡粒子（减弱动效时隐藏） / Bubble particles */}
          {!prefersReduced && <BubbleParticles />}

          {/* 主内容卡片 / Main content card */}
          <motion.div
            className={cn(
              'relative z-10 w-full max-w-sm mx-4 p-6 rounded-2xl',
              'bg-white/5 backdrop-blur-md border border-white/10',
              'flex flex-col items-center gap-4 text-center',
            )}
            initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.95 }}
            animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.4, ease: DEEP_SEA_EASE, delay: 0.1 }}
          >
            {/* 关闭按钮，带 tooltip */}
            <Tip text="关闭" side="left">
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
            </Tip>

            {/* 光柱图标 / Light beam icon */}
            <motion.div
              className="w-16 h-16 rounded-full bg-cyan-400/10 flex items-center justify-center"
              animate={prefersReduced ? {} : { scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Waves className="w-8 h-8 text-cyan-300" strokeWidth={1.5} />
            </motion.div>

            {/* 守夜人文案 / Guardian quote */}
            <p className="text-sm text-cyan-200/80 font-medium">{quote}</p>

            {/* 本次摘要 / Session summary */}
            <div className="w-full space-y-2 py-2">
              <SummaryRow label="专注时长" value={`${minutes} 分钟`} />
              {goal && <SummaryRow label="目标" value={goal} />}
              {presetName && <SummaryRow label="预设" value={presetName} />}
            </div>

            {/* 养成进度：深度 / Growth progress: depth */}
            <div className="w-full p-3 rounded-xl bg-white/5 border border-white/5">
              <div className="flex items-center justify-between text-xs text-white/50 mb-1.5">
                <span className="flex items-center gap-1">
                  <Anchor className="w-3 h-3" /> 累计深度
                </span>
                <span className="text-cyan-300 font-medium">{depthLabel}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${Math.min(100, (depthGained / Math.max(totalDepth, 1)) * 100 + 5)}%` }}
                  transition={{ duration: 1, ease: DEEP_SEA_EASE, delay: 0.3 }}
                />
              </div>
              <p className="text-[11px] text-white/40 mt-1">本次下潜 +{Math.round(depthGained)}m</p>
            </div>

            {/* 操作按钮 / Action buttons */}
            <div className="flex gap-3 w-full mt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 transition-colors"
              >
                休息一下
              </button>
              <button
                onClick={handleContinue}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white bg-cyan-600/80 hover:bg-cyan-500/80 transition-colors"
              >
                继续深潜
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── 子组件 / Sub-components ───────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-white/50">{label}</span>
      <span className="text-white/90 font-medium truncate max-w-[180px]">{value}</span>
    </div>
  );
}

/** 气泡上升粒子效果 / Rising bubble particle effect */
function BubbleParticles() {
  const bubbles = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      size: 4 + Math.random() * 8,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 3,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className="absolute rounded-full bg-cyan-300/20 border border-cyan-200/10"
          style={{ left: `${b.x}%`, width: b.size, height: b.size, bottom: -20 }}
          animate={{ y: [0, -window.innerHeight - 40], opacity: [0.6, 0] }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  );
}
