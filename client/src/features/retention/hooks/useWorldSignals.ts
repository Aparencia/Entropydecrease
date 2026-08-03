/**
 * 世界信号订阅 Hook
 * World signals subscription hook
 *
 * @ai-context: 订阅珊瑚生态/深海发现/留存设置 store，实时派生世界信号集，
 * 供 3D 场景层（SpatialNav 实体辉光、后续混沌雾/萤火/洋流）消费。
 * streak 尚未接入 store（StreakBubble 走 props 传递），潮汐批次接线时补真实值。
 *
 * @ai-context: Subscribes to retention stores and derives live world signals
 * for the 3D scene layer. Streak wiring lands with the tide batch.
 */
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { useDiscoveryStore } from '../store/useDiscoveryStore';
import { useRetentionSettings } from '../store/useRetentionSettings';
import {
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
      // TODO(潮汐批次): streak store 接线后替换为真实连击值
      currentStreak: 0,
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
