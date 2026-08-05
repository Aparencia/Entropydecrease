/**
 * 微卡滑动交互 — 卡片堆栈
 * Micro-card swipe interaction — card stack
 *
 * @ai-context: 左滑已会（know）/ 右滑不会（don't know）/ 上滑标记深入（deep）。
 * framer-motion drag 实现；拖动时边缘浮现方向标签，松手超出阈值即离场。
 * 点击卡片翻面看答案。全部为本地状态，无网络依赖（离线可用）。
 * @ai-context: Swipe left = know, right = don't know, up = deep dive.
 * Drag with framer-motion; edge hints fade in while dragging; tap flips.
 * Fully local state — works offline.
 */
import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { MicroCard, MicroCardStatus } from '../lib/microCardApi';

const STARS = '★★★';

interface MicroCardSwipeProps {
  cards: MicroCard[];
  onSwipe: (cardId: string, status: MicroCardStatus) => void;
}

export default function MicroCardSwipe({ cards, onSwipe }: MicroCardSwipeProps) {
  const pending = cards.filter((c) => c.status === 'pending');
  // 最多堆叠 3 张预览（顶层可拖，下层静态）
  const stack = pending.slice(0, 3);

  if (stack.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-c1 text-text-tertiary">
        {cards.length > 0 ? '本组微卡已全部处理 🎉' : '输入主题生成第一组微卡'}
      </div>
    );
  }

  return (
    <div className="relative h-[300px] select-none">
      {stack.map((card, i) => {
        const top = i === 0;
        return (
          <AnimatePresence key={card.id}>
            <motion.div
              className="absolute inset-x-4"
              style={{ top: i * 10, zIndex: stack.length - i }}
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1 - i * 0.04, y: i * 8 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
            >
              {top ? (
                <SwipeableCard card={card} onSwipe={(s) => onSwipe(card.id, s)} />
              ) : (
                <CardShell card={card} preview />
              )}
            </motion.div>
          </AnimatePresence>
        );
      })}
    </div>
  );
}

/* ── 顶层可拖卡片 ── */
function SwipeableCard({ card, onSwipe }: { card: MicroCard; onSwipe: (status: MicroCardStatus) => void }) {
  const [flipped, setFlipped] = useState(false);
  const [exit, setExit] = useState<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-9, 9]);
  const knowOpacity = useTransform(x, [-150, -70], [1, 0]);      // 左滑 → 已会
  const unknownOpacity = useTransform(x, [70, 150], [0, 1]);     // 右滑 → 不会
  const deepOpacity = useTransform(y, [-150, -70], [1, 0]);      // 上滑 → 深入

  const handleDragEnd = (_: unknown, info: { offset: { x: number; y: number } }) => {
    const { offset } = info;
    if (offset.y < -80 && Math.abs(offset.y) > Math.abs(offset.x)) {
      setExit({ x: 0, y: -520 });
      onSwipe('deep');
    } else if (offset.x < -80) {
      setExit({ x: -520, y: 0 });
      onSwipe('known');
    } else if (offset.x > 80) {
      setExit({ x: 520, y: 0 });
      onSwipe('unknown');
    }
  };

  return (
    <motion.div
      drag
      dragSnapToOrigin
      dragElastic={0.55}
      style={{ x, y, rotate }}
      whileDrag={{ scale: 1.04 }}
      exit={exit ? { x: exit.x, y: exit.y, opacity: 0, transition: { duration: 0.24 } } : { opacity: 0 }}
      onDragStart={() => { draggedRef.current = true; }}
      onDragEnd={handleDragEnd}
      onClick={() => {
        // 拖拽后松手不触发翻面（framer-motion 不自动吞 click）
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        setFlipped((f) => !f);
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      <div className="relative">
        {/* 拖动方向标签 */}
        <motion.span style={{ opacity: knowOpacity }} className="absolute -left-3 top-1/2 -translate-y-1/2 -rotate-90 rounded-kb-md bg-emerald-500/15 px-2 py-1 text-c1 font-medium text-emerald-600 dark:text-emerald-400 pointer-events-none z-20">
          已会
        </motion.span>
        <motion.span style={{ opacity: unknownOpacity }} className="absolute -right-3 top-1/2 -translate-y-1/2 rotate-90 rounded-kb-md bg-red-500/15 px-2 py-1 text-c1 font-medium text-red-500 pointer-events-none z-20">
          不会
        </motion.span>
        <motion.span style={{ opacity: deepOpacity }} className="absolute left-1/2 -top-3 -translate-x-1/2 rounded-kb-md bg-amber-500/15 px-2 py-1 text-c1 font-medium text-amber-600 dark:text-amber-400 pointer-events-none z-20">
          深入
        </motion.span>

        {/* 卡片正/背面 */}
        <div className="rounded-kb-xl border border-border/50 bg-bg-elevated/70 backdrop-blur-sm shadow-sm px-6 py-8 min-h-[220px] flex flex-col justify-between">
          <div>
            {!flipped ? (
              <p className="text-b1 font-medium text-text-primary leading-relaxed">{card.front}</p>
            ) : (
              <p className="text-b2 text-text-secondary leading-relaxed">{card.back}</p>
            )}
          </div>
          <CardMeta card={card} hint={flipped ? '点击返回正面' : '点击翻面看答案'} />
        </div>
      </div>
    </motion.div>
  );
}

/* ── 下层预览卡（静态） ── */
function CardShell({ card, preview }: { card: MicroCard; preview?: boolean }) {
  return (
    <div className={cn('rounded-kb-xl border px-6 py-8 min-h-[220px] flex flex-col justify-between', preview ? 'border-border/30 bg-bg-secondary/60' : 'border-border/50 bg-bg-elevated')}>
      <p className="text-b1 font-medium text-text-primary/70 leading-relaxed">{card.front}</p>
      <CardMeta card={card} />
    </div>
  );
}

/* ── 元信息行：标签 + 难度 ── */
function CardMeta({ card, hint }: { card: MicroCard; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 mt-4">
      <div className="flex items-center gap-2">
        {card.tag && (
          <span className="rounded-kb-full bg-cyber/10 text-cyber px-2 py-0.5 text-c2">{card.tag}</span>
        )}
        <span className="text-c2 text-amber-500 tracking-tight" aria-label={`难度 ${card.difficulty}`}>
          {STARS.slice(0, card.difficulty)}
        </span>
      </div>
      {hint && <span className="text-c2 text-text-tertiary/60">{hint}</span>}
    </div>
  );
}
