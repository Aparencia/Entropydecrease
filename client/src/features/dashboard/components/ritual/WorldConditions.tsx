/**
 * WorldConditions — 今日海况（宪法第六条 StartupRitual 接线）
 * WorldConditions — today's sea state line (constitution §6 ritual wiring)
 *
 * @ai-context: 仪式收尾的一句话世界叙事：从世界信号派生"今日海况"，
 * 让启动仪式成为世界的每日开场。措辞遵循焦虑防线：朦胧=等待唤醒，
 * 零负向语言；留存关闭时不渲染（可关闭性）。
 *
 * @ai-context: One narrative line derived from world signals, shown at ritual
 * completion. Positive phrasing only; hidden when retention is disabled.
 */
import { useWorldSignalsSelect } from '@/features/retention/hooks/useWorldSignals';
import { WORLD_ANCHORS } from '@/features/retention/lib/worldState';

export function WorldConditions() {
  const { mist, warmth, depthNorm, enabled } = useWorldSignalsSelect((s) => ({
    mist: s.mist, warmth: s.warmth, depthNorm: s.depthNorm, enabled: s.enabled,
  }));

  if (!enabled) return null;

  // 洋流温度（连击）→ 海况基调；雾（朦胧）→ 待唤醒提示；累计深度 → 潜航里程
  const tide = warmth >= 0.6 ? '洋流温暖' : warmth >= 0.3 ? '洋流平稳' : '洋流清凉';
  const visibility = mist >= 0.25 ? '，部分海域朦胧，等待唤醒' : '，能见度良好';
  const depth = depthNorm > 0
    ? ` · 累计潜航 ${Math.round(depthNorm * WORLD_ANCHORS.DEPTH_FULL)} 米`
    : '';

  return (
    <p className="text-xs text-text-tertiary text-left tracking-wide">
      今日海况：{tide}{visibility}{depth}
    </p>
  );
}
