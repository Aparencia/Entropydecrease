/**
 * performanceMode — 性能模式（三档）纯函数配置层
 *
 * 三档性能模式（内部标识 low/medium/high，显示名 静谧/从容/澎湃，默认 从容/medium）：
 * - low  静谧：省电优先，tier 上限 low，UI 动画减弱、后台采集降频、允许后台节流
 * - medium 从容：性能与画质均衡（默认），tier 上限 medium
 * - high 澎湃：完整画质与特效，tier 上限 high
 *
 * tier 上限采用"天花板"模型：effectiveTier = min(autoTier, modeCap)。
 * 自动降档（drei PerformanceMonitor 按 FPS）仍然生效，但不会超过用户设定档位。
 * 粒子数/后处理/DPR 均随 tier 联动，故由 effectiveTier 统一驱动，无需在此重复配置。
 *
 * @ai-context: 纯函数模块，无副作用，可独立单测与安全重构。
 * 持久化键 ed-performance-mode（含旧键 keban- 兼容，2027-01 前保留）。
 */
import type { PerformanceTier } from '@/lib/3d/core/tierPolicy';

/** 性能模式内部标识 */
export type PerformanceMode = 'low' | 'medium' | 'high';

/** localStorage 持久化键 */
export const PERFORMANCE_MODE_KEY = 'ed-performance-mode';
/** 旧键（品牌重构前，2027-01 前兼容） */
export const LEGACY_PERFORMANCE_MODE_KEY = 'keban-performance-mode';

/** 默认模式：从容（medium） */
export const DEFAULT_PERFORMANCE_MODE: PerformanceMode = 'medium';

/** tier 顺序（用于比较高低） */
const TIER_ORDER: readonly PerformanceTier[] = ['low', 'medium', 'high'];

/** 模式显示信息 */
export interface PerformanceModeInfo {
  mode: PerformanceMode;
  /** 显示名（品牌调性） */
  label: string;
  /** 功能定位描述（直白说明，辅助理解） */
  description: string;
}

/** 三档显示信息（按 low→high 排序，供设置页渲染） */
export const PERFORMANCE_MODES: PerformanceModeInfo[] = [
  { mode: 'low', label: '静谧', description: '省电优先，适合长时间后台运行' },
  { mode: 'medium', label: '从容', description: '性能与画质均衡，推荐大多数场景' },
  { mode: 'high', label: '澎湃', description: '完整画质与特效，适合高性能设备' },
];

/** 各模式资源策略配置 */
export interface PerformanceModeConfig {
  /** 3D tier 上限（自动降档不会超过此级） */
  tierCap: PerformanceTier;
  /** DPR 上限（随 tier 联动，此处为参考值） */
  dprCap: number;
  /** 进入模块后的停靠延迟（ms）：相机飞行过渡时长，到时才暂停 3D 渲染；0 = 立即停靠暂停 */
  dockDelayMs: number;
  /** 是否减弱 UI 动画（Framer Motion） */
  reduceMotion: boolean;
  /** 后台采集频率倍率（1 = 正常） */
  captureRateScale: number;
  /** 是否允许后台节流（省电，需无进行中的番茄钟） */
  allowBackgroundThrottling: boolean;
}

/** 各模式资源策略表 */
export const PERFORMANCE_MODE_CONFIG: Record<PerformanceMode, PerformanceModeConfig> = {
  low: {
    tierCap: 'low',
    dprCap: 1,
    dockDelayMs: 0,
    reduceMotion: true,
    captureRateScale: 0.5,
    allowBackgroundThrottling: true,
  },
  medium: {
    tierCap: 'medium',
    dprCap: 1.5,
    dockDelayMs: 900,
    reduceMotion: false,
    captureRateScale: 1,
    allowBackgroundThrottling: false,
  },
  high: {
    tierCap: 'high',
    dprCap: 2,
    dockDelayMs: 1300,
    reduceMotion: false,
    captureRateScale: 1,
    allowBackgroundThrottling: false,
  },
};

/** mode → tier 上限 */
export function modeToTierCap(mode: PerformanceMode): PerformanceTier {
  return PERFORMANCE_MODE_CONFIG[mode].tierCap;
}

/** 判断是否为合法模式值 */
export function isPerformanceMode(v: unknown): v is PerformanceMode {
  return v === 'low' || v === 'medium' || v === 'high';
}

/**
 * 计算有效 tier：取自动 tier 与模式上限的较低者。
 * @param autoTier - drei PerformanceMonitor 自动测得的 tier
 * @param mode - 用户设定的性能模式
 * @returns 实际生效的 tier（不超过模式上限）
 */
export function effectiveTier(autoTier: PerformanceTier, mode: PerformanceMode): PerformanceTier {
  const cap = modeToTierCap(mode);
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(autoTier), TIER_ORDER.indexOf(cap))];
}

/** 读取持久化的模式（含旧键迁移）；缺失或非法时返回默认 medium */
export function readPerformanceMode(): PerformanceMode {
  try {
    let v = localStorage.getItem(PERFORMANCE_MODE_KEY);
    if (v === null) {
      const legacy = localStorage.getItem(LEGACY_PERFORMANCE_MODE_KEY);
      if (legacy !== null && isPerformanceMode(legacy)) {
        localStorage.setItem(PERFORMANCE_MODE_KEY, legacy);
        localStorage.removeItem(LEGACY_PERFORMANCE_MODE_KEY);
        return legacy;
      }
    }
    if (isPerformanceMode(v)) return v;
  } catch { /* localStorage 不可用时忽略 */ }
  return DEFAULT_PERFORMANCE_MODE;
}

/** 持久化模式 */
export function writePerformanceMode(mode: PerformanceMode): void {
  try {
    localStorage.setItem(PERFORMANCE_MODE_KEY, mode);
  } catch { /* ignore */ }
}
