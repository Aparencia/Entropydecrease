/**
 * 音视频交叉融合模块
 * 协调视觉和音频两个通道的数据，实现智能联动
 *
 * 核心功能：
 * 1. VAD（Voice Activity Detection）驱动视觉抓取
 * 2. ASR/视觉文本去重对齐：基于时间轴对齐，合并重复内容
 * 3. 公式与语音联合校正：语音中的数学术语与视觉公式交叉验证
 *
 * @ai-context: 2026-07 拆分——类型/常量在 fusionTypes、文本纯函数在
 * fusionTextUtils；本类保留 VAD 状态机与时间窗融合编排，旧导入路径
 * 经文末 re-export 全兼容。
 * @ai-context: fuseByTimeWindow 融合后会从缓冲区清除窗口内结果（副作用），
 * 重复调用不会重复产出段落；VAD 状态机（isSpeaking/speechStartTime/
 * lastSpeechTime）仅由 detectVoiceActivity 驱动。
 */

import { captureEventBus } from './eventBus';
import {
  DEFAULT_VAD_CONFIG, DEFAULT_FUSION_WINDOW_MS,
  type VADConfig, type FusionSegment, type VADTriggerEvent,
  type VisionResult, type AudioResult,
} from './fusionTypes';
import { buildFusionSegment } from './fusionSegmentBuilder';

// ================================================================
// CrossFusionEngine
// ================================================================

export class CrossFusionEngine {
  private vadConfig: VADConfig;
  private pendingSegments: Map<string, Partial<FusionSegment>> = new Map();
  private completedSegments: FusionSegment[] = [];

  private visionResults: VisionResult[] = [];
  private audioResults: AudioResult[] = [];

  private onSegmentComplete: (segment: FusionSegment) => void;
  private fusionWindowMs: number;
  private segmentCounter = 0;

  // VAD 状态
  private isSpeaking = false;
  private speechStartTime: number | null = null;
  private lastSpeechTime: number | null = null;

  constructor(
    onSegmentComplete: (segment: FusionSegment) => void,
    vadConfig?: Partial<VADConfig>,
    fusionWindowMs?: number,
  ) {
    this.onSegmentComplete = onSegmentComplete;
    this.vadConfig = { ...DEFAULT_VAD_CONFIG, ...vadConfig };
    this.fusionWindowMs = fusionWindowMs ?? DEFAULT_FUSION_WINDOW_MS;
  }

  // ================================================================
  // VAD（Voice Activity Detection）
  // ================================================================

  /**
   * 简易 VAD：基于音频 RMS 能量检测语音活动
   * 返回 true 表示检测到语音活动
   */
  detectVoiceActivity(audioBuffer: ArrayBuffer): boolean {
    const samples = new Float32Array(audioBuffer);
    if (samples.length === 0) return false;

    // 计算 RMS 能量
    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      sumSquares += samples[i] * samples[i];
    }
    const rmsEnergy = Math.sqrt(sumSquares / samples.length);

    const now = Date.now();
    const hasVoice = rmsEnergy >= this.vadConfig.energyThreshold;

    if (hasVoice) {
      if (!this.isSpeaking) {
        // 语音开始
        this.isSpeaking = true;
        this.speechStartTime = now;
      }
      this.lastSpeechTime = now;
    } else if (this.isSpeaking && this.lastSpeechTime !== null) {
      // 静音中，检查是否超过 silenceDuration
      const silenceElapsed = now - this.lastSpeechTime;
      if (silenceElapsed >= this.vadConfig.silenceDuration) {
        // 语音段落结束
        const duration = now - (this.speechStartTime ?? now);
        this.isSpeaking = false;

        if (duration >= this.vadConfig.minSpeechDuration) {
          this.completeSpeechSegment(this.speechStartTime ?? now, now);
        }
        // Speech too short — ignored

        this.speechStartTime = null;
        this.lastSpeechTime = null;
      }
    }

    return hasVoice;
  }

  /**
   * VAD 触发时调用：请求视觉抓取
   * 返回一个事件标识，供外部触发截图
   */
  requestVisionCapture(): VADTriggerEvent {
    const event: VADTriggerEvent = {
      type: 'vad_triggered',
      timestamp: Date.now(),
    };
    captureEventBus.emit('fusion:vad_triggered', event);
    return event;
  }

  // ================================================================
  // 接收结果
  // ================================================================

  /**
   * 接收视觉提取结果
   */
  addVisionResult(
    timestamp: number,
    text: string,
    confidence: number,
    structured?: Record<string, unknown>,
  ): void {
    this.visionResults.push({ timestamp, text, confidence, structured });
    this.tryFusePending();
  }

  /**
   * 接收 ASR 转写结果
   */
  addAudioResult(
    timestamp: number,
    text: string,
    confidence: number,
    segments?: Array<{ start: number; end: number; text: string }>,
  ): void {
    this.audioResults.push({ timestamp, text, confidence, segments });
    this.tryFusePending();
  }

  // ================================================================
  // 融合
  // ================================================================

  /**
   * 尝试融合时间窗口内的视觉和音频结果
   * 基于时间戳对齐（默认 ±5s 窗口）
   */
  fuseByTimeWindow(windowMs?: number): FusionSegment[] {
    const window = windowMs ?? this.fusionWindowMs;
    const now = Date.now();
    const windowStart = now - window;
    const windowEnd = now + window;

    // 收集窗口内的结果
    const visionInWindow = this.visionResults.filter(
      r => r.timestamp >= windowStart && r.timestamp <= windowEnd,
    );
    const audioInWindow = this.audioResults.filter(
      r => r.timestamp >= windowStart && r.timestamp <= windowEnd,
    );

    if (visionInWindow.length === 0 && audioInWindow.length === 0) {
      return [];
    }

    // 构建融合片段（纯计算委托 fusionSegmentBuilder）
    const segment = buildFusionSegment(
      `cf-${++this.segmentCounter}-${Date.now()}`,
      visionInWindow,
      audioInWindow,
    );

    this.completedSegments.push(segment);
    this.onSegmentComplete(segment);

    // 清理已融合的结果
    this.visionResults = this.visionResults.filter(
      r => r.timestamp < windowStart || r.timestamp > windowEnd,
    );
    this.audioResults = this.audioResults.filter(
      r => r.timestamp < windowStart || r.timestamp > windowEnd,
    );

    return [segment];
  }

  // ================================================================
  // 查询 & 状态管理
  // ================================================================

  /**
   * 获取已完成的融合片段
   */
  getCompletedSegments(): FusionSegment[] {
    return [...this.completedSegments];
  }

  /**
   * 清空状态
   */
  reset(): void {
    this.pendingSegments.clear();
    this.completedSegments = [];
    this.visionResults = [];
    this.audioResults = [];
    this.segmentCounter = 0;
    this.isSpeaking = false;
    this.speechStartTime = null;
    this.lastSpeechTime = null;
  }

  // ================================================================
  // 私有方法
  // ================================================================

  /**
   * 语音段落结束时自动尝试融合
   */
  private completeSpeechSegment(startTime: number, endTime: number): void {
    // 查找时间范围内的视觉和音频结果
    const visionInSegment = this.visionResults.filter(
      r => r.timestamp >= startTime - this.fusionWindowMs
        && r.timestamp <= endTime + this.fusionWindowMs,
    );
    const audioInSegment = this.audioResults.filter(
      r => r.timestamp >= startTime - this.fusionWindowMs
        && r.timestamp <= endTime + this.fusionWindowMs,
    );

    if (visionInSegment.length > 0 || audioInSegment.length > 0) {
      // 触发现有结果的融合
      this.fuseByTimeWindow(this.fusionWindowMs);
    }
  }

  /**
   * 尝试自动融合待处理的结果
   * 当视觉和音频结果在时间窗口内匹配时自动触发
   */
  private tryFusePending(): void {
    if (this.visionResults.length === 0 || this.audioResults.length === 0) {
      return;
    }

    // 检查是否有在时间窗口内匹配的视觉和音频结果
    for (const vision of this.visionResults) {
      for (const audio of this.audioResults) {
        const timeDiff = Math.abs(vision.timestamp - audio.timestamp);
        if (timeDiff <= this.fusionWindowMs) {
          // 有匹配的结果，触发融合
          this.fuseByTimeWindow(this.fusionWindowMs);
          return;
        }
      }
    }
  }
}

// ================================================================
// 向后兼容 re-export（旧导入路径不变）
// ================================================================

export type { VADConfig, FusionSegment, VADTriggerEvent } from './fusionTypes';
export { jaccardSimilarity } from './fusionTextUtils';
