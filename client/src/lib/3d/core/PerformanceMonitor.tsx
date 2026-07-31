/**
 * 性能监控 — FPS追踪与动态降级（基于 drei 成熟方案）
 *
 * 重构说明（docs/standards/refactoring.md，外部行为不变）：
 * - FPS 测量与防抖委托给 drei <PerformanceMonitor>（工业级实现）：
 *   内置滑动均值（iterations×ms 采样）、bounds 滞回、threshold 比例持续判定
 *   与 flip-flop 保护，替代原自研单窗口测量 + 手写滞回/持续逻辑；
 * - tier 迁移策略抽取至纯函数模块 tierPolicy（已单测）；
 * - 本组件仅做装配：把 drei 回调映射为 tier 逐级迁移，并在窗口隐藏时
 *   卸载监控以重置测量基线（后台 rAF 节流期 FPS 不可信，卸载重挂即自然
 *   清零，避免回到前台被误判降级）。
 *
 * @ai-context: 3D 场景核心（R3F）：PerformanceMonitor。
 */
import { useEffect, useState } from 'react';
import { PerformanceMonitor as DreiPerformanceMonitor } from '@react-three/drei';
import { create } from 'zustand';
import { stepTier, type PerformanceTier } from './tierPolicy';

/** FPS 下界：持续低于此值触发降级（滞回缓冲区下限） */
export const FPS_LOWER_BOUND = 25;
/** FPS 上界：持续高于此值触发升级（滞回缓冲区上限） */
export const FPS_UPPER_BOUND = 50;
/** 升降震荡（flip-flop）允许次数上限，超过则回落稳定档 */
const MAX_FLIPFLOPS = 4;

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
  // 窗口隐藏时卸载监控：后台期间浏览器节流 rAF，FPS 读数不可信；
  // 返回前台重挂即自然重置采样基线，避免误判降级。
  // 附带收益：同时重置 drei 内部 flipped/fallback 计数，防止 fallback 永久锁定。
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!visible) return null;

  return (
    <DreiPerformanceMonitor
      bounds={() => [FPS_LOWER_BOUND, FPS_UPPER_BOUND]}
      flipflops={MAX_FLIPFLOPS}
      onIncline={(api) => {
        // 持续高 FPS（75%+ 样本 ≥ 上界）→ 逐级升档
        const { tier, setTier, setFps } = usePerformanceStore.getState();
        setFps(Math.round(api.fps));
        setTier(stepTier(tier, 'up'));
      }}
      onDecline={(api) => {
        // 持续低 FPS（75%+ 样本 < 下界）→ 逐级降档
        const { tier, setTier, setFps } = usePerformanceStore.getState();
        setFps(Math.round(api.fps));
        setTier(stepTier(tier, 'down'));
      }}
      onFallback={() => {
        // 震荡超限 → 稳定在中档：保留后处理特效、适度降低 DPR
        usePerformanceStore.getState().setTier('medium');
      }}
    />
  );
}
