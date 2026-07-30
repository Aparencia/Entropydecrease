/**
 * 性能监控 — FPS追踪与动态降级
 *
 * @ai-context: 3D 场景核心（R3F）：PerformanceMonitor。
 */
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
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

export function PerformanceMonitor() {
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const { setTier, setFps } = usePerformanceStore();

  useFrame(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;

    if (elapsed >= 2000) {
      const fps = Math.round(frameCount.current * (1000 / elapsed));
      setFps(fps);

      if (fps < 25) setTier('low');
      else if (fps < 45) setTier('medium');
      else setTier('high');

      frameCount.current = 0;
      lastTime.current = now;
    }
  });

  return null;
}
