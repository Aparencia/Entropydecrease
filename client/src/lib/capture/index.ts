/**
 * 采集模块入口
 * 混合方案的事件驱动异步流水线架构核心
 */

export { EventBus, captureEventBus } from './eventBus';
export { Pipeline } from './pipeline';
// ChangeDetector 依赖 pngjs/pixelmatch（Node.js 模块），仅在 Electron 主进程使用
// export { ChangeDetector } from './changeDetector';
export { CrossFusionEngine } from './crossFusion';
export type { VADConfig, FusionSegment, VADTriggerEvent } from './crossFusion';
export { CaptureManager } from './captureManager';
export { SmartSampler } from './smartSampler';
export type { SmartSamplerConfig } from './smartSampler';
export { VADMarker } from './vadMarker';
export type { VADMarkerConfig } from './vadMarker';
export { VideoRecorderRenderer } from './videoRecorderRenderer';
export { NoteGenerator } from './noteGenerator';
export type {
  NoteGeneratorConfig,
  InsertedSegment,
  NoteInsertCommand,
  AddSegmentResult,
} from './noteGenerator';
export { ASRWorker } from '@/lib/ai/asrWorker';
export { RouteDispatcher } from '@/lib/ai/routeDispatcher';
export type {
  RouteStrategy,
  RouteDecision,
  RouteDispatcherConfig,
  RouteSource,
  FusionInput,
  FusionResult,
} from '@/lib/ai/routeDispatcher';
export type {
  CapturePath,
  CaptureEventType,
  PipelineMessage,
  ScreenshotData,
  AudioChunkData,
  UITextData,
  ExtractionResult,
  PipelineWorker,
  SessionStatus,
  CaptureSession,
  CaptureSessionConfig,
  CourseMeta,
  WindowInfo,
  ExtractedSegment,
  CaptureMode,
  CaptureSidebarConfig,
  KeyFrame,
  AudioSegment,
  TimelineEntry,
  SessionBundle,
  VideoRecording,
  RecordingStatus,
} from './captureTypes';
