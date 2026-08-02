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
 */

import { Pipeline } from './pipeline';
import { CrossFusionEngine } from './crossFusion';
import { RouteDispatcher } from '@/lib/ai/routeDispatcher';
import type { RouteDispatcherConfig, RouteDecision } from '@/lib/ai/routeDispatcher';
import { VisionWorker } from '@/lib/ai/visionWorker';
import { ASRWorker } from '@/lib/ai/asrWorker';
import { SmartCaptureController } from './smartCaptureController';
import { processExtractionResult, processExtractionError } from './captureResultProcessor';
import { captureEventBus } from './eventBus';
import { captureStore } from '@/lib/storage/captureStore';
import type {
  CapturePath,
  CaptureSessionConfig,
  ExtractionResult,
  PipelineMessage,
  ScreenshotData,
  AudioChunkData,
  VideoRecording,
} from './captureTypes';

// ================================================================
// CaptureManager
// ================================================================

export class CaptureManager {
  private pipeline: Pipeline;
  private dispatcher: RouteDispatcher;
  private crossFusion: CrossFusionEngine;
  private visionWorker: VisionWorker;
  private asrWorker: ASRWorker | null = null;
  private sessionId: string | null = null;
  private sessionConfig: CaptureSessionConfig | null = null;
  private frameCount = 0;
  private extractedCount = 0;
  private lastDecision: RouteDecision | null = null;
  private fusionIntervalId: ReturnType<typeof setInterval> | null = null;
  private isPaused = false;

  /** @ai-context Path B 智能模式状态隔离：smart 模式下不走 pipeline */
  private capturePath: CapturePath = 'fine';
  private smartController = new SmartCaptureController();

  /** @ai-context Path C 全程录制：记录录制开始时间用于计算 duration */
  private fullRecordStartTime = 0;

  // ---- 帧超时保底重启 ----
  private frameWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly frameWatchdogTimeoutMs: number;
  private onFrameWatchdogTimeout: (() => void) | null = null;

  constructor(options?: {
    apiBaseUrl?: string;
    routeConfig?: Partial<RouteDispatcherConfig>;
    /** 帧超时毫秒数，默认 3000 */
    frameWatchdogTimeoutMs?: number;
    /** 帧超时触发时的回调（通常为重启截图采集的函数） */
    onFrameWatchdogTimeout?: () => void;
  }) {
    // apiBaseUrl 保留供未来直接使用，当前 VisionWorker 通过 aiClient 全局配置
    void options?.apiBaseUrl;
    this.frameWatchdogTimeoutMs = options?.frameWatchdogTimeoutMs ?? 3000;
    this.onFrameWatchdogTimeout = options?.onFrameWatchdogTimeout ?? null;

    this.crossFusion = new CrossFusionEngine(
      (segment) => {
        captureEventBus.emit('fusion:segment_complete', {
          sessionId: this.sessionId,
          segment,
        });
      },
    );

    this.dispatcher = new RouteDispatcher(options?.routeConfig);
    this.visionWorker = new VisionWorker();
    this.pipeline = new Pipeline({
      maxQueueSize: 50,
      batchSize: 1,
      processingTimeout: 60_000, // 视觉提取可能需要较长时间
      onResult: (result, message) => this.handleResult(result, message),
      onError: (error, message) => this.handleError(error, message),
    });

    // 视觉 Worker 始终注册（最通用的路径）
    this.pipeline.registerWorker(this.visionWorker);
    this.dispatcher.registerWorker(this.visionWorker);
  }

  // ================================================================
  // 公共 API
  // ================================================================

  /** 创建持久化会话并重置计数（三路径共用） */
  private async initSessionRecord(
    config: CaptureSessionConfig,
    mode: 'vision' | 'both',
  ): Promise<string> {
    const session = await captureStore.createSession({
      targetWindow: config.windowTitle,
      mode,
      status: 'active',
      segments: [],
    });
    this.sessionId = session.id;
    this.sessionConfig = config;
    this.frameCount = 0;
    this.extractedCount = 0;
    return session.id;
  }

  /**
   * 开始采集会话
   * 创建持久化会话记录，通过 RouteDispatcher 决策启用哪些 Worker，并初始化流水线状态
   */
  async startSession(config: CaptureSessionConfig): Promise<string> {
    if (this.sessionId) {
      await this.stopSession();
    }

    this.capturePath = config.path ?? 'fine';

    // Path B 智能模式：跳过 Pipeline/Worker，用轻量采样器 + 流式 ASR 替代
    if (this.capturePath === 'smart') {
      const id = await this.initSessionRecord(config, 'vision');
      this.smartController.start(id, config.microphone);

      captureEventBus.emit('session:started', { sessionId: id, config, path: 'smart' });
      return id;
    }

    // Path C 全程录制：录制由 Electron 主进程 VideoRecorder 管理，此处仅协调状态
    if (this.capturePath === 'full_record') {
      const id = await this.initSessionRecord(config, 'vision');
      this.fullRecordStartTime = Date.now();

      captureEventBus.emit('session:started', { sessionId: id, config, path: 'full_record' });
      return id;
    }

    // Path A（fine）原有逐帧流水线模式
    this.lastDecision = this.dispatcher.decide({
      hasWindowAccess: !!config.windowId,
      hasAudioSource: config.audioEnabled,
      uiAutomationAvailable: false, // Electron 环境下后续检测
    });

    // 根据决策动态注册 ASR Worker（传入用户配置的语言）
    if (this.lastDecision.audioEnabled && !this.asrWorker) {
      this.asrWorker = new ASRWorker(config.language || 'zh');
      this.pipeline.registerWorker(this.asrWorker);
      this.dispatcher.registerWorker(this.asrWorker);
    } else if (!this.lastDecision.audioEnabled && this.asrWorker) {
      this.pipeline.unregisterWorker('asr-worker');
      this.dispatcher.unregisterWorker('asr-worker');
      this.asrWorker = null;
    }

    // 创建持久化会话
    const id = await this.initSessionRecord(config, this.lastDecision.audioEnabled ? 'both' : 'vision');

    captureEventBus.emit('session:started', {
      sessionId: id,
      config,
      routeDecision: this.lastDecision,
    });

    // 定期触发融合（每 3 秒）
    this.fusionIntervalId = setInterval(() => {
      if (this.sessionId) {
        this.crossFusion.fuseByTimeWindow();
      }
    }, 3000);

    // 启动帧超时保底检测
    this.resetFrameWatchdog();

    return id;
  }

  /**
   * 停止采集会话
   * 清空流水线队列，重置调度器，更新会话状态
   */
  async stopSession(): Promise<void> {
    if (!this.sessionId) return;

    // 最先停止帧超时保底计时器，防止在后续 await 期间触发重启
    this.stopFrameWatchdog();

    // Path C 全程录制：构建 VideoRecording 并广播 record:video_ready
    if (this.capturePath === 'full_record') {
      const duration = Date.now() - this.fullRecordStartTime;

      await captureStore.updateSession(this.sessionId, {
        status: 'completed',
        endedAt: new Date(),
      });

      // 视频文件信息由主进程 VideoRecorder 在 stopRecording 后返回，
      // 此处先发事件，外部监听者可通过 IPC 查询最终文件路径
      const videoRecording: VideoRecording = {
        filePath: '', // 由调用方在 IPC stop 回调中填充
        duration,
        fileSizeBytes: 0, // 由调用方在 IPC stop 回调中填充
        format: 'webm',
        hasAudio: false,
      };

      captureEventBus.emit('record:video_ready', {
        sessionId: this.sessionId,
        videoRecording,
      });

      this.emitStoppedAndReset();
      this.fullRecordStartTime = 0;
      return;
    }

    // Path B 智能模式：组装 SessionBundle 并广播
    if (this.capturePath === 'smart') {
      const bundle = this.smartController.assembleBundle();

      await captureStore.updateSession(this.sessionId, {
        status: 'completed',
        endedAt: new Date(),
      });

      captureEventBus.emit('smart:bundle_ready', {
        sessionId: this.sessionId,
        bundle,
      });

      this.smartController.stop();
      this.emitStoppedAndReset();
      return;
    }

    // Path A（fine）原有流水线清理
    this.pipeline.clear();
    this.dispatcher.reset();
    this.crossFusion.reset();
    this.lastDecision = null;
    this.isPaused = false;

    if (this.fusionIntervalId !== null) {
      clearInterval(this.fusionIntervalId);
      this.fusionIntervalId = null;
    }

    await captureStore.updateSession(this.sessionId, {
      status: 'completed',
      endedAt: new Date(),
    });

    captureEventBus.emit('session:stopped', {
      sessionId: this.sessionId,
      frameCount: this.frameCount,
      extractedCount: this.extractedCount,
    });

    this.sessionId = null;
    this.sessionConfig = null;
  }

  /** 广播 session:stopped 并重置公共会话状态（smart/full_record 共用） */
  private emitStoppedAndReset(): void {
    captureEventBus.emit('session:stopped', {
      sessionId: this.sessionId,
      frameCount: this.frameCount,
      extractedCount: this.extractedCount,
    });
    this.sessionId = null;
    this.sessionConfig = null;
    this.capturePath = 'fine';
  }

  /**
   * 推送截图帧到流水线
   */
  pushFrame(frameData: ScreenshotData): void {
    if (!this.sessionId || this.isPaused) return;

    // @ai-context Path C 全程录制：帧数据由 MediaRecorder 直接采集，无需处理
    if (this.capturePath === 'full_record') {
      this.frameCount++;
      return;
    }

    // Path B 智能模式：通过 SmartSampler 筛选关键帧
    if (this.capturePath === 'smart') {
      this.frameCount++;
      this.smartController.pushFrame(this.sessionId, frameData);
      return;
    }

    // Path A（fine）原有逐帧推送：检查路由决策是否启用视觉通道
    if (this.lastDecision && !this.lastDecision.visionEnabled) {
      return;
    }

    const message = this.pipeline.createMessage<ScreenshotData>(
      'screenshot',
      this.sessionId,
      frameData,
    );

    const accepted = this.pipeline.push(message);
    if (accepted) {
      this.frameCount++;
      // 每收到一帧，重置保底计时器
      this.resetFrameWatchdog();
      captureEventBus.emit('frame:pushed', {
        sessionId: this.sessionId,
        messageId: message.id,
        frameCount: this.frameCount,
      });
    }
  }

  /**
   * 推送音频块到流水线
   */
  pushAudioChunk(audioData: AudioChunkData): void {
    // TEMP DIAGNOSTIC（ASR 静默排查）：音频块进入路由的分叉点
    console.info(
      `[ASR-DIAG] pushAudioChunk: path=${this.capturePath}, hasSession=${!!this.sessionId}, paused=${this.isPaused}`,
    );
    if (!this.sessionId || this.isPaused) return;

    // @ai-context Path C 全程录制：音频由 MediaRecorder 直接采集，无需处理
    if (this.capturePath === 'full_record') return;

    // Path B 智能模式：VADMarker 检测语音段，流式触发 ASR 转写
    if (this.capturePath === 'smart') {
      this.smartController.pushAudioChunk(audioData);
      return;
    }

    // Path A（fine）：检查路由决策是否启用音频通道
    if (this.lastDecision && !this.lastDecision.audioEnabled) {
      return;
    }

    // VAD 检测：通过 CrossFusionEngine 判断是否有语音活动
    const voiceActive = this.crossFusion.detectVoiceActivity(audioData.audioBuffer);
    if (voiceActive) {
      this.crossFusion.requestVisionCapture();
    }

    const message = this.pipeline.createMessage<AudioChunkData>(
      'audio_chunk',
      this.sessionId,
      audioData,
    );

    this.pipeline.push(message);
  }

  /**
   * 暂停采集（停止接收新数据，但保持会话状态）
   */
  pauseSession(): void {
    if (!this.sessionId || this.isPaused) return;
    this.isPaused = true;
    // smart 和 full_record 模式下 pipeline 无待清数据
    if (this.capturePath === 'fine') {
      this.pipeline.clear();
    }
  }

  /**
   * 恢复采集
   */
  resumeSession(): void {
    if (!this.sessionId || !this.isPaused) return;
    this.isPaused = false;
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
      sessionId: this.sessionId,
      pipeline: this.pipeline.getStatus(),
      frameCount: this.frameCount,
      extractedCount: this.extractedCount,
      routeDecision: this.lastDecision,
    };
  }

  /**
   * 获取 RouteDispatcher 实例（供外部高级用法）
   */
  getDispatcher(): RouteDispatcher {
    return this.dispatcher;
  }

  /**
   * 销毁管理器，释放所有资源
   */
  dispose(): void {
    if (this.sessionId) {
      // 异步停止但不等待（dispose 是同步方法）
      this.stopSession().catch(() => {});
    }
    if (this.fusionIntervalId !== null) {
      clearInterval(this.fusionIntervalId);
      this.fusionIntervalId = null;
    }
    this.stopFrameWatchdog();
    this.pipeline.dispose();
    this.dispatcher.dispose();
    this.crossFusion.reset();
    this.asrWorker = null;
    this.smartController.stop();
    this.capturePath = 'fine';
    this.fullRecordStartTime = 0;
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
  // 私有方法（流水线回调 → 委托 captureResultProcessor）
  // ================================================================

  private handleResult(result: ExtractionResult, message: PipelineMessage): void {
    if (!this.sessionId) return;
    this.extractedCount++;
    processExtractionResult(
      this.dispatcher,
      this.crossFusion,
      {
        sessionId: this.sessionId,
        sessionConfig: this.sessionConfig,
        extractedCount: this.extractedCount,
      },
      result,
      message,
    );
  }

  private handleError(error: Error, message: PipelineMessage): void {
    const newDecision = processExtractionError(this.dispatcher, this.sessionId, error, message);
    if (newDecision) {
      this.lastDecision = newDecision;
    }
  }

  // ================================================================
  // 帧超时保底重启
  // ================================================================

  /**
   * 重置帧超时计时器（每收到一帧调用）
   * 如果连续 frameWatchdogTimeoutMs 未收到帧，触发 onFrameWatchdogTimeout
   */
  resetFrameWatchdog(): void {
    if (this.frameWatchdogTimer !== null) {
      clearTimeout(this.frameWatchdogTimer);
    }
    if (!this.sessionId || !this.onFrameWatchdogTimeout) return;
    this.frameWatchdogTimer = setTimeout(() => {
      this.frameWatchdogTimer = null;
      // eslint-disable-next-line no-console -- 保底重启警告
      console.warn(`[CaptureManager] 帧超时 ${this.frameWatchdogTimeoutMs}ms，触发保底重启`);
      this.onFrameWatchdogTimeout?.();
    }, this.frameWatchdogTimeoutMs);
  }

  /** 停止帧超时计时器 */
  private stopFrameWatchdog(): void {
    if (this.frameWatchdogTimer !== null) {
      clearTimeout(this.frameWatchdogTimer);
      this.frameWatchdogTimer = null;
    }
  }
}
