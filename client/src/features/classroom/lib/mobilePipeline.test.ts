/**
 * 课堂助手移动端流水线单元测试
 *
 * @ai-context: 覆盖核心编排逻辑：分片转写「本地优先 → 云端降级」顺序、
 * 结构化持久化、闪卡生成、会话问答请求构造。EntropyCapture 原生插件与
 * AI 网关均 mock，聚焦纯逻辑分支。
 * @ai-context EN: unit tests for the mobile classroom pipeline — local-first
 * transcription with cloud fallback, structuring, flashcards and QA.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock 原生插件与网关 ──────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  asrTranscribeFile: vi.fn(),
  extractAudio: vi.fn(),
  pickVideo: vi.fn(),
  getVideoMetadata: vi.fn(),
  post: vi.fn(),
  summarize: vi.fn(),
  flashcards: vi.fn(),
  classroomCreate: vi.fn(),
  createDeck: vi.fn(),
  createCard: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock('@/lib/capacitor/entropyCapture', () => ({
  EntropyCapture: {
    pickVideo: mocks.pickVideo,
    getVideoMetadata: mocks.getVideoMetadata,
    extractAudio: mocks.extractAudio,
    asrTranscribeFile: mocks.asrTranscribeFile,
  },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { readFile: mocks.readFile },
}));

vi.mock('@/lib/http/apiClient', () => ({
  aiClient: { post: mocks.post },
}));

vi.mock('@/lib/ai/remoteContentFeatures', () => ({
  httpSummarizeNote: mocks.summarize,
  httpGenerateFlashcards: mocks.flashcards,
}));

vi.mock('@/lib/storage/classroomNoteStore', () => ({
  classroomNoteStore: { create: mocks.classroomCreate },
}));

vi.mock('@/features/flashcards/store/useFlashcardStore', () => ({
  useFlashcardStore: {
    getState: () => ({
      createDeck: mocks.createDeck,
      createCard: mocks.createCard,
    }),
  },
}));

import {
  transcribeChunkLocalFirst,
  runVideoImportPipeline,
  generateFlashcardsFromTranscript,
  askSessionQuestion,
  MAX_VIDEO_MS,
} from './mobilePipeline';

describe('transcribeChunkLocalFirst（本地优先 → 云端降级）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('本地 ASR 成功时直接返回 local，不触碰云端', async () => {
    mocks.asrTranscribeFile.mockResolvedValue({ text: '本地转写文本' });
    const result = await transcribeChunkLocalFirst('/data/asr/chunk-0.wav');
    expect(result).toEqual({ text: '本地转写文本', source: 'local' });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('本地失败且云端成功时返回 cloud', async () => {
    mocks.asrTranscribeFile.mockRejectedValue(new Error('模型加载失败'));
    mocks.readFile.mockResolvedValue({ data: 'QUJDRA==' });
    mocks.post.mockResolvedValue({ text: '云端转写文本' });
    const result = await transcribeChunkLocalFirst('/data/asr/chunk-0.wav');
    expect(result).toEqual({ text: '云端转写文本', source: 'cloud' });
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/asr/transcribe',
      expect.objectContaining({ language: 'zh', sample_rate: 16000 }),
      expect.anything(),
    );
  });

  it('本地为空且云端为空时抛出明确错误', async () => {
    mocks.asrTranscribeFile.mockResolvedValue({ text: '  ' });
    mocks.readFile.mockResolvedValue({ data: 'QUJDRA==' });
    mocks.post.mockResolvedValue({ text: '' });
    await expect(transcribeChunkLocalFirst('/x.wav')).rejects.toThrow('本地与云端转写均失败');
  });
});

describe('runVideoImportPipeline（导入 → 抽音频 → 转写 → 结构化）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('超过 60 分钟上限直接拒绝', async () => {
    mocks.pickVideo.mockResolvedValue({ path: '/data/video.mp4', name: 'v.mp4', size: 1 });
    mocks.getVideoMetadata.mockResolvedValue({ durationMs: MAX_VIDEO_MS + 1, width: 0, height: 0 });
    await expect(runVideoImportPipeline(() => {})).rejects.toThrow('上限');
    expect(mocks.extractAudio).not.toHaveBeenCalled();
  });

  it('用户取消选择时静默回到 idle', async () => {
    mocks.pickVideo.mockResolvedValue(null);
    await expect(runVideoImportPipeline(() => {})).rejects.toThrow('已取消');
  });

  it('全流程：分片转写拼接 → summarize → 持久化，并回调完整转写', async () => {
    mocks.pickVideo.mockResolvedValue({ path: '/data/video.mp4', name: 'v.mp4', size: 1 });
    mocks.getVideoMetadata.mockResolvedValue({ durationMs: 120_000, width: 0, height: 0 });
    mocks.extractAudio.mockResolvedValue({ chunks: ['/c0.wav', '/c1.wav'] });
    mocks.asrTranscribeFile
      .mockResolvedValueOnce({ text: '第一段' })
      .mockResolvedValueOnce({ text: '第二段' });
    mocks.summarize.mockResolvedValue({ summary: '知识笔记摘要', keyPoints: [], generatedAt: new Date(), model: 'm', tokensUsed: 1, latencyMs: 1 });
    mocks.classroomCreate.mockResolvedValue('note-1');

    const progress: string[] = [];
    const transcripts: string[] = [];
    const result = await runVideoImportPipeline(
      (p) => progress.push(p.stage),
      (t) => transcripts.push(t),
    );

    expect(result.content).toBe('知识笔记摘要');
    expect(transcripts[0]).toBe('第一段\n第二段');
    expect(mocks.classroomCreate).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'video', duration: 120 }),
    );
    // 进度序列：picking → extracting → transcribing → structuring
    expect(progress).toEqual(['picking', 'extracting', 'transcribing', 'transcribing', 'structuring']);
  });
});

describe('structureAndSave / generateFlashcardsFromTranscript / askSessionQuestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('生成闪卡：建牌组 + 逐卡创建，非法类型回退 basic', async () => {
    mocks.flashcards.mockResolvedValue({
      cards: [
        { front: 'Q1', back: 'A1', type: 'basic', confidence: 0.9 },
        { front: 'Q2', back: 'A2', type: 'weird', confidence: 0.8 },
      ],
      total_extracted: 2,
      model: 'm',
      tokens_used: 1,
    });
    mocks.createDeck.mockResolvedValue('deck-1');
    mocks.createCard.mockResolvedValue('card-1');
    const count = await generateFlashcardsFromTranscript('转写文本');
    expect(count).toBe(2);
    expect(mocks.createCard).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'basic' }));
    expect(mocks.createCard).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'basic' }));
  });

  it('会话问答：转写超 8000 字截断后提交', async () => {
    mocks.post.mockResolvedValue({ answer: '答案是 X', references: [{ time: '00:01', text: '…' }] });
    const longTranscript = 'a'.repeat(10_000);
    const result = await askSessionQuestion(longTranscript, '核心概念？');
    expect(result.answer).toBe('答案是 X');
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/ai/session-qa',
      expect.objectContaining({ question: '核心概念？', transcript: 'a'.repeat(8000) }),
      expect.anything(),
    );
  });
});
