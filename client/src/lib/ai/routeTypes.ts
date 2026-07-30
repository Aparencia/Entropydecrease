/**
 * 智能路由 — 类型与默认配置
 *
 * @ai-context: RouteDecision 三个 *Enabled 布尔位指导 CaptureManager 启停
 * 采集通道；降级链固定为 UI Automation（零成本）→ 视觉提取（主力）→
 * ASR（辅助），修改默认阈值会改变全体用户的降级灵敏度。
 * @ai-context: 纯类型与常量，无运行时副作用。
 */

/** 路由策略 */
export type RouteStrategy = 'auto' | 'vision_only' | 'audio_only' | 'both' | 'ui_automation';

/** 路由决策结果 */
export interface RouteDecision {
  strategy: RouteStrategy;
  reason: string;
  visionEnabled: boolean;
  audioEnabled: boolean;
  uiAutomationEnabled: boolean;
}

/** 路由配置 */
export interface RouteDispatcherConfig {
  /** 首选策略 */
  preferredStrategy: RouteStrategy;
  /** 视觉提取置信度阈值，低于此值触发降级，默认 0.6 */
  visionConfidenceThreshold: number;
  /** ASR 置信度阈值，默认 0.7 */
  asrConfidenceThreshold: number;
  /** 最大重试次数，默认 2 */
  maxRetries: number;
  /** 所有路径失败时降级为手动输入，默认 true */
  fallbackToManual: boolean;
}

/** 路由来源标识 */
export type RouteSource = 'vision' | 'audio' | 'uiAutomation';

/** 融合输入条目 */
export interface FusionInput {
  source: RouteSource;
  text: string;
  confidence: number;
  timestamp: number;
}

/** 融合输出结果 */
export interface FusionResult {
  text: string;
  confidence: number;
  sources: string[];
}

/** 默认路由配置 */
export const DEFAULT_ROUTE_CONFIG: RouteDispatcherConfig = {
  preferredStrategy: 'auto',
  visionConfidenceThreshold: 0.6,
  asrConfidenceThreshold: 0.7,
  maxRetries: 2,
  fallbackToManual: true,
};
