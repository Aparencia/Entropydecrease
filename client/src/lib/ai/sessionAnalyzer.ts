/**
 * 智能模式课后分析客户端
 * 将 SessionBundle 发送到多模态分析端点，获取结构化课堂笔记
 */

import { supabase } from '@/lib/auth/supabaseClient';
import { classroomNoteStore } from '@/lib/storage/classroomNoteStore';
import { aiClient } from '@/lib/http/apiClient';
import type { SessionBundle, KeyFrame, AudioSegment } from '@/lib/capture/captureTypes';

// ================================================================
// 分析结果类型
// ================================================================

/** @ai-context 多模态分析接口返回的结构化笔记结果 */
export interface AnalyzeResult {
  content: string;
  keyframesAnalyzed: number;
  modelUsed: string;
  source?: 'local' | 'remote';
}

// ================================================================
// 音频段转写工具
// ================================================================

interface TranscribeResponse {
  text: string;
  confidence: number;
  model_used: string;
  /** 网关 ASR 降级时携带的警告信息（gateway warning on ASR fallback） */
  warning?: string;
}

/**
 * 将音频段的 audioBase64 通过 ASR API 转写为文本
 * 失败时静默返回 null，不阻塞整体分析流程
 */
async function transcribeSegment(
  seg: AudioSegment,
  language: string,
): Promise<string | null> {
  if (!seg.audioBase64) return null;
  try {
    const resp = await aiClient.post<TranscribeResponse>(
      '/api/v1/asr/transcribe',
      {
        audio_base64: seg.audioBase64,
        language,
        sample_rate: 16000,
        channels: 1,
      },
    );
    // @ai-context ASR fallback 空响应不视为成功转写，避免污染分析上下文
    // (ASR fallback empty response must not be treated as success)
    if (resp.warning || resp.model_used === 'fallback') return null;
    return resp.text?.trim() || null;
  } catch (e) {
    console.warn('[sessionAnalyzer] 音频段转写失败:', e);
    return null;
  }
}

// ================================================================
// 分析函数
// ================================================================

/**
 * 将智能模式采集的 SessionBundle 通过 IPC 发送到主进程进行多模态分析
 * @ai-context 通过 IPC ai_session_analyze 调用主进程 handler，超时由主进程控制
 */
export async function analyzeSession(
  bundle: SessionBundle,
  options?: { language?: string; sessionId?: string },
): Promise<AnalyzeResult> {
  // 鉴权获取
  const { data: { session } } = await supabase.auth.getSession();

  // 构造 IPC 参数（camelCase，epoch ms → 课程内相对秒数）
  // @ai-context KeyFrame.timestamp 为 epoch 毫秒，直接 /1000 会被网关格式化为
  // 巨大分钟数；与 analyzePartial / applyKeyframeImages 统一以首帧 timestamp
  // 为基准做差（negative clamped to 0），无关键帧时才回退到首音频段
  const sessionStartMs = bundle.keyframes.length > 0
    ? bundle.keyframes[0].timestamp
    : bundle.audioSegments.length > 0
      ? bundle.audioSegments[0].timestampStart
      : 0;
  const toRelativeSeconds = (ms: number) => Math.max(0, (ms - sessionStartMs) / 1000);

  const keyframes = bundle.keyframes.map((kf) => ({
    timestamp: toRelativeSeconds(kf.timestamp),
    imageBase64: kf.imageBase64,
    changeType: kf.changeType,
  }));

  // 转写音频段：优先使用流式 ASR 已转写的文本，仅对未转写的段进行补充转写
  const lang = options?.language === 'en' ? 'en' : options?.language === 'mixed' ? 'auto' : 'zh';
  const audioSegments = await Promise.all(
    bundle.audioSegments.map(async (seg) => ({
      timestampStart: toRelativeSeconds(seg.timestampStart),
      timestampEnd: toRelativeSeconds(seg.timestampEnd),
      audioText: seg.audioText ?? await transcribeSegment(seg, lang),
    })),
  );

  const result = await window.electronAPI!.invoke('ai_session_analyze', {
    keyframes,
    audioSegments,
    duration: bundle.duration / 1000,
    language: options?.language,
    authToken: session?.access_token,
  }) as { content: string; keyframesAnalyzed: number; modelUsed: string; source: string; requestId?: string };

  const analyzeResult: AnalyzeResult = {
    content: result.content,
    keyframesAnalyzed: result.keyframesAnalyzed,
    modelUsed: result.modelUsed,
    source: result.source as 'local' | 'remote' | undefined,
  };

  // 自动持久化分析结果
  try {
    await classroomNoteStore.create({
      // 优先使用真实采集 sessionId（供关键帧图片目录关联清理），缺省时保持随机 UUID
      sessionId: options?.sessionId ?? crypto.randomUUID(),
      title: `课堂笔记 ${new Date().toLocaleString('zh-CN')}`,
      content: analyzeResult.content,
      keyframesAnalyzed: analyzeResult.keyframesAnalyzed,
      modelUsed: analyzeResult.modelUsed,
      sourceType: 'smart',
      duration: bundle.duration / 1000,
    });
  } catch (e) {
    console.warn('[sessionAnalyzer] 笔记持久化失败:', e);
  }

  return analyzeResult;
}

// ================================================================
// 增量片段分析（边采边析）
// ================================================================

/**
 * 小批次关键帧增量分析，返回 Markdown 片段笔记
 * 复用现有 ai_session_analyze IPC（小批次走单 chunk 路径，本身就快）
 * @param sessionStartMs 会话开始的 epoch 毫秒，用于换算课程内相对秒数
 */
export async function analyzePartial(
  keyframes: KeyFrame[],
  sessionStartMs: number,
  options?: { language?: string },
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();

  // @ai-context 时间戳以会话开始时刻为基准换算为相对秒数（relative seconds）
  const kfPayload = keyframes.map((kf) => ({
    timestamp: Math.max(0, (kf.timestamp - sessionStartMs) / 1000),
    imageBase64: kf.imageBase64,
    changeType: kf.changeType,
  }));

  const result = await window.electronAPI!.invoke('ai_session_analyze', {
    keyframes: kfPayload,
    audioSegments: [],
    duration: keyframes.length > 0
      ? (keyframes[keyframes.length - 1].timestamp - keyframes[0].timestamp) / 1000
      : 0,
    mode: 'partial',
    language: options?.language,
    authToken: session?.access_token,
  }) as { content: string };

  return result.content;
}

// ================================================================
// 片段笔记合并（课后整理）
// ================================================================

/**
 * 将多个增量分析片段合并为完整结构化笔记（纯文本，无图片，极快）
 */
export async function mergeNotes(
  partials: string[],
  options?: { duration?: number; language?: string; sessionId?: string },
): Promise<AnalyzeResult> {
  const { data: { session } } = await supabase.auth.getSession();

  const result = await window.electronAPI!.invoke('ai_merge_notes', {
    partials,
    duration: options?.duration ?? 0,
    language: options?.language ?? 'zh-CN',
    authToken: session?.access_token,
  }) as { content: string; modelUsed: string; source: string };

  const analyzeResult: AnalyzeResult = {
    content: result.content,
    keyframesAnalyzed: 0,
    modelUsed: result.modelUsed,
    source: result.source as 'local' | 'remote' | undefined,
  };

  // 自动持久化
  try {
    await classroomNoteStore.create({
      // 优先使用真实采集 sessionId（供关键帧图片目录关联清理），缺省时保持随机 UUID
      sessionId: options?.sessionId ?? crypto.randomUUID(),
      title: `课堂笔记 ${new Date().toLocaleString('zh-CN')}`,
      content: analyzeResult.content,
      keyframesAnalyzed: 0,
      modelUsed: analyzeResult.modelUsed,
      sourceType: 'smart',
      duration: options?.duration ?? 0,
    });
  } catch (e) {
    console.warn('[sessionAnalyzer] 合并笔记持久化失败:', e);
  }

  return analyzeResult;
}

// ================================================================
// Path C 视频分析函数
// ================================================================

/**
 * 上传录制视频到主进程进行多模态分析，生成结构化课堂笔记
 * @ai-context Path C 全程录制结束后通过 IPC ai_video_analyze 调用，超时由主进程控制
 */
export async function analyzeVideo(
  filePath: string,
  options?: { duration?: number; language?: string },
): Promise<AnalyzeResult> {
  // 鉴权获取
  const { data: { session } } = await supabase.auth.getSession();

  const result = await window.electronAPI!.invoke('ai_video_analyze', {
    filePath,
    duration: options?.duration,
    language: options?.language,
    authToken: session?.access_token,
  }) as { content: string; keyframesAnalyzed: number; modelUsed: string; source: string; requestId?: string };

  const analyzeResult: AnalyzeResult = {
    content: result.content,
    keyframesAnalyzed: result.keyframesAnalyzed,
    modelUsed: result.modelUsed,
    source: result.source as 'local' | 'remote' | undefined,
  };

  // 自动持久化分析结果
  try {
    await classroomNoteStore.create({
      sessionId: crypto.randomUUID(),
      title: `视频笔记 ${new Date().toLocaleString('zh-CN')}`,
      content: analyzeResult.content,
      keyframesAnalyzed: analyzeResult.keyframesAnalyzed,
      modelUsed: analyzeResult.modelUsed,
      sourceType: 'video',
      duration: options?.duration ?? 0,
    });
  } catch (e) {
    console.warn('[sessionAnalyzer] 视频笔记持久化失败:', e);
  }

  return analyzeResult;
}
