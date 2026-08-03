/**
 * Electron IPC — 内容加工类 AI 功能（摘要/闪卡/打标/优化/分拣）
 *
 * @ai-context: 从 ElectronAIPlugin 拆出的按域函数集。每个函数负责
 * payload 组装（含 authToken 注入）与响应字段映射，
 * IPC 通道名与主进程 ai/handlers 一一对应，改名需两端同步。
 * @ai-context: 错误统一经 classifyRawError(error,'ipc') 归类为 AIError。
 */
import type {
  SummarizeOptions, SummarizeResult,
  FlashcardOptions, FlashcardResult,
  TagContentResult, OptimizeCardResult, SortResult,
} from './types';
import { classifyRawError } from './errorClassifier';

// ── invoke('ai_summarize') ──────────────────────────────────
export async function ipcSummarizeNote(
  authToken: string | null, noteContent: string, options?: SummarizeOptions,
): Promise<SummarizeResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_summarize', {
      text: noteContent,
      maxLength: options?.maxLength,
      style: options?.style,
      language: options?.language,
      authToken,
    }) as {
      summary: string; model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };
    return {
      summary: result.summary,
      keyPoints: [],
      generatedAt: new Date(),
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_generate_cards') ─────────────────────────────
export async function ipcGenerateFlashcards(
  authToken: string | null, noteContent: string, options?: FlashcardOptions,
): Promise<FlashcardResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_generate_cards', {
      note: noteContent,
      maxCards: options?.count,
      difficulty: options?.difficulty,
      cardType: options?.cardType,
      variants: options?.variants,
      authToken,
    }) as {
      cards: Array<{ front: string; back: string; type: string; confidence: number }>;
      totalExtracted: number; model: string; tokensUsed: number; requestId?: string;
    };
    return {
      cards: result.cards.map(c => ({
        front: c.front,
        back: c.back,
        type: c.type,
        confidence: c.confidence,
      })),
      totalExtracted: result.totalExtracted,
      generatedAt: new Date(),
      model: result.model,
      tokensUsed: result.tokensUsed,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_tag_content') ─────────────────────────────────
export async function ipcTagContent(
  authToken: string | null, content: string,
): Promise<TagContentResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_tag_content', {
      content,
      authToken,
    }) as {
      contentNature: string; cognitiveDepth: string; subject: string;
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };

    return {
      contentNature: result.contentNature as TagContentResult['contentNature'],
      cognitiveDepth: result.cognitiveDepth as TagContentResult['cognitiveDepth'],
      subject: result.subject,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_optimize_card') ──────────────────────────────
export async function ipcOptimizeCard(
  authToken: string | null, front: string, back: string,
): Promise<OptimizeCardResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_optimize_card', {
      front,
      back,
      authToken,
    }) as {
      suggestedFront: string; suggestedBack: string; improvements: string[];
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };
    return {
      suggestedFront: result.suggestedFront,
      suggestedBack: result.suggestedBack,
      improvements: result.improvements,
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}

// ── invoke('ai_sort_inspiration') ─────────────────────────────
export async function ipcSortInspiration(
  authToken: string | null, content: string, existingTags?: Record<string, string>,
): Promise<SortResult> {
  try {
    const result = await window.electronAPI!.invoke('ai_sort_inspiration', {
      content,
      existingTags,
      authToken,
    }) as {
      suggestions: Array<{ category: string; reason: string; confidence: number; suggestedAction?: string }>;
      model: string; tokensUsed: number; latencyMs: number; requestId?: string;
    };

    return {
      suggestions: result.suggestions.map(s => ({
        category: s.category as SortResult['suggestions'][0]['category'],
        reason: s.reason,
        confidence: s.confidence,
        suggestedAction: s.suggestedAction,
      })),
      model: result.model,
      tokensUsed: result.tokensUsed,
      latencyMs: result.latencyMs,
    };
  } catch (error: unknown) {
    throw classifyRawError(error, 'ipc');
  }
}
