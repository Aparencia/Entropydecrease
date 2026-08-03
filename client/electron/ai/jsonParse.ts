/**
 * LLM 输出宽松 JSON 解析工具
 *
 * @ai-context: 本地小模型（Ollama）常把 JSON 包在 ```json 围栏里、
 * 加前置解释文字、或因 max_tokens 截断缺失闭合围栏。裸 JSON.parse
 * 遇此抛错会让 callWithLocalFallback 误降级到云端——违背"本地优先、
 * 离线可用"承诺且偷耗云端 token。本工具按 直接解析 → 围栏提取 →
 * 首尾大括号截取 三级策略解析，全部失败时返回调用方提供的 fallback。
 *
 * @ai-context: 纯函数，无副作用，可安全用于任何 handler 的本地降级路径。
 */

import { logger } from '../logger.js';

/**
 * 宽松解析 LLM 输出的 JSON 文本
 *
 * @param content - LLM 返回的原始文本
 * @param fallback - 全部解析策略失败时返回的兜底值（调用方按功能语义提供）
 * @returns 解析成功的对象，或 fallback
 */
export function parseModelJson<T extends object>(content: string, fallback: T): T {
  const trimmed = content.trim();
  if (!trimmed) return fallback;

  // 第一级：直接解析（模型遵循指令的最常见情形）
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // 继续尝试围栏剥离与片段提取
  }

  // 候选片段：闭合围栏内容 → 仅开头围栏（输出被截断时无闭合）→ 首尾大括号截取（前置解释文字兜底）
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const openFenceOnly = trimmed.replace(/^```(?:json)?\s*/i, '').trim();
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  const braceSlice = braceStart >= 0 && braceEnd > braceStart
    ? trimmed.slice(braceStart, braceEnd + 1)
    : '';

  const candidates = [fenceMatch?.[1]?.trim() ?? '', openFenceOnly, braceSlice]
    .filter((candidate) => candidate.startsWith('{'));

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // 尝试下一个候选
    }
  }

  logger.warn(`[AI] parseModelJson 解析失败，返回兜底值（原文前 120 字: ${trimmed.slice(0, 120)}）`);
  return fallback;
}
