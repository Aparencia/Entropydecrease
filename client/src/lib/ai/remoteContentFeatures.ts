/**
 * 远程网关 — 内容加工类 AI 功能（摘要/闪卡/打标/优化/分拣）
 *
 * @ai-context: 从 RemoteAIPlugin 拆出。请求字段 camelCase → snake_case
 * 转换以匹配网关 Pydantic model，响应反向映射；端点路径与网关 routers
 * 一一对应。错误统一经 classifyRawError(error,'fetch') 归类。
 */
import type {
  SummarizeOptions, SummarizeResult,
  FlashcardOptions, FlashcardResult,
  TagContentResult, OptimizeCardResult, SortResult,
} from './types';
import { classifyRawError } from './errorClassifier';
import { aiClient } from '../http/apiClient';

// ── POST /api/v1/ai/summarize ──────────────────────────────
export async function httpSummarizeNote(noteContent: string, options?: SummarizeOptions): Promise<SummarizeResult> {
  try {
    // 构建后端 SummarizeRequest: { text, options: { max_length, style, language } }
    const backendOptions: Record<string, unknown> = {};
    if (options?.maxLength != null) backendOptions.max_length = options.maxLength;
    if (options?.style != null) backendOptions.style = options.style;
    if (options?.language != null) backendOptions.language = options.language;

    const result = await aiClient.post<{
      summary: string; model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/summarize',
      { text: noteContent, options: backendOptions },
    );

    return {
      summary: result.summary,
      keyPoints: [],
      generatedAt: new Date(),
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/generate-cards ─────────────────────────
export async function httpGenerateFlashcards(noteContent: string, options?: FlashcardOptions): Promise<FlashcardResult> {
  try {
    // 构建后端 CardGenRequest: { note, options: { max_cards, difficulty, card_type } }
    const backendOptions: Record<string, unknown> = {};
    if (options?.count != null) backendOptions.max_cards = options.count;
    if (options?.difficulty != null) backendOptions.difficulty = options.difficulty;
    if (options?.cardType != null) backendOptions.card_type = options.cardType;

    const result = await aiClient.post<{
      cards: Array<{ front: string; back: string; type: string; confidence: number }>;
      total_extracted: number; model: string; tokens_used: number;
    }>(
      '/api/v1/ai/generate-cards',
      { note: noteContent, options: backendOptions },
    );

    return {
      cards: result.cards.map(c => ({
        front: c.front,
        back: c.back,
        type: c.type,
        confidence: c.confidence,
      })),
      totalExtracted: result.total_extracted,
      generatedAt: new Date(),
      model: result.model,
      tokensUsed: result.tokens_used,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/tag-content ──────────────────────────────
export async function httpTagContent(content: string): Promise<TagContentResult> {
  try {
    const result = await aiClient.post<{
      content_nature: string; cognitive_depth: string; subject: string;
      model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/tag-content',
      { content },
    );

    return {
      contentNature: result.content_nature as TagContentResult['contentNature'],
      cognitiveDepth: result.cognitive_depth as TagContentResult['cognitiveDepth'],
      subject: result.subject,
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/optimize-card ──────────────────────────
export async function httpOptimizeCard(front: string, back: string): Promise<OptimizeCardResult> {
  try {
    const result = await aiClient.post<{
      suggested_front: string; suggested_back: string; improvements: string[];
      model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/optimize-card',
      { front, back },
    );

    return {
      suggestedFront: result.suggested_front,
      suggestedBack: result.suggested_back,
      improvements: result.improvements,
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}

// ── POST /api/v1/ai/sort-inspiration ─────────────────────────
export async function httpSortInspiration(content: string, existingTags?: Record<string, string>): Promise<SortResult> {
  try {
    const result = await aiClient.post<{
      suggestions: Array<{ category: string; reason: string; confidence: number; suggested_action?: string }>;
      model: string; tokens_used: number; latency_ms: number;
    }>(
      '/api/v1/ai/sort-inspiration',
      { content, existing_tags: existingTags },
    );

    return {
      suggestions: result.suggestions.map(s => ({
        category: s.category as SortResult['suggestions'][0]['category'],
        reason: s.reason,
        confidence: s.confidence,
        suggestedAction: s.suggested_action,
      })),
      model: result.model,
      tokensUsed: result.tokens_used,
      latencyMs: result.latency_ms,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'fetch');
  }
}
