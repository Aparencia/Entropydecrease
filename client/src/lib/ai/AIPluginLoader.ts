/**
 * AI 插件加载器（单例门面）
 *
 * @ai-context: 2026-07 拆分——守卫在 aiGuards、插件获取/鉴权注入在
 * aiPluginProvider；本类保留全部公共方法签名（测试与 hooks 依赖），
 * 内部用 call/stream 两个泛型包装消除了原 350+ 行同构样板。
 * @ai-context: 错误文案与错误码被 UI 与测试断言依赖，禁止改动；
 * 非流式能力缺失 retryable=false，流式能力缺失 retryable=true（原语义）。
 * @ai-context: recommendDuration 是唯一带本地降级的功能（远程失败 →
 * LocalDurationRecommender 规则引擎）；extractScreenContent 刻意不做
 * 离线守卫（历史行为，Electron 本地视觉可离线用）。
 */
import { LocalDurationRecommender } from './LocalFallback';
import { AIError } from './ai-errors';
import { ensureOnline, ensureMinLength } from './aiGuards';
import { getRemotePlugin, getElectronPlugin } from './aiPluginProvider';
import { offlineAIQueue } from './offlineAIQueue';
import { isElectron } from '../utils/platform';
import type { AIPlugin, DurationHistoryData, DurationOptions, DurationResult,
  SummarizeResult, FlashcardResult, EvaluateResult,
  SummarizeOptions, FlashcardOptions, EvaluateOptions,
  VisionExtractResult, TagContentResult, OptimizeCardResult,
  FeynmanQuestionResult, FeynmanAnswerEvalResult, SortResult,
  AnchorPoint, BrainstormIdea, ChatMessage, SocraticEvaluateResult, SocraticDeepeningResult, SocraticMirrorResult,
  PredictionPrompt, RescueContext, ResourceLink,
  ErrorPatternResult, QuizGenResult,
  ContentTierResult, ConflictDetectResult, ConceptPrecheckResult } from './types';

class AIPluginLoader {
  private localRecommender: LocalDurationRecommender;

  constructor() {
    this.localRecommender = new LocalDurationRecommender();
  }

  /** 获取远程 AI 插件实例（委托 aiPluginProvider，保留旧 API） */
  getRemotePlugin() { return getRemotePlugin(); }

  /** 获取 Electron AI 插件实例（委托 aiPluginProvider，保留旧 API） */
  async getElectronPlugin() { return getElectronPlugin(); }

  /** 根据运行环境获取 AI 插件实例（内部委托本类两个环境方法，统一调用链） */
  async getAIPlugin(): Promise<AIPlugin> {
    if (isElectron()) return await this.getElectronPlugin();
    return this.getRemotePlugin();
  }

  /**
   * 统一非流式调用包装：守卫 → 取插件 → 能力检查 → 调用
   * invoke 返回 undefined 表示当前插件未实现该可选能力
   * @ai-context P2-11：opts.offline 提供离线入队描述（feature/endpoint/payload）时，
   * 离线不再单纯报错，而是 fire-and-forget 入队（联网后自动重放）后再抛 offline 提示。
   */
  private async call<T>(
    invoke: (plugin: AIPlugin) => Promise<T> | undefined,
    opts: { contentCheck?: string; unsupportedMsg: string; minLength?: number; offline?: { feature: string; endpoint: string; payload: unknown } },
  ): Promise<T> {
    try {
      ensureOnline();
    } catch (err) {
      if (opts.offline && err instanceof AIError && err.code === 'offline') {
        // 离线入队（不阻塞、不报错，联网后自动重放；测试环境无 indexedDB 时静默失败）
        offlineAIQueue.enqueue(opts.offline.feature, opts.offline.endpoint, opts.offline.payload).catch(() => {});
        throw new AIError('当前处于离线状态，请求已加入队列，联网后自动完成', 'offline', false);
      }
      throw err;
    }
    ensureMinLength(opts.contentCheck, opts.minLength);
    const plugin = await this.getAIPlugin();
    const result = invoke(plugin);
    if (result === undefined) {
      throw new AIError(opts.unsupportedMsg, 'service_unavailable', false);
    }
    return result;
  }

  /**
   * 统一流式调用包装：守卫 → 取插件 → 能力检查 → 透传流
   */
  private async *stream(
    getStreamFn: (plugin: AIPlugin) => AsyncIterable<string> | undefined,
    opts: { contentCheck?: string; unsupportedMsg: string; minLength?: number },
  ): AsyncGenerator<string, void, unknown> {
    ensureOnline();
    ensureMinLength(opts.contentCheck, opts.minLength);
    const plugin = await this.getAIPlugin();
    const s = getStreamFn(plugin);
    if (!s) {
      throw new AIError(opts.unsupportedMsg, 'service_unavailable', true);
    }
    yield* s;
  }

  // ── 非流式功能 ─────────────────────────────────────────

  /** 摘要功能（P2-11：离线入队，联网后自动重放） */
  async summarizeNote(content: string, options?: SummarizeOptions): Promise<SummarizeResult> {
    return this.call(p => p.summarizeNote(content, options),
      { contentCheck: content, unsupportedMsg: '当前 AI 插件不支持摘要',
        offline: {
          feature: 'summarize',
          endpoint: '/api/v1/ai/summarize',
          payload: { text: content, options: { max_length: options?.maxLength, style: options?.style, language: options?.language } },
        } });
  }

  /** 闪卡生成 */
  async generateFlashcards(content: string, options?: FlashcardOptions): Promise<FlashcardResult> {
    return this.call(p => p.generateFlashcards(content, options),
      { contentCheck: content, unsupportedMsg: '当前 AI 插件不支持闪卡生成' });
  }

  /** 费曼评估（v0.30: 讲解类阈值 5） */
  async evaluateExplanation(concept: string, explanation: string, options?: EvaluateOptions): Promise<EvaluateResult> {
    return this.call(p => p.evaluateExplanation(concept, explanation, options),
      { contentCheck: explanation, unsupportedMsg: '当前 AI 插件不支持费曼评估', minLength: 5 });
  }

  /**
   * 视觉内容提取 — 委托给已加载的插件（如有实现）
   * 注意：刻意不做离线守卫（Electron 本地视觉可离线使用，历史行为）
   */
  async extractScreenContent(imageBase64: string, language = 'zh'): Promise<VisionExtractResult> {
    const plugin = await this.getAIPlugin();
    if (plugin.extractScreenContent) {
      return plugin.extractScreenContent(imageBase64, language);
    }
    throw new AIError('当前 AI 插件不支持屏幕内容提取', 'service_unavailable', false);
  }

  /** 番茄钟推荐 — 远程优先，失败时自动降级到本地规则引擎 */
  async recommendDuration(historyData: DurationHistoryData, options?: DurationOptions): Promise<DurationResult> {
    ensureOnline();
    try {
      return await (await this.getAIPlugin()).recommendDuration(historyData, options);
    } catch {
      return this.localRecommender.recommend(historyData, options);
    }
  }

  /** 费曼反问 — 生成 1-3 个追问（v0.30: 讲解类阈值 5） */
  async generateFeynmanQuestions(concept: string, explanation: string): Promise<FeynmanQuestionResult> {
    return this.call(p => p.generateFeynmanQuestions(concept, explanation),
      { contentCheck: explanation, unsupportedMsg: '当前 AI 插件不支持费曼反问', minLength: 5 });
  }

  /** 费曼回答评估 — 评估用户对追问的回答 */
  async evaluateFeynmanAnswers(concept: string, questions: string[], answers: string[]): Promise<FeynmanAnswerEvalResult> {
    return this.call(p => p.evaluateFeynmanAnswers(concept, questions, answers),
      { unsupportedMsg: '当前 AI 插件不支持费曼回答评估' });
  }

  /** 内容打标 */
  async tagContent(content: string): Promise<TagContentResult> {
    return this.call(p => p.tagContent?.(content),
      { contentCheck: content, unsupportedMsg: '当前 AI 插件不支持内容打标' });
  }

  /** 闪卡优化（v0.30: 卡片正反面合计阈值 5） */
  async optimizeCard(front: string, back: string): Promise<OptimizeCardResult> {
    return this.call(p => p.optimizeCard?.(front, back),
      { contentCheck: front + back, unsupportedMsg: '当前 AI 插件不支持闪卡优化', minLength: 5 });
  }

  /** 灵感分拣 — AI 分析内容并推荐归类目标 */
  async sortInspiration(content: string, existingTags?: Record<string, string>): Promise<SortResult> {
    return this.call(p => p.sortInspiration?.(content, existingTags),
      { contentCheck: content, unsupportedMsg: '当前 AI 插件不支持灵感分拣' });
  }

  /** 记忆锚点生成 — 从笔记中提取知识锚点 */
  async generateAnchorPoint(noteId: string, content: string): Promise<{ anchorPoints: AnchorPoint[] }> {
    return this.call(p => p.generateAnchorPoint?.(noteId, content),
      { contentCheck: content, unsupportedMsg: '当前 AI 插件不支持锚点生成' });
  }

  /** 苏格拉底式头脑风暴 — 激发创意与联想（v0.30: 主题类非空即可） */
  async socraticBrainstorm(topic: string, context?: string): Promise<{ ideas: BrainstormIdea[] }> {
    return this.call(p => p.socraticBrainstorm?.(topic, context),
      { contentCheck: topic, unsupportedMsg: '当前 AI 插件不支持苏格拉底头脑风暴', minLength: 1 });
  }

  /** 苏格拉底式追问 — 引导深度思考（v0.30: 主题类非空即可） */
  async socraticQuestion(conversationId: string, topic: string, history: ChatMessage[]): Promise<{ question: string; hints: string[] }> {
    return this.call(p => p.socraticQuestion?.(conversationId, topic, history),
      { contentCheck: topic, unsupportedMsg: '当前 AI 插件不支持苏格拉底追问', minLength: 1 });
  }

  /** FEAT-022: 苏格拉底回答评估 — 四维度评分（v0.30: 回答类阈值 5） */
  async socraticEvaluate(topic: string, question: string, answer: string, history: ChatMessage[]): Promise<SocraticEvaluateResult> {
    return this.call(p => p.socraticEvaluate?.(topic, question, answer, history),
      { contentCheck: answer, unsupportedMsg: '当前 AI 插件不支持苏格拉底评估', minLength: 5 });
  }

  /** FEAT-022: 苏格拉底深化角度生成（v0.30: 主题类非空即可） */
  async socraticDeepening(topic: string, dialogueSummary: string, history: ChatMessage[]): Promise<SocraticDeepeningResult> {
    return this.call(p => p.socraticDeepening?.(topic, dialogueSummary, history),
      { contentCheck: topic, unsupportedMsg: '当前 AI 插件不支持苏格拉底深化', minLength: 1 });
  }

  /** Phase 2: 苏格拉底反问镜（mirror 模式）— topic 类非空即可 */
  async socraticMirror(topic: string, question: string): Promise<SocraticMirrorResult> {
    return this.call(p => p.socraticMirror?.(topic, question),
      { contentCheck: topic, unsupportedMsg: '当前 AI 插件不支持苏格拉底反问镜', minLength: 1 });
  }

  /** 学习预测 — 基于笔记预测可能的问题 */
  async predictQuestion(noteId: string, content: string): Promise<{ predictions: PredictionPrompt[] }> {
    return this.call(p => p.predictQuestion?.(noteId, content),
      { contentCheck: content, unsupportedMsg: '当前 AI 插件不支持学习预测' });
  }

  /** 学习救援 — 当用户卡住时提供提示与资源（v0.30: 概念名非空即可） */
  async rescue(context: RescueContext): Promise<{ hints: string[]; resources: ResourceLink[]; alternativeApproach?: string }> {
    return this.call(p => p.rescue?.(context),
      { contentCheck: context.topic, unsupportedMsg: '当前 AI 插件不支持学习救援', minLength: 1 });
  }

  /** F4 错误模式分析 — 黄金错误记录非空即可 */
  async analyzeErrorPatterns(goldenErrors: Array<{ flashcardId: string; correctAnswer: string; userAnswer: string }>): Promise<ErrorPatternResult> {
    return this.call(p => p.analyzeErrorPatterns?.(goldenErrors),
      { contentCheck: goldenErrors[0]?.correctAnswer ?? '', unsupportedMsg: '当前 AI 插件不支持错误模式分析', minLength: 1 });
  }

  /** N1 迷你测试生成 — 笔记文本非空即可 */
  async generateQuiz(notesText: string): Promise<QuizGenResult> {
    return this.call(p => p.generateQuiz?.(notesText),
      { contentCheck: notesText, unsupportedMsg: '当前 AI 插件不支持迷你测试生成', minLength: 30 });
  }

  /** N5 内容分层 — 笔记文本非空即可 */
  async contentTier(notesText: string): Promise<ContentTierResult> {
    return this.call(p => p.contentTier?.(notesText),
      { contentCheck: notesText, unsupportedMsg: '当前 AI 插件不支持内容分层', minLength: 30 });
  }

  /** N6 概念冲突检测 — 新旧文本均需非空 */
  async conflictDetect(newNoteText: string, historyText: string): Promise<ConflictDetectResult> {
    return this.call(p => p.conflictDetect?.(newNoteText, historyText),
      { contentCheck: newNoteText + historyText, unsupportedMsg: '当前 AI 插件不支持概念冲突检测', minLength: 60 });
  }

  /** E1 概念预检 — 概念非空即可（历史薄弱点可选） */
  async conceptPrecheck(concept: string, weakHistory?: string): Promise<ConceptPrecheckResult> {
    return this.call(p => p.conceptPrecheck?.(concept, weakHistory),
      { contentCheck: concept, unsupportedMsg: '当前 AI 插件不支持概念预检', minLength: 2 });
  }

  // ── 流式方法包装 ─────────────────────────────────────

  /** 流式摘要 */
  summarizeNoteStream(content: string, options?: SummarizeOptions) {
    return this.stream(p => p.summarizeNoteStream?.(content, options),
      { contentCheck: content, unsupportedMsg: '当前插件不支持流式摘要' });
  }

  /** 流式闪卡生成 */
  generateFlashcardsStream(content: string, options?: FlashcardOptions) {
    return this.stream(p => p.generateFlashcardsStream?.(content, options),
      { contentCheck: content, unsupportedMsg: '当前插件不支持流式闪卡生成' });
  }

  /** 流式费曼评估（v0.30: 讲解类阈值 5） */
  evaluateExplanationStream(concept: string, explanation: string, options?: EvaluateOptions) {
    return this.stream(p => p.evaluateExplanationStream?.(concept, explanation, options),
      { contentCheck: explanation, unsupportedMsg: '当前插件不支持流式评估', minLength: 5 });
  }

  /** 流式内容打标 */
  tagContentStream(content: string) {
    return this.stream(p => p.tagContentStream?.(content),
      { contentCheck: content, unsupportedMsg: '当前插件不支持流式打标' });
  }

  /** 流式闪卡优化（v0.30: 阈值 5） */
  optimizeCardStream(front: string, back: string) {
    return this.stream(p => p.optimizeCardStream?.(front, back),
      { contentCheck: front + back, unsupportedMsg: '当前插件不支持流式闪卡优化', minLength: 5 });
  }

  /** 流式灵感分拣 */
  sortInspirationStream(content: string, existingTags?: Record<string, string>) {
    return this.stream(p => p.sortInspirationStream?.(content, existingTags),
      { contentCheck: content, unsupportedMsg: '当前插件不支持流式灵感分拣' });
  }

  /** 流式费曼反问（v0.30: 讲解类阈值 5） */
  generateFeynmanQuestionsStream(concept: string, explanation: string) {
    return this.stream(p => p.generateFeynmanQuestionsStream?.(concept, explanation),
      { contentCheck: explanation, unsupportedMsg: '当前插件不支持流式反问', minLength: 5 });
  }

  /** 流式费曼回答评估 */
  evaluateFeynmanAnswersStream(concept: string, questions: string[], answers: string[]) {
    return this.stream(p => p.evaluateFeynmanAnswersStream?.(concept, questions, answers),
      { unsupportedMsg: '当前插件不支持流式回答评估' });
  }

  /** 流式锚点生成 */
  generateAnchorPointStream(noteId: string, content: string) {
    return this.stream(p => p.generateAnchorPointStream?.(noteId, content),
      { contentCheck: content, unsupportedMsg: '当前插件不支持流式锚点生成' });
  }

  /** 流式苏格拉底追问（v0.30: 主题类非空即可） */
  socraticQuestionStream(conversationId: string, topic: string, history: ChatMessage[]) {
    return this.stream(p => p.socraticQuestionStream?.(conversationId, topic, history),
      { contentCheck: topic, unsupportedMsg: '当前插件不支持流式苏格拉底追问', minLength: 1 });
  }

  /** 流式苏格拉底评估（v0.30: 回答类阈值 5） */
  socraticEvaluateStream(topic: string, question: string, answer: string, history: ChatMessage[]) {
    return this.stream(p => p.socraticEvaluateStream?.(topic, question, answer, history),
      { contentCheck: answer, unsupportedMsg: '当前插件不支持流式苏格拉底评估', minLength: 5 });
  }

  /** 流式苏格拉底深化（v0.30: 主题类非空即可） */
  socraticDeepeningStream(topic: string, dialogueSummary: string, history: ChatMessage[]) {
    return this.stream(p => p.socraticDeepeningStream?.(topic, dialogueSummary, history),
      { contentCheck: topic, unsupportedMsg: '当前插件不支持流式苏格拉底深化', minLength: 1 });
  }

  /** Phase 2: 流式苏格拉底反问镜 */
  socraticMirrorStream(topic: string, question: string) {
    return this.stream(p => p.socraticMirrorStream?.(topic, question),
      { contentCheck: topic, unsupportedMsg: '当前插件不支持流式苏格拉底反问镜', minLength: 1 });
  }

  /** 流式学习预测 */
  predictQuestionStream(noteId: string, content: string) {
    return this.stream(p => p.predictQuestionStream?.(noteId, content),
      { contentCheck: content, unsupportedMsg: '当前插件不支持流式学习预测' });
  }

  /** 流式学习救援（v0.30: 概念名非空即可） */
  rescueStream(context: RescueContext) {
    return this.stream(p => p.rescueStream?.(context),
      { contentCheck: context.topic, unsupportedMsg: '当前插件不支持流式救援', minLength: 1 });
  }
}

// 单例
export const aiPluginLoader = new AIPluginLoader();
