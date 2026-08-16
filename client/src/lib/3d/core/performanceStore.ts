/**
 * 3D 性能档位 Zustand store（自 PerformanceMonitor.tsx 拆出）
 *
 * @ai-context: 3D 场景核心——FPS/tier 全局状态 store；从组件文件移出
 * （react-refresh：组件文件只导出组件），PerformanceMonitor 组件保留在原文件。
 */
import { create } from 'zustand';
import type { PerformanceTier } from './tierPolicy';

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
