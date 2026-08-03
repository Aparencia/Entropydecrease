/**
 * 世界信号订阅 Hook
 * World signals subscription hook
 *
 * @ai-context: 订阅珊瑚生态/深海发现/留存设置 store，实时派生世界信号集，
 * 供 3D 场景层（SpatialNav 实体辉光、混沌雾/潮汐/沉积层）消费。
 * streak 从珊瑚种植日期派生（与 DashboardPage 口径一致，无额外存储）。
 *
 * @ai-context: Subscribes to retention stores and derives live world signals
 * for the 3D scene layer. Streak is derived from coral plant dates.
 */
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { useDiscoveryStore } from '../store/useDiscoveryStore';
import { useRetentionSettings } from '../store/useRetentionSettings';
import {
  computeCurrentStreakFromCorals,
  deriveWorldSignals,
  vitalityToGlowScale,
  type WorldSignals,
} from '../lib/worldState';

/** 世界信号 + 派生的实体辉光乘数 / Signals plus derived glow multiplier */
export type WorldSignalsWithGlow = WorldSignals & { glowScale: number };

export function useWorldSignals(): WorldSignalsWithGlow {
  // 细粒度 selector：避免整 store 订阅连带重渲染（3D 场景对帧率敏感）
  const corals = useEcosystemStore((s) => s.corals);
  const totalDepth = useEcosystemStore((s) => s.totalDepth);
  const discoveriesCount = useDiscoveryStore((s) => s.totalCount);
  const enabled = useRetentionSettings((s) => s.enabled);

  return useMemo(() => {
    const signals = deriveWorldSignals({
      corals,
      totalDepth,
      discoveriesCount,
      currentStreak: computeCurrentStreakFromCorals(corals),
      enabled,
    });
    return { ...signals, glowScale: vitalityToGlowScale(signals.vitality) };
  }, [corals, totalDepth, discoveriesCount, enabled]);
}

/**
 * 细粒度选择器版本（3D 逐帧层专用） / Selector variant for frame-critical layers
 *
 * @ai-context 内部复用 useWorldSignals 派生结果，再用 useShallow 选取子集：
 * 仅当所选字段变化时才触发组件重渲染（如 ChaosMist 只选 mist）。
 */
export function useWorldSignalsSelect<T extends Partial<WorldSignalsWithGlow>>(
  selector: (s: WorldSignalsWithGlow) => T,
): T {
  const signals = useWorldSignals();
  return useShallow(selector)(signals);
}
