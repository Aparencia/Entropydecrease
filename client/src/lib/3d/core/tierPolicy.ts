/**
 * tierPolicy — 性能分级（tier）逐级迁移策略（纯函数）
 *
 * 从 PerformanceMonitor 中抽取：将"tier 如何迁移"（纯逻辑）与"如何测量 FPS"
 * （R3F 副作用）物理分离，遵循 AI 编程规范 §1（副作用隔离）与 §6（自底向上：
 * 先原子纯函数层并附单测，再由系统层装配）。
 *
 * @ai-context: 纯函数模块，无副作用，可独立单测与安全重构。
 * @ai-context: tier 三级抽象（high/medium/low）被 AuroraDomeWorld / DeepSeaWorld /
 * ParticleSystem / QualityController 四处消费，改变其语义影响面大，需同步评估。
 */

/** 性能分级：high=全画质，medium=降分辨率，low=关闭后处理特效 */
export type PerformanceTier = 'high' | 'medium' | 'low';

/** tier 调整方向：up=升级，down=降级 */
export type TierTrend = 'up' | 'down';

/**
 * 逐级调整 tier（一次只迁移一级，不跨级跳变）。
 *
 * 为什么逐级：悬崖式变更（high→low）会立即卸载后处理与云层，
 * 造成"动画特效突然消失"的强烈视觉波动；逐级迁移使画质降级/恢复平滑。
 *
 * @param current - 当前 tier
 * @param trend - 调整方向
 * @returns 调整后的 tier；已处于边界时保持不变（low 不再降、high 不再升）
 */
export function stepTier(current: PerformanceTier, trend: TierTrend): PerformanceTier {
  if (trend === 'up') {
    return current === 'low' ? 'medium' : 'high';
  }
  return current === 'high' ? 'medium' : 'low';
}
