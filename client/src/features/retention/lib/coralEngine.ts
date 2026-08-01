/**
 * 珊瑚生长引擎
 * Coral growth engine
 *
 * @ai-context: 每次深潜生成一株珊瑚（形状由时长/预设决定），管理白化与恢复。
 * 白化规则：连续 3 天未深潜 → 最近一株白化；恢复：完成 1 次深潜即恢复。
 * 4.4 节约束：白化 ≠ 消失，仅视觉去饱和，无惩罚性文案。
 * @ai-context: Each deep dive generates a coral (shape by duration/preset).
 * Bleaching: 3 consecutive inactive days → latest coral bleaches;
 * Recovery: 1 dive restores. Bleaching ≠ removal, only visual desaturation.
 */
import type { CoralType, CoralHealth, CoralRecord } from '../types';

// ─── 珊瑚类型决定 / Coral type determination ───────────────────────

/**
 * 根据学习行为决定珊瑚类型
 * Determine coral type based on learning action
 */
export function determineCoralType(
  durationMinutes: number,
  sourceType: 'pomodoro' | 'flashcard' | 'feynman',
  consecutiveDays: number,
): CoralType {
  if (sourceType === 'flashcard') return 'tube';
  if (consecutiveDays >= 5) return 'fan';
  if (durationMinutes >= 40) return 'brain';
  return 'branching';
}

/**
 * 计算深度（米）：每分钟专注 = 4m 深度
 * Calculate depth (meters): 1 minute focus = 4m depth
 */
export function calculateDepth(durationMinutes: number): number {
  return durationMinutes * 4;
}

// ─── 深海分层 / Deep sea zones ─────────────────────────────────────

export interface DepthZone {
  name: string;
  minDepth: number;
  maxDepth: number;
  color: string;
}

export const DEPTH_ZONES: DepthZone[] = [
  { name: '透光层', minDepth: 0, maxDepth: 200, color: '#38bdf8' },
  { name: '中层带', minDepth: 200, maxDepth: 1000, color: '#6366f1' },
  { name: '深层带', minDepth: 1000, maxDepth: 4000, color: '#7c3aed' },
  { name: '超深层', minDepth: 4000, maxDepth: Infinity, color: '#1e1b4b' },
];

/**
 * 获取当前所在深海分层
 * Get current depth zone
 */
export function getDepthZone(totalDepth: number): DepthZone {
  return DEPTH_ZONES.find((z) => totalDepth >= z.minDepth && totalDepth < z.maxDepth)
    ?? DEPTH_ZONES[DEPTH_ZONES.length - 1];
}

/**
 * 获取到下一层的进度百分比
 * Get progress percentage to next zone
 */
export function getZoneProgress(totalDepth: number): number {
  const zone = getDepthZone(totalDepth);
  if (zone.maxDepth === Infinity) return 100;
  const range = zone.maxDepth - zone.minDepth;
  return Math.min(100, Math.round(((totalDepth - zone.minDepth) / range) * 100));
}

// ─── 白化逻辑 / Bleaching logic ────────────────────────────────────

/** 白化触发天数阈值 / Bleaching trigger threshold (days) */
const BLEACH_THRESHOLD_DAYS = 3;

/**
 * 检查是否需要白化
 * Check if bleaching should occur
 *
 * @param corals 所有珊瑚记录
 * @param lastActiveDate 最后活跃日期 (YYYY-MM-DD)
 * @param today 今天日期
 * @returns 需要白化的珊瑚 ID 列表
 */
export function checkBleaching(
  corals: CoralRecord[],
  lastActiveDate: string,
  today: Date,
): string[] {
  const last = new Date(lastActiveDate);
  const diffDays = Math.floor((today.getTime() - last.getTime()) / 86_400_000);

  if (diffDays < BLEACH_THRESHOLD_DAYS) return [];

  // 只白化最近一株健康的珊瑚 / Only bleach the latest healthy coral
  const healthyCorals = corals
    .filter((c) => c.health === 'healthy')
    .sort((a, b) => new Date(b.plantedAt).getTime() - new Date(a.plantedAt).getTime());

  if (healthyCorals.length === 0) return [];
  return [healthyCorals[0].id];
}

/**
 * 恢复所有白化珊瑚
 * Restore all bleached corals
 */
export function restoreBleached(corals: CoralRecord[]): CoralRecord[] {
  return corals.map((c) =>
    c.health === 'bleached' ? { ...c, health: 'healthy' as CoralHealth } : c,
  );
}

// ─── 珊瑚视觉配置 / Coral visual config ────────────────────────────

export function getCoralTypeLabel(type: CoralType): string {
  switch (type) {
    case 'branching': return '枝状珊瑚';
    case 'brain': return '脑珊瑚';
    case 'fan': return '扇形珊瑚';
    case 'tube': return '管虫';
  }
}

export function getCoralTypeColor(type: CoralType): string {
  switch (type) {
    case 'branching': return '#f472b6';
    case 'brain': return '#a78bfa';
    case 'fan': return '#34d399';
    case 'tube': return '#fbbf24';
  }
}
