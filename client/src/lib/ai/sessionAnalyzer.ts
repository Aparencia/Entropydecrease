/**
 * 智能模式课后分析客户端
 * 将 SessionBundle 发送到多模态分析端点，获取结构化课堂笔记
 */

import { supabase } from '@/lib/auth/supabaseClient';
import { getActiveUserKey } from '@/lib/ai/apiKeyManager';
import { classroomNoteStore } from '@/lib/storage/classroomNoteStore';
import type { SessionBundle, KeyFrame } from '@/lib/capture/captureTypes';

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
// 分析函数
// ================================================================

/**
 * 将智能模式采集的 SessionBundle 通过 IPC 发送到主进程进行多模态分析
 * @ai-context 通过 IPC ai_session_analyze 调用主进程 handler，超时由主进程控制
 */
export async function analyzeSession(
  bundle: SessionBundle,
  options?: { language?: string },
): Promise<AnalyzeResult> {
  // 鉴权获取
  const { data: { session } } = await supabase.auth.getSession();
  const userKey = getActiveUserKey();

  // 构造 IPC 参数（camelCase，ms → s）
  const keyframes = bundle.keyframes.map((kf) => ({
    timestamp: kf.timestamp / 1000,
    imageBase64: kf.imageBase64,
    changeType: kf.changeType,
  }));
  const audioSegments = bundle.audioSegments.map((seg) => ({
    timestampStart: seg.timestampStart / 1000,
    timestampEnd: seg.timestampEnd / 1000,
    audioText: null,
  }));

  const result = await window.electronAPI!.invoke('ai_session_analyze', {
    keyframes,
    audioSegments,
    duration: bundle.duration / 1000,
    language: options?.language,
    authToken: session?.access_token,
    userApiKey: userKey,
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
 */
export async function analyzePartial(
  keyframes: KeyFrame[],
  options?: { language?: string },
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const userKey = getActiveUserKey();

  const kfPayload = keyframes.map((kf) => ({
    timestamp: kf.timestamp / 1000,
    imageBase64: kf.imageBase64,
    changeType: kf.changeType,
  }));

  const result = await window.electronAPI!.invoke('ai_session_analyze', {
    keyframes: kfPayload,
    audioSegments: [],
    duration: keyframes.length > 0
      ? (keyframes[keyframes.length - 1].timestamp - keyframes[0].timestamp) / 1000
      : 0,
    language: options?.language,
    authToken: session?.access_token,
    userApiKey: userKey,
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
  options?: { duration?: number; language?: string },
): Promise<AnalyzeResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const userKey = getActiveUserKey();

  const result = await window.electronAPI!.invoke('ai_merge_notes', {
    partials,
    duration: options?.duration ?? 0,
    language: options?.language ?? 'zh-CN',
    authToken: session?.access_token,
    userApiKey: userKey,
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
      sessionId: crypto.randomUUID(),
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
  const userKey = getActiveUserKey();

  const result = await window.electronAPI!.invoke('ai_video_analyze', {
    filePath,
    duration: options?.duration,
    language: options?.language,
    authToken: session?.access_token,
    userApiKey: userKey,
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
