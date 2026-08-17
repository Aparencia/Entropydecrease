/**
 * Capacitor 自定义插件桥接：EntropyCapture（视频选取/元数据/音频抽取/录屏/本地 ASR）
 *
 * @ai-context: 渲染进程与原生插件的唯一通道。所有方法先经 isCapacitor() 门控，
 * 非原生环境调用抛错。事件：asrPartialText（流式部分文本）/ asrFinalText（最终文本）。
 * @ai-context EN: typed bridge to the custom EntropyCapture native plugin.
 */
import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface VideoMetadata {
  durationMs: number;
  width: number;
  height: number;
}

export interface PickedVideoPath {
  /** 应用私有目录下的视频绝对路径 */
  path: string;
  name: string;
  size: number;
}

export interface ExtractAudioResult {
  /** 分片 WAV 绝对路径列表（16kHz 16bit 单声道） */
  chunks: string[];
}

export interface RecordingState {
  recording: boolean;
  filePath: string;
}

export interface AsrInitResult {
  ready: boolean;
}

export interface AsrFeedResult {
  partial: string;
}

export interface AsrStopResult {
  text: string;
}

interface EntropyCapturePlugin {
  pickVideo(): Promise<PickedVideoPath | null>;
  getVideoMetadata(options: { path: string }): Promise<VideoMetadata>;
  extractAudio(options: {
    path: string;
    outDir?: string;
    segmentSeconds?: number;
    sampleRate?: number;
  }): Promise<ExtractAudioResult>;
  startScreenRecording(): Promise<{ started: boolean }>;
  stopScreenRecording(): Promise<{ stopped: boolean; filePath: string }>;
  getRecordingState(): Promise<RecordingState>;
  initAsr(): Promise<AsrInitResult>;
  asrStart(): Promise<{ started: boolean }>;
  asrFeedPcm(options: { samples: number[]; sampleRate?: number }): Promise<AsrFeedResult>;
  asrStop(): Promise<AsrStopResult>;
  asrTranscribeFile(options: { path: string }): Promise<{ text: string }>;
  addListener(
    eventName: 'asrPartialText' | 'asrFinalText',
    listener: (data: { text: string }) => void,
  ): Promise<PluginListenerHandle>;
}

export const EntropyCapture = registerPlugin<EntropyCapturePlugin>('EntropyCapture');
