/**
 * 采集会话管理器
 * 封装截图 + 视觉提取 + 语音转写 + 流水线的完整采集会话生命周期
 * 集成 RouteDispatcher 实现智能路由调度
 *
 * @ai-context: 2026-07 拆分——smart 路径状态机在 smartCaptureController、
 * 流水线结果处理在 captureResultProcessor；本类保留三路径（fine/smart/
 * full_record）编排与 fine 流水线生命周期，公共 API 与拆分前一致。
 * @ai-context: 三条 CapturePath 互斥：fine 走 Pipeline/Worker 逐帧提取；
 * smart 走 SmartCaptureController；full_record 仅计帧（录制由主进程
 * VideoRecorder 负责）。startSession 会先隐式 stopSession。
 * @ai-context: 会话可变状态集中在 CaptureRuntime（captureRuntime.ts）——
 * 帧管线/音频管线/生命周期分别委托 framePipeline.ts / audioPipeline.ts /
 * sessionLifecycle.ts，帧看门狗在 sessionWatchdog.ts；均为纯逻辑拆分，行为不变。
 */

import { Pipeline } from './pipeline';
import { CrossFusionEngine } from './crossFusion';
import { RouteDispatcher } from '@/lib/ai/routeDispatcher';
import type { RouteDispatcherConfig, RouteDecision } from '@/lib/ai/routeDispatcher';
import { VisionWorker } from '@/lib/ai/visionWorker';
import { SmartCaptureController } from './smartCaptureController';
import { FrameWatchdog } from './sessionWatchdog';
import { captureEventBus } from './eventBus';
import * as framePipeline from './framePipeline';
import * as audioPipeline from './audioPipeline';
import * as sessionLifecycle from './sessionLifecycle';
import type { CaptureRuntime, VisionMode } from './captureRuntime';
import type {
  CaptureSessionConfig,
  ScreenshotData,
  AudioChunkData,
  ExtractionResult,
  PipelineMessage,
} from './captureTypes';

// ================================================================
// CaptureManager
// ================================================================

export class CaptureManager {
  /** 会话可变状态（唯一状态源，模块间共享契约） */
  private rt: CaptureRuntime;
  private visionWorker: VisionWorker;
  /** 帧超时触发时的回调（通常为重启截图采集的函数） */
  private readonly onFrameWatchdogTimeout: (() => void) | null;
  /** CL-M10: 连续重启达到上限时的回调（提示用户手动处理） */
  private readonly onFrameWatchdogExhausted: (() => void) | null;

  /**
   * 设置视觉提取模式（公式/图表/代码等），写入截图消息 metadata 供 VisionWorker 消费
   */
  setVisionMode(mode: VisionMode): void {
    this.rt.visionMode = mode;
  }

  constructor(options?: {
    apiBaseUrl?: string;
    routeConfig?: Partial<RouteDispatcherConfig>;
    /** 帧超时毫秒数，默认 3000 */
    frameWatchdogTimeoutMs?: number;
    /** 帧超时触发时的回调（通常为重启截图采集的函数） */
    onFrameWatchdogTimeout?: () => void;
    /** CL-M10: 连续重启达到上限时的回调（提示用户手动处理） */
    onFrameWatchdogExhausted?: () => void;
  }) {
    // apiBaseUrl 保留供未来直接使用，当前 VisionWorker 通过 aiClient 全局配置
    void options?.apiBaseUrl;
    this.onFrameWatchdogTimeout = options?.onFrameWatchdogTimeout ?? null;
    this.onFrameWatchdogExhausted = options?.onFrameWatchdogExhausted ?? null;

    const crossFusion = new CrossFusionEngine(
      (segment) => {
        captureEventBus.emit('fusion:segment_complete', {
          sessionId: this.rt.sessionId,
          segment,
        });
      },
    );

    const dispatcher = new RouteDispatcher(options?.routeConfig);
    this.visionWorker = new VisionWorker();
    const pipeline = new Pipeline({
      maxQueueSize: 50,
      batchSize: 1,
      processingTimeout: 60_000, // 视觉提取可能需要较长时间
      onResult: (result, message) => this.handleResult(result, message),
      onError: (error, message) => this.handleError(error, message),
    });

    // 视觉 Worker 始终注册（最通用的路径）
    pipeline.registerWorker(this.visionWorker);
    dispatcher.registerWorker(this.visionWorker);

    const frameWatchdog = new FrameWatchdog({
      timeoutMs: options?.frameWatchdogTimeoutMs ?? 3000,
      // CL-M10: 连续重启上限——超过后停止自动恢复并通知 UI（防止幽灵采集循环）
      maxRestarts: 3,
      isActive: () => this.rt.sessionId !== null && this.onFrameWatchdogTimeout !== null,
      onTimeout: () => this.onFrameWatchdogTimeout?.(),
      onExhausted: () => this.onFrameWatchdogExhausted?.(),
    });

    this.rt = {
      sessionId: null,
      sessionConfig: null,
      frameCount: 0,
      extractedCount: 0,
      capturePath: 'fine',
      isPaused: false,
      lastDecision: null,
      visionMode: undefined,
      fullRecordStartTime: 0,
      fusionIntervalId: null,
      asrWorker: null,
      pipeline,
      dispatcher,
      crossFusion,
      smartController: new SmartCaptureController(),
      frameWatchdog,
    };
  }

  // ================================================================
  // 公共 API
  // ================================================================

  /**
   * 开始采集会话
   * 创建持久化会话记录，通过 RouteDispatcher 决策启用哪些 Worker，并初始化流水线状态
   */
  async startSession(config: CaptureSessionConfig): Promise<string> {
    return sessionLifecycle.startSession(this.rt, config);
  }

  /**
   * 停止采集会话
   * 清空流水线队列，重置调度器，更新会话状态
   */
  async stopSession(): Promise<void> {
    await sessionLifecycle.stopSession(this.rt);
  }

  /**
   * 课中重点标记（含 M2 自动锚点）
   * smart 路径广播 smart:bookmark 事件，由 useClassroomEvents 订阅写入
   * smartBundle.timeline（单一数据流；fine/full_record 路径直接忽略）。
   * @returns 是否实际广播（true=smart 路径已写入 timeline；false=非 smart 路径）
   */
  pushBookmark(type: 'bookmark' | 'auto_anchor' = 'bookmark', label?: string): boolean {
    if (!this.rt.sessionId || this.rt.capturePath !== 'smart') return false;
    captureEventBus.emit('smart:bookmark', {
      sessionId: this.rt.sessionId,
      timestamp: Date.now(),
      type,
      label,
    });
    return true;
  }

  /**
   * 推送截图帧到流水线
   */
  pushFrame(frameData: ScreenshotData): void {
    framePipeline.pushFrame(this.rt, frameData);
  }

  /**
   * 推送音频块到流水线
   */
  pushAudioChunk(audioData: AudioChunkData): void {
    audioPipeline.pushAudioChunk(this.rt, audioData);
  }

  /**
   * 暂停采集（停止接收新数据，但保持会话状态）
   */
  pauseSession(): void {
    if (!this.rt.sessionId || this.rt.isPaused) return;
    this.rt.isPaused = true;
    // smart 和 full_record 模式下 pipeline 无待清数据
    if (this.rt.capturePath === 'fine') {
      this.rt.pipeline.clear();
    }
  }

  /**
   * 恢复采集
   */
  resumeSession(): void {
    if (!this.rt.sessionId || !this.rt.isPaused) return;
    this.rt.isPaused = false;
  }

  /**
   * 获取当前会话状态
   */
  getStatus(): {
    sessionId: string | null;
    pipeline: { queueSize: number; workerCount: number; isProcessing: boolean };
    frameCount: number;
    extractedCount: number;
    routeDecision: RouteDecision | null;
  } {
    return {
      sessionId: this.rt.sessionId,
      pipeline: this.rt.pipeline.getStatus(),
      frameCount: this.rt.frameCount,
      extractedCount: this.rt.extractedCount,
      routeDecision: this.rt.lastDecision,
    };
  }

  /**
   * 获取 RouteDispatcher 实例（供外部高级用法）
   */
  getDispatcher(): RouteDispatcher {
    return this.rt.dispatcher;
  }

  /**
   * 销毁管理器，释放所有资源
   */
  dispose(): void {
    if (this.rt.sessionId) {
      // 异步停止但不等待（dispose 是同步方法）
      this.stopSession().catch((err) => {
        console.debug('[captureManager] stopSession failed (dispose)', err);
      });
    }
    if (this.rt.fusionIntervalId !== null) {
      clearInterval(this.rt.fusionIntervalId);
      this.rt.fusionIntervalId = null;
    }
    this.stopFrameWatchdog();
    this.rt.pipeline.dispose();
    this.rt.dispatcher.dispose();
    this.rt.crossFusion.reset();
    this.rt.asrWorker = null;
    this.rt.smartController.stop();
    this.rt.capturePath = 'fine';
    this.rt.fullRecordStartTime = 0;
    captureEventBus.off('session:started');
    captureEventBus.off('session:stopped');
    captureEventBus.off('frame:pushed');
    captureEventBus.off('fusion:vad_triggered');
    captureEventBus.off('fusion:segment_complete');
    captureEventBus.off('smart:keyframe');
    captureEventBus.off('smart:bundle_ready');
    captureEventBus.off('record:video_ready');
  }

  // ================================================================
  // 私有方法（流水线回调 → 委托 framePipeline）
  // ================================================================

  private handleResult(result: ExtractionResult, message: PipelineMessage): void {
    framePipeline.handleResult(this.rt, result, message);
  }

  private handleError(error: Error, message: PipelineMessage): void {
    framePipeline.handleError(this.rt, error, message);
  }

  // ================================================================
  // 帧超时保底重启（委托 sessionWatchdog）
  // ================================================================

  /**
   * 重置帧超时计时器（每收到一帧调用）
   * 如果连续 frameWatchdogTimeoutMs 未收到帧，触发 onFrameWatchdogTimeout
   */
  resetFrameWatchdog(): void {
    this.rt.frameWatchdog.reset();
  }

  /** 停止帧超时计时器 */
  private stopFrameWatchdog(): void {
    this.rt.frameWatchdog.stop();
  }
}
