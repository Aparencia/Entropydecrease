/**
 * 采集会话运行时状态（CaptureManager 拆分后的共享状态契约）
 * Shared runtime state contract after CaptureManager decomposition.
 *
 * @ai-context: CaptureManager 拆分后，会话级可变状态集中在 CaptureRuntime，
 * framePipeline / audioPipeline / sessionLifecycle 通过该接口读写状态，主类
 * 只做编排。字段与原 CaptureManager 私有字段一一对应，仅搬移不增删，行为不变。
 * @ai-context: All mutable session state lives in one CaptureRuntime object so
 * the extracted modules can share it without touching the manager's privates;
 * the field set mirrors the original CaptureManager fields exactly.
 */

import type { Pipeline } from './pipeline';
import type { CrossFusionEngine } from './crossFusion';
import type { RouteDispatcher, RouteDecision } from '@/lib/ai/routeDispatcher';
import type { ASRWorker } from '@/lib/ai/asrWorker';
import type { SmartCaptureController } from './smartCaptureController';
import type { FrameWatchdog } from './sessionWatchdog';
import type { CapturePath, CaptureSessionConfig } from './captureTypes';

/** P8 视觉提取模式（VisionWorker 消费 message.metadata.visionMode；undefined=auto） */
export type VisionMode = 'auto' | 'text' | 'formula' | 'diagram' | 'code' | 'full';

/** 采集会话运行时状态（模块间共享的可变状态契约） */
export interface CaptureRuntime {
  sessionId: string | null;
  sessionConfig: CaptureSessionConfig | null;
  frameCount: number;
  extractedCount: number;
  capturePath: CapturePath;
  isPaused: boolean;
  lastDecision: RouteDecision | null;
  visionMode: VisionMode | undefined;
  /** Path C 全程录制：记录录制开始时间用于计算 duration */
  fullRecordStartTime: number;
  fusionIntervalId: ReturnType<typeof setInterval> | null;
  asrWorker: ASRWorker | null;
  pipeline: Pipeline;
  dispatcher: RouteDispatcher;
  crossFusion: CrossFusionEngine;
  smartController: SmartCaptureController;
  frameWatchdog: FrameWatchdog;
}
