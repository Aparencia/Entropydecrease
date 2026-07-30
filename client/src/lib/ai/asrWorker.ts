/**
 * ASR 语音转写 Worker
 *
 * 实现 PipelineWorker 接口，将音频块发送给 ASR 模型进行语音转文字。
 * 通过 ai-gateway 的 /api/v1/asr/transcribe 端点调用 Qwen3-ASR-Flash / GLM-ASR。
 *
 * @ai-context: 语音转写 Worker 封装，供智能采集链路调用。
 */

import type {
  PipelineMessage,
  PipelineWorker,
  ExtractionResult,
  AudioChunkData,
} from '@/lib/capture/captureTypes';
import { aiClient } from '@/lib/http/apiClient';

// ================================================================
// 响应类型（与后端 TranscribeResponse 对应）
// ================================================================

interface TranscribeSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscribeApiResponse {
  text: string;
  segments: TranscribeSegment[];
  language: string;
  confidence: number;
  model_used: string;
  processing_time_ms: number;
  warning?: string | null;
}

// ================================================================
// ASRWorker
// ================================================================

export class ASRWorker implements PipelineWorker {
  name = 'asr-worker';
  private readonly language: string;

  constructor(language: string = 'zh') {
    this.language = language;
  }

  canProcess(message: PipelineMessage): boolean {
    return message.type === 'audio_chunk';
  }

  async process(message: PipelineMessage): Promise<ExtractionResult | null> {
    const audioData = message.data as AudioChunkData;

    // ArrayBuffer → base64
    const base64 = arrayBufferToBase64(audioData.audioBuffer);

    // 调用后端 ASR API（使用配置的语言）
    const response = await aiClient.post<TranscribeApiResponse>(
      '/api/v1/asr/transcribe',
      {
        audio_base64: base64,
        language: this.language,
        sample_rate: audioData.sampleRate,
        channels: audioData.channels,
      },
    );

    // fallback 降级响应（含 warning 或 fallback 空文本）视为失败：
    // 抛错交由 Pipeline 错误隔离与日志，不再静默当作"无语音"跳过
    if (response.warning || (!response.text?.trim() && response.model_used === 'fallback')) {
      throw new Error(response.warning || 'ASR 服务降级，转写结果为空');
    }

    // 空结果跳过（正常无语音）
    if (!response.text || response.text.trim() === '') {
      return null;
    }

    // 转换为 ExtractionResult
    return {
      text: response.text,
      confidence: response.confidence,
      source: 'audio',
      model: response.model_used,
      processingTimeMs: response.processing_time_ms,
      structured: {
        segments: response.segments,
        language: response.language,
      },
    };
  }

  dispose(): void {}
}

// ================================================================
// 工具函数
// ================================================================

/** 将 ArrayBuffer 转为 base64 字符串 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
