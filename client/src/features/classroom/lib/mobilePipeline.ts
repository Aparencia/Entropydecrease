/**
 * 课堂助手移动端流水线：视频知识笔记提取（本地优先 ASR + 云端降级）
 *
 * @ai-context: 对标小布「视频知识笔记提取」。管道：选视频(原生) → 元数据
 * (60 分钟上限) → 抽音频分片(插件 MediaExtractor) → 逐片转写（本地 sherpa
 * 优先，失败降级网关 /api/v1/asr/transcribe）→ AI 结构化（网关 summarize）
 * → 沉淀 classroomNoteStore。录屏路径：原生录屏 + 麦克风流式采集实时字幕，
 * 停止后走同一结构化链路。
 * @ai-context EN: mobile video-knowledge-note pipeline — pick → extract
 * audio chunks → transcribe local-first with cloud fallback → AI structure
 * → persist. Screen-recording path streams mic PCM for realtime subtitles.
 */
import { EntropyCapture } from '@/lib/capacitor/entropyCapture';
import { startMicStream } from '@/lib/capacitor/micStream';
import type { MicStreamHandle } from '@/lib/capacitor/micStream';
import { Filesystem } from '@capacitor/filesystem';
import { aiClient } from '@/lib/http/apiClient';
import { httpSummarizeNote, httpGenerateFlashcards } from '@/lib/ai/remoteContentFeatures';
import { classroomNoteStore } from '@/lib/storage/classroomNoteStore';
import { useFlashcardStore } from '@/features/flashcards/store/useFlashcardStore';
import type { Flashcard } from '@/types/flashcard';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';

/** 视频时长上限（毫秒） */
export const MAX_VIDEO_MS = 60 * 60 * 1000;

export type PipelineStage =
  | 'idle' | 'picking' | 'extracting' | 'transcribing' | 'structuring'
  | 'recording' | 'done' | 'error';

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  current?: number;
  total?: number;
  transcript?: string;
}

/** 读取应用私有目录 WAV 为 base64（云端降级转写用） */
async function wavToBase64(wavPath: string): Promise<string> {
  const read = await Filesystem.readFile({ path: wavPath });
  if (typeof read.data === 'string' && read.data.length > 0) return read.data;
  throw new Error('无法读取音频分片');
}

/**
 * 单分片转写：本地 sherpa 优先，失败降级云端
 * @returns 转写文本与来源（local/cloud）
 */
export async function transcribeChunkLocalFirst(
  wavPath: string,
): Promise<{ text: string; source: 'local' | 'cloud' }> {
  let localError: unknown;
  try {
    const { text } = await EntropyCapture.asrTranscribeFile({ path: wavPath });
    if (text && text.trim()) return { text: text.trim(), source: 'local' };
    localError = new Error('本地转写结果为空');
  } catch (e) {
    localError = e;
  }
  // 云端降级：base64 → 网关 /api/v1/asr/transcribe
  try {
    const base64 = await wavToBase64(wavPath);
    const data = await aiClient.post<{ text: string }>(
      '/api/v1/asr/transcribe',
      { audio_base64: base64, language: 'zh', sample_rate: 16000, channels: 1 },
      { timeout: 120_000 },
    );
    if (data.text && data.text.trim()) return { text: data.text.trim(), source: 'cloud' };
    throw new Error('云端转写结果为空');
  } catch {
    const reason = localError instanceof Error ? localError.message : String(localError);
    throw new Error(`本地与云端转写均失败（本地: ${reason}）`);
  }
}

/**
 * 从转写文本一键生成间隔重复闪卡（新牌组），返回生成的卡片数
 * 复用网关 /api/v1/ai/generate-cards 与现有闪卡 store（本地优先持久化）
 */
export async function generateFlashcardsFromTranscript(
  transcript: string,
): Promise<number> {
  const { cards } = await httpGenerateFlashcards(transcript, { count: 8 });
  const store = useFlashcardStore.getState();
  const deckId = await store.createDeck(
    `视频知识闪卡 ${new Date().toLocaleString('zh-CN')}`,
    '由视频知识笔记自动生成',
    undefined,
  );
  let added = 0;
  for (const c of cards) {
    if (!c.front || !c.back) continue;
    const type: Flashcard['type'] =
      c.type === 'cloze' || c.type === 'multi_choice' ? c.type : 'basic';
    await store.createCard({ deckId, front: c.front, back: c.back, type });
    added++;
  }
  return added;
}

export interface SessionQaAnswer {
  answer: string;
  references: Array<{ time: string; text: string }>;
}

/**
 * 基于课堂转写的问答（复用网关 /api/v1/ai/session-qa，带引用来源）
 * 转写超长时客户端截断到 8000 字（网关上限）
 */
export async function askSessionQuestion(
  transcript: string,
  question: string,
): Promise<SessionQaAnswer> {
  const data = await aiClient.post<SessionQaAnswer>(
    '/api/v1/ai/session-qa',
    {
      question,
      transcript: transcript.slice(0, 8000),
    },
    { timeout: 90_000 },
  );
  return { answer: data.answer, references: data.references ?? [] };
}

/**
 * 从转写文本生成知识笔记并持久化（复用网关 summarize + classroomNoteStore）
 */
export async function structureAndSave(
  transcript: string,
  durationSec: number,
  sourceType: 'video' | 'smart' = 'video',
): Promise<AnalyzeResult> {
  const summary = await httpSummarizeNote(transcript);
  const content = summary.summary || transcript;
  try {
    await classroomNoteStore.create({
      sessionId: crypto.randomUUID(),
      title: `视频知识笔记 ${new Date().toLocaleString('zh-CN')}`,
      content,
      keyframesAnalyzed: 0,
      modelUsed: 'local-asr+gateway',
      sourceType,
      duration: durationSec,
    });
  } catch (e) {
    console.warn('[mobilePipeline] 笔记持久化失败', e);
  }
  return { content, keyframesAnalyzed: 0, modelUsed: 'local-asr+gateway', source: 'remote' };
}

/**
 * 相册/相机视频导入流水线：pick → 60min 校验 → 抽音频 → 逐片转写 → 结构化
 * @param onProgress 阶段进度回调
 * @param onTranscript 完整转写文本回调（供 UI 展示/问答/闪卡）
 */
export async function runVideoImportPipeline(
  onProgress: (p: PipelineProgress) => void,
  onTranscript?: (text: string) => void,
): Promise<AnalyzeResult> {
  onProgress({ stage: 'picking', message: '选择视频…' });
  const picked = await EntropyCapture.pickVideo();
  if (!picked) {
    onProgress({ stage: 'idle', message: '已取消选择' });
    throw new Error('已取消');
  }

  const meta = await EntropyCapture.getVideoMetadata({ path: picked.path });
  if (meta.durationMs > MAX_VIDEO_MS) {
    throw new Error(`视频超过 ${MAX_VIDEO_MS / 60000} 分钟上限，请分段导入`);
  }

  onProgress({ stage: 'extracting', message: '抽取音频并分片…' });
  const { chunks } = await EntropyCapture.extractAudio({
    path: picked.path,
    segmentSeconds: 600,
    sampleRate: 16000,
  });
  if (chunks.length === 0) throw new Error('未抽取到有效音频');

  const parts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    onProgress({
      stage: 'transcribing',
      message: `转写中 ${i + 1}/${chunks.length}`,
      current: i + 1,
      total: chunks.length,
    });
    const { text } = await transcribeChunkLocalFirst(chunks[i]);
    if (text) parts.push(text);
  }
  const transcript = parts.join('\n');
  if (!transcript.trim()) throw new Error('未识别到有效语音内容');
  onTranscript?.(transcript);

  onProgress({ stage: 'structuring', message: '生成知识笔记…' });
  return structureAndSave(transcript, Math.round(meta.durationMs / 1000), 'video');
}

export interface RecordingFlowHandle {
  stop: () => Promise<{ text: string; videoPath: string }>;
}

/**
 * 录屏采集（小布式边看边录）：
 * 原生录屏（画面+麦克风）+ WebView 麦克风流式采集 → 本地 ASR 实时字幕
 * 停止后返回最终转写文本（由调用方走 structureAndSave）
 */
export async function runRecordingFlow(
  onProgress: (p: PipelineProgress) => void,
  onSubtitle: (text: string) => void,
): Promise<RecordingFlowHandle> {
  onProgress({ stage: 'recording', message: '准备录屏…' });
  await EntropyCapture.initAsr();
  const started = await EntropyCapture.startScreenRecording();
  if (!started.started) throw new Error('录屏未开始（权限被拒绝？）');

  await EntropyCapture.asrStart();
  let mic: MicStreamHandle | null = null;
  try {
    mic = await startMicStream((samples) => {
      void EntropyCapture.asrFeedPcm({ samples: Array.from(samples), sampleRate: 16000 })
        .then((r) => {
          if (r.partial) onSubtitle(r.partial);
        })
        .catch(() => { /* 字幕失败不阻塞录制 */ });
    });
  } catch (e) {
    console.warn('[mobilePipeline] 麦克风采集不可用，仅录画面', e);
  }
  onProgress({ stage: 'recording', message: '录制中（画面 + 麦克风）· 实时字幕已开启' });

  return {
    stop: async () => {
      const rec = await EntropyCapture.stopScreenRecording();
      mic?.stop();
      const { text } = await EntropyCapture.asrStop();
      return { text: text ?? '', videoPath: rec.filePath };
    },
  };
}
