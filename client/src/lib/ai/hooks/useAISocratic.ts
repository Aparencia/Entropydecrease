/**
 * @ai-context: Socratic 功能的 React Hook 包装：仅做加载/错误状态编排，业务调用统一走 aiPluginLoader，禁止在 Hook 内写业务计算。
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { aiPluginLoader } from '../AIPluginLoader';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import {
  resolveAIFallback,
  setAICache,
  getAICache,
  dedupeRequest,
  FallbackLevel,
  CACHE_TTL_5MIN,
} from '../aiServiceFallback';
import { type AIState, INITIAL_STATE, resolveAIErrorState } from './types';
import type { BrainstormIdea, ChatMessage, SocraticEvaluateResult, SocraticDeepeningResult, SocraticMirrorResult } from '../types';

/**
 * 宽松解析流式累积的苏格拉底追问 JSON（socratic_v1 模板强制 JSON：
 * {"question": "...", "hints": [...]}；AI 输出可能带前后缀说明文字）
 */
function parseSocraticQuestionJson(text: string): { question: string; hints: string[] } | null {
  const tryParse = (s: string): { question: string; hints: string[] } | null => {
    try {
      const parsed = JSON.parse(s) as { question?: string; hints?: string[] };
      if (typeof parsed.question === 'string' && parsed.question.trim()) {
        return { question: parsed.question, hints: Array.isArray(parsed.hints) ? parsed.hints : [] };
      }
    } catch { /* fallthrough */ }
    return null;
  };
  const direct = tryParse(text);
  if (direct) return direct;
  const block = text.match(/\{[\s\S]*\}/);
  return block ? tryParse(block[0]) : null;
}

/**
 * AI 苏格拉底式学习 hook
 *
 * 提供三种交互模式：
 * - brainstorm: 头脑风暴，激发创意与联想
 * - question: 追问模式，引导深度思考（支持多轮对话）
 * - evaluate: 回答评估，返回四维度评分
 *
 * 性能优化：
 * - 300 秒 TTL 缓存，相同参数直接返回缓存
 * - dedupeRequest 防止同一参数并发重复调用
 * - 接入 aiServiceFallback 进行降级处理
 *
 * 降级响应处理：
 * - 后端返回 status: 'fallback' 时，使用后端提供的友好提示和默认数据
 */
export function useAISocratic() {
  const [brainstormState, setBrainstormState] = useState<AIState<{ ideas: BrainstormIdea[] }>>({
    ...INITIAL_STATE,
  });
  const [questionState, setQuestionState] = useState<AIState<{ question: string; hints: string[] }>>({
    ...INITIAL_STATE,
  });
  const [evaluateState, setEvaluateState] = useState<AIState<SocraticEvaluateResult>>({
    ...INITIAL_STATE,
  });
  const [deepeningState, setDeepeningState] = useState<AIState<SocraticDeepeningResult>>({
    ...INITIAL_STATE,
  });
  const [mirrorState, setMirrorState] = useState<AIState<SocraticMirrorResult>>({
    ...INITIAL_STATE,
  });
  /** 追问流式渐进文本（逐 chunk 累积，打字机展示） */
  const [streamingQuestion, setStreamingQuestion] = useState('');
  /** 是否正在流式追问输出 */
  const [isQuestionStreaming, setIsQuestionStreaming] = useState(false);
  const questionCancelRef = useRef(false);
  const questionStreamIdRef = useRef(0);

  /** 苏格拉底式头脑风暴 — 带 300 秒缓存 + 请求去重 + 降级处理 */
  const brainstorm = useCallback(async (topic: string, context?: string) => {
    const cacheKey = `socratic_brainstorm:${topic.slice(0, 100)}`;

    // 1. 前置缓存检查：5 分钟内相同 topic 直接返回
    const cached = getAICache<{ ideas: BrainstormIdea[] }>(cacheKey);
    if (cached) {
      setBrainstormState({ data: cached, loading: false, error: null, isFallback: false, needsConfig: false });
      return cached;
    }

    setBrainstormState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));

    // 2. 请求去重：相同 cacheKey 的并发请求只执行一次
    try {
      const result = await dedupeRequest(cacheKey, async () => {
        return aiPluginLoader.socraticBrainstorm(topic, context);
      });

      // 3. 检查后端降级响应
      const isBackendFallback = (result as { status?: string })?.status === 'fallback';

      if (isBackendFallback) {
        // 后端降级：使用后端提供的友好数据和提示
        const fallbackIdeas = (result as { ideas?: BrainstormIdea[] })?.ideas || [];
        setBrainstormState({
          data: { ideas: fallbackIdeas },
          loading: false,
          error: 'AI 服务暂时不可用，已为您生成默认思考方向',
          isFallback: true,
          needsConfig: false,
        });
        return { ideas: fallbackIdeas };
      }

      // 正常响应
      soundPlayer.play('ai_analysis_done');
      setAICache(cacheKey, result, CACHE_TTL_5MIN);
      setBrainstormState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<{ ideas: BrainstormIdea[] }>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setBrainstormState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setBrainstormState(resolveAIErrorState(error, {
        message: 'AI 头脑风暴服务暂时不可用',
        suggestion: '您可以尝试自由联想，写下与主题相关的任何想法',
      }));
      return null;
    }
  }, []);

  /** 苏格拉底式追问（多轮对话）— 对话类不缓存（每轮都不同） */
  const askQuestion = useCallback(async (conversationId: string, topic: string, history: ChatMessage[]) => {
    setQuestionState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    const cacheKey = `socratic_question:${conversationId}:${topic.slice(0, 100)}`;
    try {
      const result = await aiPluginLoader.socraticQuestion(conversationId, topic, history);

      // 检查后端降级
      const isBackendFallback = (result as { status?: string })?.status === 'fallback';
      if (isBackendFallback) {
        setQuestionState({
          data: result,
          loading: false,
          error: 'AI 追问服务暂时不可用，请尝试自问"为什么"来深入思考',
          isFallback: true,
          needsConfig: false,
        });
        return result;
      }

      // 追问不缓存（每次 history 不同），仅用于降级
      setAICache(cacheKey, result, CACHE_TTL_5MIN);
      setQuestionState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<{ question: string; hints: string[] }>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setQuestionState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setQuestionState(resolveAIErrorState(error, {
        message: 'AI 追问服务暂时不可用',
        suggestion: '您可以尝试自问"为什么"和"如何"来深入思考',
      }));
      return null;
    }
  }, []);

  /**
   * A 组流式接入：苏格拉底追问打字机（/socratic/stream SSE）
   * 逐 chunk 累积 JSON（socratic_v1 模板强制 {"question","hints"}），完成后宽松解析；
   * 流式失败自动降级非流式 askQuestion。onChunk 回调供 UI 渐进展示。
   */
  const askQuestionStream = useCallback(async (
    conversationId: string,
    topic: string,
    history: ChatMessage[],
    onChunk?: (partial: string) => void,
  ) => {
    questionCancelRef.current = false;
    const streamId = ++questionStreamIdRef.current;
    setQuestionState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));
    setIsQuestionStreaming(true);
    setStreamingQuestion('');
    let accumulated = '';
    try {
      const iterable = aiPluginLoader.socraticQuestionStream(conversationId, topic, history);
      for await (const chunk of iterable) {
        if (questionCancelRef.current || questionStreamIdRef.current !== streamId) return null;
        accumulated += chunk;
        setStreamingQuestion(accumulated);
        onChunk?.(accumulated);
      }
      if (questionCancelRef.current || questionStreamIdRef.current !== streamId) return null;
      const parsed = parseSocraticQuestionJson(accumulated);
      if (!parsed) {
        throw new Error('AI 流式返回无法解析为苏格拉底追问 JSON');
      }
      soundPlayer.play('ai_analysis_done');
      setQuestionState({ data: parsed, loading: false, error: null, isFallback: false, needsConfig: false });
      setIsQuestionStreaming(false);
      return parsed;
    } catch {
      if (questionCancelRef.current || questionStreamIdRef.current !== streamId) return null;
      // 流式失败 → 降级非流式（非流式内部自行处理错误态与降级链）
      setIsQuestionStreaming(false);
      return askQuestion(conversationId, topic, history);
    }
  }, [askQuestion]);

  /** 取消当前流式追问 */
  const cancelQuestionStream = useCallback(() => {
    questionCancelRef.current = true;
    setIsQuestionStreaming(false);
  }, []);

  // 组件卸载时自动取消，避免对已卸载组件 setState
  useEffect(() => () => { questionCancelRef.current = true; }, []);

  /** FEAT-022: 苏格拉底回答评估 — 带 300 秒缓存 + 请求去重 + 降级处理 */
  const evaluateAnswer = useCallback(async (topic: string, question: string, answer: string, history: ChatMessage[]) => {
    // 评估缓存 key 包含 topic+question+answer 的摘要
    const cacheKey = `socratic_evaluate:${topic.slice(0, 30)}:${question.slice(0, 30)}:${answer.slice(0, 50)}`;

    // 1. 前置缓存检查：相同参数的评估直接返回
    const cached = getAICache<SocraticEvaluateResult>(cacheKey);
    if (cached) {
      setEvaluateState({ data: cached, loading: false, error: null, isFallback: false, needsConfig: false });
      return cached;
    }

    setEvaluateState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));

    // 2. 请求去重
    try {
      const result = await dedupeRequest(cacheKey, async () => {
        return aiPluginLoader.socraticEvaluate(topic, question, answer, history);
      });

      // 3. 检查后端降级响应
      const isBackendFallback = (result as { status?: string })?.status === 'fallback';

      if (isBackendFallback) {
        // 后端降级：使用后端提供的友好评分和提示
        const fallbackResult = result as SocraticEvaluateResult;
        setEvaluateState({
          data: fallbackResult,
          loading: false,
          error: fallbackResult.feedback || 'AI 评估暂不可用，但请继续保持深入思考！',
          isFallback: true,
          needsConfig: false,
        });
        return fallbackResult;
      }

      // 正常响应
      soundPlayer.play('ai_analysis_done');
      setAICache(cacheKey, result, CACHE_TTL_5MIN);
      setEvaluateState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<SocraticEvaluateResult>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setEvaluateState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setEvaluateState(resolveAIErrorState(error, {
        message: 'AI 评估服务暂时不可用',
        suggestion: '请继续保持深入思考，评估功能恢复后可获取详细评分',
      }));
      return null;
    }
  }, []);

  /** FEAT-022: 深化角度生成 — 带缓存 + 请求去重 + 降级处理 */
  const generateDeepeningAngles = useCallback(async (
    topic: string,
    dialogueSummary: string,
    history: ChatMessage[],
  ) => {
    const cacheKey = `socratic_deepening:${topic.slice(0, 50)}`;

    // 1. 前置缓存检查
    const cached = getAICache<SocraticDeepeningResult>(cacheKey);
    if (cached) {
      setDeepeningState({ data: cached, loading: false, error: null, isFallback: false, needsConfig: false });
      return cached;
    }

    setDeepeningState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));

    // 2. 请求去重
    try {
      const result = await dedupeRequest(cacheKey, async () => {
        return aiPluginLoader.socraticDeepening(topic, dialogueSummary, history);
      });

      // 3. 检查后端降级响应
      const isBackendFallback = result?.status === 'fallback';

      if (isBackendFallback) {
        setDeepeningState({
          data: result,
          loading: false,
          error: 'AI 服务暂时不可用，已为您生成默认深化角度',
          isFallback: true,
          needsConfig: false,
        });
        return result;
      }

      // 正常响应
      soundPlayer.play('ai_analysis_done');
      setAICache(cacheKey, result, CACHE_TTL_5MIN);
      setDeepeningState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<SocraticDeepeningResult>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setDeepeningState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setDeepeningState(resolveAIErrorState(error, {
        message: 'AI 深化服务暂时不可用',
        suggestion: '您可以尝试自问“为什么”和“如何”来深入思考',
      }));
      return null;
    }
  }, []);

  /** Phase 2: 苏格拉底反问镜（mirror 模式）— 将用户问题以另一种视角反弹回去 */
  const mirrorQuestion = useCallback(async (topic: string, question: string) => {
    // M10: 缓存 key 使用完整 topic+question——截断会产生同前缀碰撞，
    // 不同问题命中同一缓存（setAICache 为内存 Map，长 key 无存储成本）
    const cacheKey = `socratic_mirror:${topic}:${question}`;

    const cached = getAICache<SocraticMirrorResult>(cacheKey);
    if (cached) {
      setMirrorState({ data: cached, loading: false, error: null, isFallback: false, needsConfig: false });
      return cached;
    }

    setMirrorState(prev => ({ ...prev, loading: true, error: null, needsConfig: false }));

    try {
      const result = await dedupeRequest(cacheKey, async () => {
        return aiPluginLoader.socraticMirror(topic, question);
      });

      const isBackendFallback = (result as { status?: string })?.status === 'fallback';

      if (isBackendFallback) {
        setMirrorState({
          data: result,
          loading: false,
          error: 'AI 服务暂时不可用，已为您生成默认反思提示',
          isFallback: true,
          needsConfig: false,
        });
        return result;
      }

      soundPlayer.play('ai_analysis_done');
      setAICache(cacheKey, result, CACHE_TTL_5MIN);
      setMirrorState({ data: result, loading: false, error: null, isFallback: false, needsConfig: false });
      return result;
    } catch (error: unknown) {
      const fallback = resolveAIFallback<SocraticMirrorResult>(cacheKey, error as Error);
      if (fallback.level === FallbackLevel.CACHE_HIT) {
        setMirrorState({ data: fallback.data, loading: false, error: fallback.message, isFallback: true, needsConfig: false });
        return fallback.data;
      }
      setMirrorState(resolveAIErrorState(error, {
        message: 'AI 反问镜服务暂时不可用',
        suggestion: '您可以尝试从相反的角度思考自己的问题',
      }));
      return null;
    }
  }, []);

  return {
    brainstorm: { ...brainstormState, brainstorm },
    question: {
      ...questionState,
      askQuestion,
      askQuestionStream,
      cancelQuestionStream,
      streamingQuestion,
      isQuestionStreaming,
    },
    evaluate: { ...evaluateState, evaluateAnswer },
    deepening: { ...deepeningState, generateDeepeningAngles },
    mirror: { ...mirrorState, mirrorQuestion },
  };
}
