/**
 * 性能监控 — FPS追踪与动态降级
 *
 * 降级策略（防止“动画闪烁/长期隐藏”的三项关键设计）：
 * 1. 滞回：低于 25 记为低、高于 50 记为高，25~50 为缓冲区不触发变更，
 *    避免 FPS 在单一阈值附近振荡导致 tier 来回抖动；
 * 2. 持续判定：同方向连续 2 个窗口（4s）才逐级调整 tier，
 *    防止瞬时卡顿（着色器编译、GC、场景切换）造成立即降级；
 * 3. 后台重置：从后台返回时重置测量基线，避免浏览器后台 rAF 节流
 *    被误判为性能恶化、回到前台后立即降级。
 *
 * @ai-context: 3D 场景核心（R3F）：PerformanceMonitor。
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { create } from 'zustand';

type PerformanceTier = 'high' | 'medium' | 'low';

interface PerformanceState {
  tier: PerformanceTier;
  fps: number;
  setTier: (tier: PerformanceTier) => void;
  setFps: (fps: number) => void;
}

export const usePerformanceStore = create<PerformanceState>((set) => ({
  tier: 'high',
  fps: 60,
  setTier: (tier) => set({ tier }),
  setFps: (fps) => set({ fps }),
}));

/** FPS 阈值：低于 LOWER 计低、高于 UPPER 计高，中间为缓冲区（滞回） */
const LOWER_BOUND = 25;
const UPPER_BOUND = 50;
/** 触发 tier 变更所需的同方向连续窗口数（持续判定，每窗口 2s） */
const SUSTAIN_WINDOWS = 2;
/** FPS 测量窗口长度（ms） */
const WINDOW_MS = 2000;

export function PerformanceMonitor() {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const lowStreak = useRef(0);
  const highStreak = useRef(0);

  // 从后台返回后重置测量基线：后台期间浏览器节流 rAF，
  // 若不重置，返回后的第一个窗口会测出极低 FPS 被误判为降级
  useEffect(() => {
    const reset = () => {
      frameCount.current = 0;
      lastTime.current = performance.now();
      lowStreak.current = 0;
      highStreak.current = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reset();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;
    if (elapsed < WINDOW_MS) return;

    const fps = Math.round(frameCount.current * (1000 / elapsed));
    frameCount.current = 0;
    lastTime.current = now;

    // 在帧回调内取最新 tier，避免闭包捕获旧值
    const { tier, setTier, setFps } = usePerformanceStore.getState();
    setFps(fps);

    if (fps < LOWER_BOUND) {
      lowStreak.current++;
      highStreak.current = 0;
    } else if (fps > UPPER_BOUND) {
      highStreak.current++;
      lowStreak.current = 0;
    } else {
      // 缓冲区：双向计数清零，tier 保持不变
      lowStreak.current = 0;
      highStreak.current = 0;
    }

    // 持续同方向才逐级调整一级，避免悬崖式变更（high→low 会直接隐藏后处理）
    if (lowStreak.current >= SUSTAIN_WINDOWS) {
      lowStreak.current = 0;
      if (tier === 'high') setTier('medium');
      else if (tier === 'medium') setTier('low');
    } else if (highStreak.current >= SUSTAIN_WINDOWS) {
      highStreak.current = 0;
      if (tier === 'low') setTier('medium');
      else if (tier === 'medium') setTier('high');
    }
  });

  return null;
}
