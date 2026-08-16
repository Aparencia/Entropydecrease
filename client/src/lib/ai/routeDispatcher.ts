/**
 * 智能路由调度引擎
 *
 * 根据场景自动选择最优采集/处理路径。
 * 核心职责：将截图 / 音频 / UI 文本等数据分发给所有已注册的 Worker，
 * 由各 Worker 自行判断是否可处理（canProcess），Dispatcher 负责 try/catch 隔离错误。
 *
 * 降级链：UI Automation（零成本）→ 多模态 AI 视觉提取（主力）→ ASR 语音转写（辅助）
 *
 * @ai-context: 2026-07 拆分——类型/默认配置在 routeTypes，融合纯函数在
 * routeFusion；旧导入路径经文末 re-export 保持兼容。
 * @ai-context: dispatch 对 Worker 逐个 try/catch 错误隔离是刻意设计，
 * 单 Worker 失败绝不可中断其余 Worker。
 */

import type {
  PipelineMessage,
  PipelineWorker,
  ExtractionResult,
} from '@/lib/capture/captureTypes';
import {
  DEFAULT_ROUTE_CONFIG,
  type RouteDecision,
  type RouteDispatcherConfig,
  type RouteSource,
  type FusionInput,
  type FusionResult,
} from './routeTypes';
import { fuseResults as fuseResultsFn } from './routeFusion';
import { resolveFromStrategy, makeFallbackDecision } from './routeStrategy';

export class RouteDispatcher {
  private config: RouteDispatcherConfig;
  private lastDecision: RouteDecision | null = null;
  private failureCounts: Record<RouteSource, number> = {
    vision: 0,
    audio: 0,
    uiAutomation: 0,
  };

  /** 已注册的 Worker 列表 */
  private workers: PipelineWorker[] = [];

  constructor(config: Partial<RouteDispatcherConfig> = {}) {
    this.config = { ...DEFAULT_ROUTE_CONFIG, ...config };
  }

  // ================================================================
  // Worker 注册
  // ================================================================

  /**
   * 注册 Worker 到调度器
   */
  registerWorker(worker: PipelineWorker): void {
    this.workers.push(worker);
  }

  /**
   * 移除 Worker
   */
  unregisterWorker(name: string): void {
    const idx = this.workers.findIndex(w => w.name === name);
    if (idx >= 0) {
      this.workers[idx].dispose();
      this.workers.splice(idx, 1);
    }
  }

  // ================================================================
  // 路由决策
  // ================================================================

  /**
   * 根据当前场景和可用资源做出路由决策。
   * 决策结果用于指导上层（CaptureManager）启用哪些采集通道。
   */
  decide(context: {
    hasWindowAccess: boolean;
    hasAudioSource: boolean;
    uiAutomationAvailable: boolean;
    lastVisionConfidence?: number;
    lastASRConfidence?: number;
  }): RouteDecision {
    const { preferredStrategy } = this.config;

    // 非 auto 模式：直接按策略映射
    if (preferredStrategy !== 'auto') {
      this.lastDecision = resolveFromStrategy(preferredStrategy, context);
      return this.lastDecision;
    }

    // ---- auto 模式 ----
    // 优先尝试 UI Automation（零成本），不可用则视觉+音频并行
    if (context.uiAutomationAvailable && context.hasWindowAccess) {
      this.lastDecision = {
        strategy: 'auto',
        reason: 'UI Automation 可用，优先使用零成本路径',
        visionEnabled: true,       // 视觉作为并行后备
        audioEnabled: context.hasAudioSource,
        uiAutomationEnabled: true,
      };
    } else {
      // UI Automation 不可用，视觉 + 音频并行
      this.lastDecision = {
        strategy: 'auto',
        reason: context.hasWindowAccess
          ? 'UI Automation 不可用，视觉+音频并行'
          : '无窗口访问权限，启用所有可用通道',
        visionEnabled: context.hasWindowAccess,
        audioEnabled: context.hasAudioSource,
        uiAutomationEnabled: false,
      };
    }

    // 根据历史失败次数动态调整：连续失败超过阈值的通道临时关闭
    if (this.failureCounts.vision > this.config.maxRetries) {
      this.lastDecision.visionEnabled = false;
      this.lastDecision.reason += '；视觉通道连续失败已降级';
    }
    if (this.failureCounts.audio > this.config.maxRetries) {
      this.lastDecision.audioEnabled = false;
      this.lastDecision.reason += '；音频通道连续失败已降级';
    }
    if (this.failureCounts.uiAutomation > this.config.maxRetries) {
      this.lastDecision.uiAutomationEnabled = false;
      this.lastDecision.reason += '；UI Automation 通道连续失败已降级';
    }

    return this.lastDecision;
  }

  // ================================================================
  // 数据分发
  // ================================================================

  /**
   * 将消息分发给所有能处理它的 Worker。
   * 每个 Worker 通过自身的 canProcess() 判断是否可消费该消息。
   * 各 Worker 之间错误隔离（try/catch），单个 Worker 失败不影响其他。
   *
   * @returns 所有成功处理的 Worker 返回结果（失败的被跳过并记录日志）
   */
  async dispatch(message: PipelineMessage): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];

    for (const worker of this.workers) {
      if (!worker.canProcess(message)) continue;

      try {
        const result = await worker.process(message);
        if (result) {
          results.push(result);
        }
      } catch {
        // 错误隔离：单个 Worker 失败不影响其他
      }
    }

    return results;
  }

  // ================================================================
  // 结果反馈
  // ================================================================

  /**
   * 报告路由执行结果，用于动态调整策略。
   * 成功 → 重置失败计数；失败 → 累加失败计数。
   */
  reportResult(route: RouteSource, success: boolean, _confidence?: number): void {
    if (success) {
      this.failureCounts[route] = 0;
    } else {
      this.failureCounts[route]++;
    }
  }

  /**
   * 处理路由失败，决定降级策略。
   * 返回新的路由决策供上层使用。
   */
  handleFailure(route: RouteSource, _error: Error): RouteDecision {
    this.failureCounts[route]++;

    // 基于当前决策重新计算，失败的通道会被自动关闭
    const base = this.lastDecision ?? makeFallbackDecision();
    if (route === 'vision') base.visionEnabled = false;
    if (route === 'audio') base.audioEnabled = false;
    if (route === 'uiAutomation') base.uiAutomationEnabled = false;

    // 所有通道都被关闭时降级为手动
    if (!base.visionEnabled && !base.audioEnabled && !base.uiAutomationEnabled) {
      base.reason = this.config.fallbackToManual
        ? '所有路径失败，降级为手动输入'
        : '所有路径失败';
    }

    this.lastDecision = base;
    return base;
  }

  /**
   * 融合多路径结果（委托 routeFusion 纯函数，保留实例方法兼容旧调用）
   */
  fuseResults(results: FusionInput[]): FusionResult {
    return fuseResultsFn(results);
  }

  // ================================================================
  // 状态管理
  // ================================================================

  /**
   * 重置调度器状态（失败计数、上次决策等）
   */
  reset(): void {
    this.lastDecision = null;
    this.failureCounts = { vision: 0, audio: 0, uiAutomation: 0 };
  }

  /**
   * 获取上次决策结果
   */
  getLastDecision(): RouteDecision | null {
    return this.lastDecision;
  }

  /**
   * 获取各通道失败计数
   */
  getFailureCounts(): Record<RouteSource, number> {
    return { ...this.failureCounts };
  }

  /**
   * 销毁调度器，清理所有 Worker
   */
  dispose(): void {
    for (const worker of this.workers) {
      worker.dispose();
    }
    this.workers = [];
    this.reset();
  }
}

// ─── 向后兼容 re-export（旧导入路径保持有效） ────────────────────────────────

export { DEFAULT_ROUTE_CONFIG } from './routeTypes';
export type {
  RouteStrategy,
  RouteDecision,
  RouteDispatcherConfig,
  RouteSource,
  FusionInput,
  FusionResult,
} from './routeTypes';
export { fuseResults, jaccardSimilarity } from './routeFusion';
export { resolveFromStrategy, makeFallbackDecision } from './routeStrategy';
