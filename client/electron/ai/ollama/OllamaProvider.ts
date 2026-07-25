/**
 * Ollama 本地推理 — OpenAI 兼容推理客户端
 *
 * 通过 Ollama 的 OpenAI 兼容 API（/v1/chat/completions）执行推理，
 * 支持文本生成、单图视觉、多图分析三种模式。
 * 返回格式与远程 AI Gateway 保持一致。
 */

import { logger } from '../../logger.js';
import { getOllamaConfig } from './config.js';

// ================================================================
// 类型定义
// ================================================================

/** 统一推理结果（与 AI Gateway 响应格式一致） */
export interface OllamaInferenceResult {
  content: string;
  model: string;
  tokens_used: number;
  latency_ms: number;
}

/** 超时配置 */
const TIMEOUTS = {
  text: 60_000,       // 文本生成 60s
  vision: 120_000,    // 单图视觉 120s
  multiVision: 180_000, // 多图分析 180s
};

// ================================================================
// 内部辅助
// ================================================================

/** 构建 OpenAI 兼容请求体 */
function buildChatRequest(
  messages: Array<{ role: string; content: unknown }>,
  model: string,
  temperature: number,
  maxTokens: number,
) {
  return {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
}

/** 执行 OpenAI 兼容 chat/completions 请求 */
async function chatCompletion(
  messages: Array<{ role: string; content: unknown }>,
  model: string,
  timeoutMs: number,
  temperature = 0.7,
  maxTokens = 2048,
): Promise<OllamaInferenceResult> {
  const config = getOllamaConfig();
  const url = `${config.baseUrl}/v1/chat/completions`;
  const startTime = Date.now();

  const body = buildChatRequest(messages, model, temperature, maxTokens);

  logger.info(`[Ollama] → POST ${url} model=${model}, messages=${messages.length}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const e = err as { name?: string; message?: string };
    if (e.name === 'AbortError') {
      throw new Error(`[Ollama] Inference timeout after ${timeoutMs}ms`);
    }
    throw new Error(`[Ollama] Network error: ${e.message || String(err)}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const latencyMs = Date.now() - startTime;

  if (!resp.ok) {
    const detail = await resp.text().catch(() => 'unknown');
    logger.error(`[Ollama] ✖ HTTP ${resp.status} (${latencyMs}ms): ${detail.slice(0, 300)}`);
    throw new Error(`[Ollama] HTTP ${resp.status}: ${detail.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { total_tokens?: number };
    model?: string;
  };

  const content = data.choices?.[0]?.message?.content || '';
  const tokensUsed = data.usage?.total_tokens || 0;
  const usedModel = data.model || model;

  logger.info(`[Ollama] ← Success (${latencyMs}ms): model=${usedModel}, tokens=${tokensUsed}, content_length=${content.length}`);

  return {
    content,
    model: usedModel,
    tokens_used: tokensUsed,
    latency_ms: latencyMs,
  };
}

// ================================================================
// 公共 API
// ================================================================

/**
 * 文本生成（对应 summarize、evaluate、flashcard、tag 等功能）
 *
 * @param prompt 用户 prompt
 * @param systemPrompt 系统 prompt
 * @param options 可选参数
 */
export async function generateText(
  prompt: string,
  systemPrompt = '',
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<OllamaInferenceResult> {
  const config = getOllamaConfig();
  const model = options?.model || config.models.text;

  const messages: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  return chatCompletion(
    messages,
    model,
    TIMEOUTS.text,
    options?.temperature ?? 0.7,
    options?.maxTokens ?? 2048,
  );
}

/**
 * 单图视觉分析（对应 vision_extract）
 *
 * @param imageBase64 图片 base64（不含 data URI 前缀）
 * @param prompt 分析 prompt
 * @param systemPrompt 系统 prompt
 */
export async function generateVision(
  imageBase64: string,
  prompt: string,
  systemPrompt = '',
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<OllamaInferenceResult> {
  const config = getOllamaConfig();
  const model = options?.model || config.models.vision;

  // 确保 base64 不含 data URI 前缀
  const cleanBase64 = imageBase64.startsWith('data:image')
    ? imageBase64.split(',', 2)[1] || imageBase64
    : imageBase64;

  const messages: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({
    role: 'user',
    content: [
      {
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${cleanBase64}` },
      },
      {
        type: 'text',
        text: prompt,
      },
    ],
  });

  return chatCompletion(
    messages,
    model,
    TIMEOUTS.vision,
    options?.temperature ?? 0.3,
    options?.maxTokens ?? 4096,
  );
}

/**
 * 多图联合分析（对应 multimodal_analyze）
 *
 * @param imagesBase64 多张图片 base64 数组
 * @param prompt 分析 prompt
 * @param systemPrompt 系统 prompt
 */
export async function generateVisionMulti(
  imagesBase64: string[],
  prompt: string,
  systemPrompt = '',
  options?: { temperature?: number; maxTokens?: number; model?: string },
): Promise<OllamaInferenceResult> {
  const config = getOllamaConfig();
  const model = options?.model || config.models.vision;

  const messages: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // 构建多图 + 文本的 content 数组
  const contentParts: Array<Record<string, unknown>> = [];
  for (const img of imagesBase64) {
    const cleanBase64 = img.startsWith('data:image')
      ? img.split(',', 2)[1] || img
      : img;
    contentParts.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${cleanBase64}` },
    });
  }
  contentParts.push({ type: 'text', text: prompt });

  messages.push({ role: 'user', content: contentParts });

  return chatCompletion(
    messages,
    model,
    TIMEOUTS.multiVision,
    options?.temperature ?? 0.3,
    options?.maxTokens ?? 4096,
  );
}
