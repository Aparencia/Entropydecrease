/**
 * 深海水母动画组件
 *
 * @ai-context: 助手视觉核心——CSS + Framer Motion 驱动的状态机动画；
 * 仅使用 transform/opacity/box-shadow 确保 GPU 合成层，不触发 layout/paint。
 * 状态：idle(漂浮) → alerting(琥珀金闪烁) → speaking(赛博青脉冲) → listening(微倾)。
 * 交互：可拖拽（Framer Motion drag + 视口约束 + 惯性），
 * idle 时自主漫游（随机目标点 + 贝塞尔缓动），拖拽后 5s 恢复漫游。
 * 位置持久化到 localStorage，下次打开应用水母在老位置。
 */
import { useRef, useEffect, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import { useAssistantStore } from '../store/useAssistantStore';
import { CreatureBubble } from './CreatureBubble';
import {
  CREATURE_SIZE_IDLE,
  WANDER_INTERVAL_MIN_MS, WANDER_INTERVAL_MAX_MS,
  WANDER_DURATION_MIN_MS, WANDER_DURATION_MAX_MS,
  WANDER_RESUME_DELAY_MS, WANDER_BOUNDS,
  CREATURE_POS_STORAGE_KEY,
} from '../constants';
import type { CreatureState } from '../types';

/** 状态 → 发光颜色映射（使用 CSS 变量适配双主题） */
const GLOW_MAP: Record<CreatureState, string> = {
  idle: '0 0 12px 2px color-mix(in srgb, var(--kb-cyber-cyan) 15%, transparent)',
  alerting: '0 0 20px 6px color-mix(in srgb, var(--kb-amber) 40%, transparent)',
  speaking: '0 0 18px 5px color-mix(in srgb, var(--kb-cyber-cyan) 45%, transparent)',
  listening: '0 0 10px 2px color-mix(in srgb, var(--kb-cyber-cyan) 20%, transparent)',
  resting: '0 0 6px 1px color-mix(in srgb, var(--kb-cyber-cyan) 8%, transparent)',
};

/** 从 localStorage 加载持久化位置，失败时返回默认右下角 */
function loadSavedPosition(): { x: number; y: number } {
  const fallback = {
    x: window.innerWidth - CREATURE_SIZE_IDLE - 24,
    y: window.innerHeight - CREATURE_SIZE_IDLE - 24,
  };
  try {
    const raw = localStorage.getItem(CREATURE_POS_STORAGE_KEY);
    if (raw) {
      const pos = JSON.parse(raw) as { x: number; y: number };
      // 窗口尺寸变化后确保位置仍在视口内
      return {
        x: Math.min(Math.max(20, pos.x), window.innerWidth - CREATURE_SIZE_IDLE - 20),
        y: Math.min(Math.max(60, pos.y), window.innerHeight - CREATURE_SIZE_IDLE - 20),
      };
    }
  } catch { /* 静默降级 */ }
  return fallback;
}

function savePosition(x: number, y: number): void {
  try { localStorage.setItem(CREATURE_POS_STORAGE_KEY, JSON.stringify({ x, y })); } catch { /* ignore */ }
}

interface Props {
  onClick: () => void;
  onBubbleClick: () => void;
  onBubbleDismiss: () => void;
}

export function CreatureAvatar({ onClick, onBubbleClick, onBubbleDismiss }: Props) {
  const creatureState = useAssistantStore(s => s.creatureState);
  const bubbleMessage = useAssistantStore(s => s.bubbleMessage);
  const panelState = useAssistantStore(s => s.panelState);

  // 位置由 MotionValue 驱动（GPU 合成，不触发 React 重渲染）
  const initial = useRef(loadSavedPosition());
  const posX = useMotionValue(initial.current.x);
  const posY = useMotionValue(initial.current.y);

  // 漫游控制
  const wanderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wanderAnimRef = useRef<{ stop: () => void } | null>(null);
  const isDraggingRef = useRef(false);

  /** 在视口漫游区域内随机选取目标点并平滑移动 */
  const wanderTo = useCallback(() => {
    const { xMin, xMax, yMin, yMax } = WANDER_BOUNDS;
    const targetX = window.innerWidth * (xMin + Math.random() * (xMax - xMin));
    const targetY = window.innerHeight * (yMin + Math.random() * (yMax - yMin));
    const duration = (WANDER_DURATION_MIN_MS + Math.random() * (WANDER_DURATION_MAX_MS - WANDER_DURATION_MIN_MS)) / 1000;

    // 停止上一次漫游动画
    wanderAnimRef.current?.stop();
    wanderAnimRef.current = animate(posX, targetX, {
      duration,
      ease: 'easeInOut',
    });
    animate(posY, targetY, { duration, ease: 'easeInOut' });
  }, [posX, posY]);

  /** 调度下一次漫游（随机间隔） */
  const scheduleWander = useCallback(() => {
    if (wanderTimerRef.current) clearTimeout(wanderTimerRef.current);
    const interval = WANDER_INTERVAL_MIN_MS + Math.random() * (WANDER_INTERVAL_MAX_MS - WANDER_INTERVAL_MIN_MS);
    wanderTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current && panelState !== 'expanded') {
        wanderTo();
      }
      scheduleWander();
    }, interval);
  }, [wanderTo, panelState]);

  // 启动/停止漫游循环
  useEffect(() => {
    scheduleWander();
    return () => {
      if (wanderTimerRef.current) clearTimeout(wanderTimerRef.current);
      wanderAnimRef.current?.stop();
    };
  }, [scheduleWander]);

  // 拖拽结束：持久化位置 + 5s 后恢复漫游
  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    savePosition(posX.get(), posY.get());
    // 5s 后恢复漫游
    setTimeout(() => { if (!isDraggingRef.current) wanderTo(); }, WANDER_RESUME_DELAY_MS);
  }, [posX, posY, wanderTo]);

  return (
    <motion.div
      className="fixed top-0 left-0 z-50 flex flex-col items-end"
      style={{ x: posX, y: posY, width: CREATURE_SIZE_IDLE }}
      drag
      dragMomentum
      dragElastic={0.08}
      dragConstraints={{
        top: 60,
        left: 20,
        right: window.innerWidth - CREATURE_SIZE_IDLE - 20,
        bottom: window.innerHeight - CREATURE_SIZE_IDLE - 20,
      }}
      onDragStart={() => {
        isDraggingRef.current = true;
        wanderAnimRef.current?.stop();
      }}
      onDragEnd={handleDragEnd}
    >
      {/* 气泡消息 */}
      <div className="relative">
        <CreatureBubble message={bubbleMessage} onClick={onBubbleClick} onDismiss={onBubbleDismiss} />
      </div>

      {/* 水母主体 */}
      <motion.button
        onClick={onClick}
        className="relative outline-none border-none bg-transparent cursor-pointer"
        style={{ width: CREATURE_SIZE_IDLE, height: CREATURE_SIZE_IDLE }}
        animate={{
          y: creatureState === 'resting' ? [0, 4, 0] : [0, -3, 0],
          scale: creatureState === 'alerting' ? [1, 1.08, 1] : 1,
        }}
        transition={{
          y: { duration: creatureState === 'resting' ? 6 : 4, repeat: Infinity, ease: 'easeInOut' },
          scale: { duration: 0.6, repeat: creatureState === 'alerting' ? 3 : 0 },
        }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label="AI 学伴助手"
      >
        {/* 伞体 */}
        <div
          className="absolute inset-x-1 top-0 h-[38px] transition-all duration-700"
          style={{
            background: 'radial-gradient(ellipse at 50% 30%, color-mix(in srgb, var(--kb-cyber-cyan) 25%, transparent), var(--kb-bg-secondary))',
            boxShadow: GLOW_MAP[creatureState],
            borderRadius: '50% 50% 40% 40%',
          }}
        />
        {/* 触须（4条，相位错开） */}
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            className="absolute bottom-0 w-[2px] rounded-full bg-cyber/30"
            style={{ left: `${20 + i * 16}%`, height: 22, transformOrigin: 'top' }}
            animate={{ rotateZ: [(-3 + i * 2), (3 - i * 2), (-3 + i * 2)] }}
            transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </motion.button>
    </motion.div>
  );
}
