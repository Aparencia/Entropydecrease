/**
 * 路由策略映射（纯函数）
 *
 * @ai-context: 固定策略 → 决策结果的纯映射，ui_automation 不可用时自动
 * 回退视觉通道。无副作用，可安全重构。
 */
import type { RouteStrategy, RouteDecision } from './routeTypes';

/** 策略解析上下文 */
export interface StrategyContext {
  hasWindowAccess: boolean;
  hasAudioSource: boolean;
  uiAutomationAvailable: boolean;
}

/**
 * 根据固定策略映射为决策结果
 */
export function resolveFromStrategy(
  strategy: RouteStrategy,
  context: StrategyContext,
): RouteDecision {
  switch (strategy) {
    case 'vision_only':
      return {
        strategy,
        reason: '指定仅视觉提取模式',
        visionEnabled: true,
        audioEnabled: false,
        uiAutomationEnabled: false,
      };
    case 'audio_only':
      return {
        strategy,
        reason: '指定仅 ASR 模式',
        visionEnabled: false,
        audioEnabled: true,
        uiAutomationEnabled: false,
      };
    case 'both':
      return {
        strategy,
        reason: '指定视觉+音频并行模式',
        visionEnabled: true,
        audioEnabled: true,
        uiAutomationEnabled: false,
      };
    case 'ui_automation':
      return {
        strategy,
        reason: context.uiAutomationAvailable
          ? '指定 UI Automation 模式'
          : '指定 UI Automation 模式（不可用，降级）',
        visionEnabled: !context.uiAutomationAvailable, // 不可用时回退到视觉
        audioEnabled: false,
        uiAutomationEnabled: context.uiAutomationAvailable,
      };
    default:
      return {
        strategy: 'auto',
        reason: '默认自动模式',
        visionEnabled: context.hasWindowAccess,
        audioEnabled: context.hasAudioSource,
        uiAutomationEnabled: context.uiAutomationAvailable && context.hasWindowAccess,
      };
  }
}

/**
 * 创建一个全部关闭的兜底决策
 */
export function makeFallbackDecision(): RouteDecision {
  return {
    strategy: 'auto',
    reason: '兜底决策',
    visionEnabled: false,
    audioEnabled: false,
    uiAutomationEnabled: false,
  };
}
