import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock: isElectron ──
const { mockIsElectron } = vi.hoisted(() => ({ mockIsElectron: vi.fn().mockReturnValue(false) }));
vi.mock('../utils/platform', () => ({
  isElectron: mockIsElectron,
}));

// ── Mock: aiClient (RemoteAIPlugin 使用) ──
const { mockAiPost } = vi.hoisted(() => ({ mockAiPost: vi.fn() }));
vi.mock('../http/apiClient', () => ({
  aiClient: { post: mockAiPost },
}));

// ── Mock: supabaseClient (ElectronAIPlugin 使用) ──
vi.mock('../auth/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}));

// 每次测试重新 import 以获取新的 loader 实例
// 由于 AIPluginLoader 是单例，我们在测试中直接操作内部状态
import { aiPluginLoader } from './AIPluginLoader';
import { AIError } from './types';

beforeEach(() => {
  vi.clearAllMocks();
  mockIsElectron.mockReturnValue(false);
  // 重置 loader 内部缓存，确保每个测试独立
  (aiPluginLoader as any).remotePlugin = null;
  (aiPluginLoader as any).electronPlugin = null;
});

describe('AIPluginLoader', () => {
  // ── 插件选择 ──────────────────────────────────────────────
  describe('getAIPlugin()', () => {
    it('should return RemoteAIPlugin when not in Electron', async () => {
      mockIsElectron.mockReturnValue(false);
      const plugin = await aiPluginLoader.getAIPlugin();
      expect(plugin.constructor.name).toBe('RemoteAIPlugin');
    });

    it('should return ElectronAIPlugin when in Electron', async () => {
      mockIsElectron.mockReturnValue(true);
      const plugin = await aiPluginLoader.getAIPlugin();
      expect(plugin.constructor.name).toBe('ElectronAIPlugin');
    });
  });

  // ── summarizeNote (使用 RemoteAIPlugin) ────────────────────
  describe('summarizeNote()', () => {
    it('should call remote plugin with valid text and return snake_case → camelCase result', async () => {
      mockIsElectron.mockReturnValue(false);
      // 后端 SummarizeResponse: summary, model, tokens_used, latency_ms
      mockAiPost.mockResolvedValueOnce({
        summary: '这是一段由 AI 生成的笔记摘要内容',
        model: 'qwen-plus',
        tokens_used: 256,
        latency_ms: 1200,
      });

      const text = '这是一段足够长的笔记内容，用于测试摘要功能的完整流程，包含多个关键知识点和重要概念。';
      const result = await aiPluginLoader.summarizeNote(text);

      expect(mockAiPost).toHaveBeenCalledWith('/api/v1/ai/summarize', {
        text,
        options: {},
      });
      expect(result.summary).toBe('这是一段由 AI 生成的笔记摘要内容');
      expect(result.model).toBe('qwen-plus');
      expect(result.tokensUsed).toBe(256);
      expect(result.latencyMs).toBe(1200);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should pass maxLength option as max_length to backend', async () => {
      mockIsElectron.mockReturnValue(false);
      mockAiPost.mockResolvedValueOnce({
        summary: '摘要内容',
        model: 'qwen-plus',
        tokens_used: 100,
        latency_ms: 800,
      });

      await aiPluginLoader.summarizeNote('这是一段足够长的笔记内容用于测试选项传递', {
        maxLength: 300,
        style: 'paragraph',
        language: 'zh',
      });

      expect(mockAiPost).toHaveBeenCalledWith('/api/v1/ai/summarize', {
        text: '这是一段足够长的笔记内容用于测试选项传递',
        options: { max_length: 300, style: 'paragraph', language: 'zh' },
      });
    });
  });

  // ── evaluateExplanation (使用 RemoteAIPlugin) ──────────────
  describe('evaluateExplanation()', () => {
    it('should call remote plugin and return 0-10 score with weaknesses mapped', async () => {
      mockIsElectron.mockReturnValue(false);
      // 后端 EvaluationResult: overall_score(0-10), dimensions, strengths, improvements, encouragement
      mockAiPost.mockResolvedValueOnce({
        overall_score: 7.5,
        dimensions: [
          { dimension: '准确性', score: 8.0, feedback: '概念解释基本准确' },
          { dimension: '完整性', score: 6.5, feedback: '缺少部分关键细节' },
          { dimension: '简洁性', score: 7.0, feedback: '表达较为简洁' },
          { dimension: '通俗性', score: 8.5, feedback: '用通俗易懂的语言解释' },
        ],
        strengths: ['语言通俗易懂', '核心概念把握准确'],
        improvements: ['可以增加实际案例辅助说明', '建议补充关键公式推导过程'],
        encouragement: '你的费曼解释已经很不错了，继续加油！',
        model: 'deepseek-chat',
        tokens_used: 512,
        latency_ms: 2500,
      });

      const concept = '光电效应';
      const explanation = '光电效应是指当光照射到金属表面时，金属中的电子吸收光子能量后逸出金属表面的现象。这是量子力学的重要实验基础之一。';
      const result = await aiPluginLoader.evaluateExplanation(concept, explanation);

      expect(mockAiPost).toHaveBeenCalledWith('/api/v1/ai/evaluate-explanation', {
        concept,
        explanation,
      });
      // 验证 0-10 评分直接透传（<=10 不触发归一化）
      expect(result.overallScore).toBe(7.5);
      // 验证维度映射 snake_case → camelCase
      expect(result.dimensions).toHaveLength(4);
      expect(result.dimensions[0]).toEqual({ name: '准确性', score: 8.0, feedback: '概念解释基本准确' });
      // 验证 strengths
      expect(result.strengths).toEqual(['语言通俗易懂', '核心概念把握准确']);
      // 验证 weaknesses = improvements（Task #16 修复）
      expect(result.weaknesses).toEqual(['可以增加实际案例辅助说明', '建议补充关键公式推导过程']);
      // 验证 suggestions = improvements
      expect(result.suggestions).toEqual(['可以增加实际案例辅助说明', '建议补充关键公式推导过程']);
      // 验证其他字段
      expect(result.encouragement).toBe('你的费曼解释已经很不错了，继续加油！');
      expect(result.model).toBe('deepseek-chat');
      expect(result.tokensUsed).toBe(512);
      expect(result.latencyMs).toBe(2500);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should normalize 0-100 overall_score to 0-10 range', async () => {
      mockIsElectron.mockReturnValue(false);
      mockAiPost.mockResolvedValueOnce({
        overall_score: 85,
        dimensions: [],
        strengths: [],
        improvements: [],
        encouragement: '',
        model: 'deepseek-chat',
        tokens_used: 100,
        latency_ms: 500,
      });

      const result = await aiPluginLoader.evaluateExplanation(
        '熵',
        '熵是热力学中描述系统无序程度的物理量，系统越混乱熵值越大，这是热力学第二定律的核心概念。',
      );
      expect(result.overallScore).toBe(8.5);
    });
  });

  // ── recommendDuration (使用 RemoteAIPlugin) ────────────────
  describe('recommendDuration()', () => {
    it('should call remote plugin and return snake_case → camelCase result', async () => {
      mockIsElectron.mockReturnValue(false);
      // 后端 DurationConfig: recommended_minutes, break_minutes, reason, source, model, tokens_used, latency_ms
      mockAiPost.mockResolvedValueOnce({
        recommended_minutes: 30,
        break_minutes: 5,
        reason: '基于您近期专注记录分析，您的平均专注时长约 28 分钟，建议适当增加',
        source: 'ai',
        model: 'deepseek-chat',
        tokens_used: 200,
        latency_ms: 1500,
      });

      const historyData = {
        sessions: [
          { duration: 25, completed: true, date: '2024-06-01', subject: '数学' },
          { duration: 30, completed: true, date: '2024-06-02', subject: '物理' },
          { duration: 20, completed: false, date: '2024-06-03', subject: '化学' },
        ],
      };
      const result = await aiPluginLoader.recommendDuration(historyData);

      // 验证请求体：camelCase → snake_case 转换
      expect(mockAiPost).toHaveBeenCalledWith('/api/v1/ai/recommend-duration', {
        history: [
          { duration_minutes: 25, completed: true, subject: '数学', timestamp: '2024-06-01' },
          { duration_minutes: 30, completed: true, subject: '物理', timestamp: '2024-06-02' },
          { duration_minutes: 20, completed: false, subject: '化学', timestamp: '2024-06-03' },
        ],
      });
      // 验证响应映射
      expect(result.recommendedDuration).toBe(30);
      expect(result.breakMinutes).toBe(5);
      expect(result.reasoning).toContain('专注记录');
      expect(result.source).toBe('ai');
      expect(result.isLocalFallback).toBe(false);
      expect(result.model).toBe('deepseek-chat');
      expect(result.tokensUsed).toBe(200);
      expect(result.latencyMs).toBe(1500);
    });

    it('should fallback to LocalDurationRecommender when remote fails', async () => {
      mockIsElectron.mockReturnValue(false);
      mockAiPost.mockRejectedValueOnce(new Error('HTTP 503 Service Unavailable'));

      const historyData = {
        sessions: [
          { duration: 25, completed: true, date: '2024-06-01' },
          { duration: 30, completed: true, date: '2024-06-02' },
        ],
      };
      const result = await aiPluginLoader.recommendDuration(historyData);

      // 本地降级结果
      expect(result.isLocalFallback).toBe(true);
      expect(result.recommendedDuration).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();
    });

    it('should fallback with empty sessions and return default 25 min', async () => {
      mockIsElectron.mockReturnValue(false);
      mockAiPost.mockRejectedValueOnce(new Error('timeout'));

      const result = await aiPluginLoader.recommendDuration({ sessions: [] });

      expect(result.isLocalFallback).toBe(true);
      expect(result.recommendedDuration).toBe(25);
      expect(result.confidence).toBe('low');
    });
  });

  // ── 错误处理透传 ──────────────────────────────────────────
  describe('error handling', () => {
    it('should propagate AIError from RemoteAIPlugin for non-duration endpoints', async () => {
      mockIsElectron.mockReturnValue(false);
      mockAiPost.mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'));

      try {
        await aiPluginLoader.summarizeNote('这是一段足够长的笔记内容用于测试错误处理逻辑');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AIError);
        expect(e.code).toBe('rate_limit');
        expect(e.retryable).toBe(true);
      }
    });
  });

  // ── withGuard: 离线检查 ────────────────────────────────────────────────────
  describe('withGuard - offline check', () => {
    afterEach(() => {
      // 恢复在线状态
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('should block summarizeNote when offline and throw AIError(offline)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      mockIsElectron.mockReturnValue(false);

      try {
        await aiPluginLoader.summarizeNote('这是一段足够长的笔记内容用于测试离线状态');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AIError);
        expect(e.code).toBe('offline');
        expect(e.retryable).toBe(false);
      }
      // 确保远程插件未被调用
      expect(mockAiPost).not.toHaveBeenCalled();
    });

    it('should block evaluateExplanation when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      mockIsElectron.mockReturnValue(false);

      try {
        await aiPluginLoader.evaluateExplanation('概念', '这是一段足够长的解释内容用于测试');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AIError);
        expect(e.code).toBe('offline');
      }
      expect(mockAiPost).not.toHaveBeenCalled();
    });

    it('should block generateFlashcards when offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      mockIsElectron.mockReturnValue(false);

      try {
        await aiPluginLoader.generateFlashcards('这是一段足够长的笔记内容用于离线测试');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AIError);
        expect(e.code).toBe('offline');
      }
      expect(mockAiPost).not.toHaveBeenCalled();
    });

    it('should block recommendDuration when offline (no local fallback)', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      mockIsElectron.mockReturnValue(false);

      try {
        await aiPluginLoader.recommendDuration({ sessions: [] });
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AIError);
        expect(e.code).toBe('offline');
      }
      expect(mockAiPost).not.toHaveBeenCalled();
    });
  });

  // ── withGuard: 内容长度检查 ─────────────────────────────────────────────────
  describe('withGuard - content length check', () => {
    it('should block summarizeNote with too short content', async () => {
      mockIsElectron.mockReturnValue(false);

      try {
        await aiPluginLoader.summarizeNote('太短');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AIError);
        expect(e.code).toBe('content_too_short');
        expect(e.retryable).toBe(false);
      }
      expect(mockAiPost).not.toHaveBeenCalled();
    });

    it('should block evaluateExplanation with too short explanation', async () => {
      mockIsElectron.mockReturnValue(false);

      try {
        await aiPluginLoader.evaluateExplanation('熵', '短');
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e).toBeInstanceOf(AIError);
        expect(e.code).toBe('content_too_short');
      }
      expect(mockAiPost).not.toHaveBeenCalled();
    });
  });

  // ── 在线状态正常调用验证 ──────────────────────────────────────────────────────
  describe('online state - normal calls', () => {
    it('should call plugin normally when online (navigator.onLine = true)', async () => {
      // jsdom 默认 navigator.onLine = true
      mockIsElectron.mockReturnValue(false);
      mockAiPost.mockResolvedValueOnce({
        summary: '在线状态摘要结果',
        model: 'glm-4-flash',
        tokens_used: 100,
        latency_ms: 500,
      });

      const result = await aiPluginLoader.summarizeNote('这是一段足够长的笔记内容用于在线状态测试');
      expect(result.summary).toBe('在线状态摘要结果');
      expect(mockAiPost).toHaveBeenCalledTimes(1);
    });

    it('should allow content with exactly 10 characters (boundary)', async () => {
      mockIsElectron.mockReturnValue(false);
      mockAiPost.mockResolvedValueOnce({
        summary: '边界摘要',
        model: 'glm-4-flash',
        tokens_used: 50,
        latency_ms: 300,
      });

      // 10 个字符刚好通过检查
      const result = await aiPluginLoader.summarizeNote('这是一段十个字的内容啊');
      expect(result.summary).toBe('边界摘要');
      expect(mockAiPost).toHaveBeenCalledTimes(1);
    });
  });
});
