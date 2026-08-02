/**
 * 智能采集路径（Path B）子控制器
 *
 * @ai-context: 从 CaptureManager 拆出的 smart 路径独立状态机——不走
 * Pipeline/Worker，改用 SmartSampler 关键帧采样 + VADMarker 语音分段 +
 * 流式 ASR。会话结束时 assembleBundle 一次性打包关键帧/语音段/时间轴。
 * @ai-context: sessionId 由 CaptureManager 持有并逐次传入（本控制器不持有
 * 权威 sessionId）；vadStatsIntervalId 每 5s 发射音频健康统计，stop 时必须
 * 清理定时器否则泄漏。
 */
import { SmartSampler } from './smartSampler';
import { VADMarker } from './vadMarker';
import { captureEventBus } from './eventBus';
import type { ScreenshotData, AudioChunkData, SessionBundle } from './captureTypes';

export class SmartCaptureController {
  private smartSampler: SmartSampler | null = null;
  private vadMarker: VADMarker | null = null;
  private vadStatsIntervalId: ReturnType<typeof setInterval> | null = null;
  private smartStartTime = 0;

  /** 是否处于激活状态 */
  get isActive(): boolean {
    return this.smartSampler !== null;
  }

  /**
   * 启动 smart 采集：初始化采样器/分段器/统计定时器
   *
   * @param sessionId 会话 ID（由 CaptureManager 传入）
   * @param microphone 是否使用麦克风源（现场课程场景），
   *   true 时启用 VADMarker 的背景噪声校准，false 时使用 loopback 预设阈值
   */
  start(sessionId: string, microphone?: boolean): void {
    this.smartStartTime = Date.now();
    this.smartSampler = new SmartSampler();
    // 根据采集源选择 VAD 模式：
    // - 麦克风（现场课程）：启用自适应校准，前 N 块采样背景噪声自动调整阈值
    // - 系统环回（网课）：数字信号无环境底噪，使用预设阈值跳过校准
    this.vadMarker = new VADMarker({
      sourceType: microphone ? 'microphone' : 'loopback',
    });

    // 流式 ASR：语音段完成后立即发射事件，由上层 Hook 触发转写
    this.vadMarker.onSegmentReady = (segment) => {
      captureEventBus.emit('smart:audio_segment_ready', { sessionId, segment });
    };

    // 每 5s 发射 VAD 统计信息，供 UI 显示音频健康状态
    this.vadStatsIntervalId = setInterval(() => {
      if (this.vadMarker) {
        captureEventBus.emit('smart:vad_stats', {
          sessionId,
          stats: this.vadMarker.getStats(),
        });
      }
    }, 5000);
  }

  /**
   * 推送截图帧：SmartSampler 异步筛选关键帧，命中则广播
   * （processFrame 是 Canvas 压缩异步操作，fire-and-forget 不阻塞截图循环）
   */
  pushFrame(sessionId: string, frameData: ScreenshotData): void {
    if (!this.smartSampler) return;
    this.smartSampler.processFrame(frameData).then((keyframe) => {
      if (keyframe) {
        captureEventBus.emit('smart:keyframe', { sessionId, keyframe });
      }
    }).catch(() => { /* 压缩失败静默跳过，不阻断采集流 */ });
  }

  /** 推送音频块：VADMarker 检测语音段，流式触发 ASR 转写 */
  pushAudioChunk(audioData: AudioChunkData): void {
    this.vadMarker?.processChunk(audioData);
  }

  /**
   * 组装智能模式的完整数据包
   * 会话结束时一次性打包所有关键帧+语音段+时间轴，供 UI 层分析预览
   */
  assembleBundle(): SessionBundle {
    const keyframes = this.smartSampler?.getKeyframes() ?? [];
    const audioSegments = this.vadMarker?.getSegments() ?? [];
    const timeline = this.vadMarker?.getTimeline() ?? [];
    const duration = Date.now() - this.smartStartTime;
    return { keyframes, audioSegments, timeline, duration };
  }

  /** 停止并清理全部 smart 状态（含统计定时器） */
  stop(): void {
    this.smartSampler?.reset();
    this.vadMarker?.reset();
    this.smartSampler = null;
    this.vadMarker = null;
    if (this.vadStatsIntervalId !== null) {
      clearInterval(this.vadStatsIntervalId);
      this.vadStatsIntervalId = null;
    }
  }
}
