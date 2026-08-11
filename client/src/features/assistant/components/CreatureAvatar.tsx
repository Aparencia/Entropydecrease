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
import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { motion, useMotionValue, animate, type AnimationPlaybackControls } from 'framer-motion';
import { Pin } from 'lucide-react';
import { useAssistantStore } from '../store/useAssistantStore';
import { CreatureBubble } from './CreatureBubble';
import { useWorkAreaBounds } from '../hooks/useWorkAreaBounds';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import {
  CREATURE_SIZE_IDLE,
  WANDER_INTERVAL_MIN_MS, WANDER_INTERVAL_MAX_MS,
  WANDER_DURATION_MIN_MS, WANDER_DURATION_MAX_MS,
  WANDER_RESUME_DELAY_MS, WANDER_BOUNDS,
  CREATURE_POS_STORAGE_KEY,
  ESCAPE_SPRING_STIFFNESS, ESCAPE_SPRING_DAMPING,
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
  const userActive = useAssistantStore(s => s.userActive);
  const isFixed = useAssistantStore(s => s.isFixed);
  const setIsFixed = useAssistantStore(s => s.setIsFixed);
  const setAutoFixed = useAssistantStore(s => s.setAutoFixed);

  const { isInWorkArea, getRandomTargetOutside } = useWorkAreaBounds();

  // 右键菜单状态
  const [ctxMenuPos, setCtxMenuPos] = useState<{ x: number; y: number } | null>(null);

  // 位置由 MotionValue 驱动（GPU 合成，不触发 React 重渲染）
  const initial = useRef(loadSavedPosition());
  const posX = useMotionValue(initial.current.x);
  const posY = useMotionValue(initial.current.y);

  // 漫游控制
  const wanderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 类型对齐 animate() 返回值：AnimationPlaybackControls 同时提供 stop() 与 finished
  // Promise（旧声明仅 { stop } 导致 .finished 访问报类型错误）
  const wanderAnimRef = useRef<AnimationPlaybackControls | null>(null);
  const isDraggingRef = useRef(false);

  // 受惊弹开动画状态（一过性 scale 脉冲）
  const [startledScale, setStartledScale] = useState<number[] | null>(null);
  const prevUserActiveRef = useRef(userActive);

  // 用 ref 保持 userActive 最新值供异步回调（wanderTo setTimeout 闭包）
  const userActiveRef = useRef(userActive);
  userActiveRef.current = userActive;

  /** 在视口漫游区域内随机选取目标点并平滑移动 */
  const wanderTo = useCallback(() => {
    // 固定状态不漫游
    if (useAssistantStore.getState().isFixed) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let targetX: number;
    let targetY: number;

    if (userActiveRef.current) {
      // 用户活跃时：仅在工作区外漫游
      const target = getRandomTargetOutside(vw, vh, CREATURE_SIZE_IDLE);
      targetX = target.x;
      targetY = target.y;

      // 检查目标是否仍在工作区内（小窗口无安全区时自动固定）
      if (isInWorkArea(targetX, targetY, CREATURE_SIZE_IDLE)) {
        setAutoFixed(true);
        return;
      }
    } else {
      // 用户空闲时：全屏漫游
      const { xMin, xMax, yMin, yMax } = WANDER_BOUNDS;
      targetX = vw * (xMin + Math.random() * (xMax - xMin));
      targetY = vh * (yMin + Math.random() * (yMax - yMin));
    }

    const duration = (WANDER_DURATION_MIN_MS + Math.random() * (WANDER_DURATION_MAX_MS - WANDER_DURATION_MIN_MS)) / 1000;

    // 停止上一次漫游动画
    wanderAnimRef.current?.stop();
    wanderAnimRef.current = animate(posX, targetX, {
      duration,
      ease: 'easeInOut',
    });
    animate(posY, targetY, { duration, ease: 'easeInOut' });
  }, [posX, posY, getRandomTargetOutside, isInWorkArea, setAutoFixed]);

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

  // 用户空闲→活跃转换：如果在工作区内则受惊弹开
  useEffect(() => {
    const wasIdle = prevUserActiveRef.current === false;
    const nowActive = userActive === true;
    prevUserActiveRef.current = userActive;

    if (wasIdle && nowActive) {
      const cx = posX.get();
      const cy = posY.get();
      if (isInWorkArea(cx, cy, CREATURE_SIZE_IDLE)) {
        // 停止当前漫游
        wanderAnimRef.current?.stop();
        if (wanderTimerRef.current) clearTimeout(wanderTimerRef.current);

        // 选取逃逸目标点
        const target = getRandomTargetOutside(window.innerWidth, window.innerHeight, CREATURE_SIZE_IDLE);

        // 弹簧动画：受惊弹开
        wanderAnimRef.current = animate(posX, target.x, {
          type: 'spring',
          stiffness: ESCAPE_SPRING_STIFFNESS,
          damping: ESCAPE_SPRING_DAMPING,
        });
        animate(posY, target.y, {
          type: 'spring',
          stiffness: ESCAPE_SPRING_STIFFNESS,
          damping: ESCAPE_SPRING_DAMPING,
        });

        // 触发受惊视觉反馈（scale 弹性脉冲）
        setStartledScale([1, 1.35, 0.9, 1.1, 1]);
        setTimeout(() => setStartledScale(null), 600);

        // 逃逸完成后重新调度漫游（使用 finished 感知弹簧动画真实结束）
        // stop() 会 reject finished——拖拽/二次逃逸打断时静默吞掉，避免 unhandled rejection
        wanderAnimRef.current?.finished.then(() => {
          if (!isDraggingRef.current) scheduleWander();
        }).catch(() => {});
      }
    }
  }, [userActive, posX, posY, isInWorkArea, getRandomTargetOutside, scheduleWander]);

  // 拖拽结束：持久化位置 + 5s 后恢复漫游
  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
    savePosition(posX.get(), posY.get());
    // 5s 后恢复漫游
    setTimeout(() => { if (!isDraggingRef.current) wanderTo(); }, WANDER_RESUME_DELAY_MS);
  }, [posX, posY, wanderTo]);

  // 右键菜单组
  const ctxMenuGroups = useMemo<ContextMenuGroup[]>(() => [
    {
      items: [
        {
          key: isFixed ? 'unfix' : 'fix',
          label: isFixed ? '恢复漫游' : '固定位置',
          icon: <Pin className="w-4 h-4" strokeWidth={1.5} />,
        },
      ],
    },
  ], [isFixed]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenuPos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCtxMenuSelect = useCallback((key: string) => {
    if (key === 'fix') {
      setIsFixed(true);
    } else if (key === 'unfix') {
      setIsFixed(false);
      // 恢复漫游
      scheduleWander();
    }
    setCtxMenuPos(null);
  }, [setIsFixed, scheduleWander]);

  return (
    <>
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
        onContextMenu={handleContextMenu}
        className="relative outline-none border-none bg-transparent cursor-pointer"
        style={{ width: CREATURE_SIZE_IDLE, height: CREATURE_SIZE_IDLE }}
        animate={{
          y: creatureState === 'resting' ? [0, 4, 0] : [0, -3, 0],
          scale: startledScale ?? (creatureState === 'alerting' ? [1, 1.08, 1] : 1),
        }}
        transition={{
          y: { duration: creatureState === 'resting' ? 6 : 4, repeat: Infinity, ease: 'easeInOut' },
          scale: { duration: startledScale ? 0.5 : 0.6, repeat: startledScale ? 0 : (creatureState === 'alerting' ? 3 : 0) },
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

    {ctxMenuPos && (
      <ContextMenu
        groups={ctxMenuGroups}
        position={ctxMenuPos}
        context={null}
        onSelect={(key) => handleCtxMenuSelect(key)}
        onClose={() => setCtxMenuPos(null)}
      />
    )}
    </>
  );
}
