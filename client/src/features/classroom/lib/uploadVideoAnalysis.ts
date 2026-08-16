/**
 * 浏览器端视频上传分析（PWA 视频转笔记主力通道）
 *
 * @ai-context: 移动端 PWA 的"视频 → AI 笔记"链路（Spec §3.2）：文件选择 →
 * fetch multipart 上传到网关 `/api/v1/multimodal/analyze-video`（Gemini 原生
 * 视频 → Qwen-VL 抽帧降级，300s 超时）→ 结果持久化 classroomNoteStore。
 * 桌面端（Electron）走 IPC ai_video_analyze（主进程读文件），本函数仅供
 * PWA/浏览器环境直接上传 File 对象。附抖音链接检测：粘贴分享链接时引导
 * 用户"保存到相册再导入"（方案 A，不做服务端自动解析）。
 * @ai-context EN: mobile PWA video→note pipeline — file picker → multipart
 * upload to gateway analyze-video (Gemini native video with Qwen-VL frame
 * fallback, 300s timeout) → persist via classroomNoteStore. Desktop uses the
 * IPC ai_video_analyze path; this function only serves PWA/browser File upload.
 * Includes Douyin link detection to guide "save to album then import" (plan A).
 */
import { aiClient } from '@/lib/http/apiClient';
import { classroomNoteStore } from '@/lib/storage/classroomNoteStore';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';

/** 抖音分享链接域名（v.douyin.com 短链 + www.douyin.com 长链） */
const DOUYIN_HOST_RE = /(^|\.)douyin\.com$/;

/** 判断 URL 是否为抖音分享链接（用于粘贴框引导） */
export function isDouyinUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return DOUYIN_HOST_RE.test(host);
  } catch {
    return false;
  }
}

/**
 * 上传视频文件到网关做多模态分析并持久化笔记
 * @param file - 用户选择的视频文件（手机录屏/网课下载/抖音保存的视频）
 * @param options - 可选时长（秒）与语言
 */
export async function analyzeVideoFile(
  file: File,
  options?: { duration?: number; language?: string },
): Promise<AnalyzeResult> {
  const formData = new FormData();
  formData.append('video_file', file, file.name);
  if (options?.duration !== undefined) formData.append('duration', String(options.duration));
  if (options?.language) formData.append('language', options.language);

  // 复用 aiClient.post：自动注入 Authorization + 401 刷新 + 429 配额提示（TD-006）
  const data = await aiClient.post<{
    content: string;
    keyframes_analyzed: number;
    model_used: string;
  }>('/api/v1/multimodal/analyze-video', formData, { timeout: 300000 });

  const analyzeResult: AnalyzeResult = {
    content: data.content,
    keyframesAnalyzed: data.keyframes_analyzed,
    modelUsed: data.model_used,
    source: 'remote',
  };

  // 自动持久化（Dexie，PWA/Electron 通用）
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
    console.warn('[uploadVideoAnalysis] 视频笔记持久化失败:', e);
  }

  return analyzeResult;
}
