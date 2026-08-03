/**
 * 文本切块纯函数
 * Text chunker (pure)
 *
 * @ai-context: 阶段 A 原子层。把提取到的长文本切成 ≤MAX_CHUNK_CHARS 的块，
 * 供 AI 概念化端点消费（网关单次请求有长度预算，见 api-design.md 分页/限流
 * 精神）。切块策略：优先在段落边界（空行）切，其次句子边界（。！？.!?），
 * 兜底按字符硬切——保证单块不超限且尽量保持语义完整。
 * 纯函数、无副作用，可安全重构与并行调用。
 *
 * @ai-context: Pure chunker splitting raw text into bounded semantic chunks.
 * Paragraph boundaries preferred, sentence boundaries second, hard cut last.
 *
 * @param raw - 原始文本（可为空字符串）
 * @returns 文本块数组；空输入返回 []，短文本返回单块
 */
import type { TextChunk } from '../types';

/** 单块字符上限（与 AI 网关入参预算对齐） / Per-chunk character cap */
export const MAX_CHUNK_CHARS = 3000;

/** 句子边界字符（中文句读 + 英文标点） / Sentence boundary markers */
const SENTENCE_BOUNDARIES = new Set(['。', '！', '？', '！？', '.', '!', '?']);

/** 段落边界：连续空行（含换行空白） / Paragraph boundary regex */
const PARAGRAPH_SPLIT_RE = /\n\s*\n/;

/**
 * 在指定范围内寻找最近的句子边界索引（从 start 向后找）
 * Find the nearest sentence boundary at or after `start`, bounded by `limit`.
 */
function findSentenceBoundary(text: string, start: number, limit: number): number {
  for (let i = start; i < limit; i++) {
    if (SENTENCE_BOUNDARIES.has(text[i])) return i + 1;
  }
  return -1;
}

/**
 * 从段落列表组装块：贪心合并段落直到接近上限，尽量在段落边界结束
 * Greedily merge paragraphs into chunks, ending at paragraph boundaries.
 */
function assembleFromParagraphs(paragraphs: string[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current = '';
  let index = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 单段超限：段内再按句子/硬切细分
    if (trimmed.length > MAX_CHUNK_CHARS) {
      if (current) {
        chunks.push({ index: index++, text: current });
        current = '';
      }
      let rest = trimmed;
      while (rest.length > MAX_CHUNK_CHARS) {
        const head = rest.slice(0, MAX_CHUNK_CHARS);
        chunks.push({ index: index++, text: head });
        rest = rest.slice(MAX_CHUNK_CHARS);
      }
      current = rest;
      continue;
    }

    // 合并后不超限 → 继续累积；超限 → 固化当前块
    const candidate = current ? `${current}\n\n${trimmed}` : trimmed;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
    } else {
      if (current) chunks.push({ index: index++, text: current });
      current = trimmed;
    }
  }

  if (current) chunks.push({ index: index++, text: current });
  return chunks;
}

/** 硬切辅助：从 start 起截取至 limit，优先在句子边界处收尾 / Hard split with sentence-boundary preference */
function splitAtBoundary(text: string, start: number): { head: string; rest: string } {
  const limit = Math.min(start + MAX_CHUNK_CHARS, text.length);
  const boundary = findSentenceBoundary(text, start, limit);
  const cut = boundary > 0 && boundary <= limit ? boundary : limit;
  return { head: text.slice(start, cut), rest: text.slice(cut) };
}

/**
 * 切块主入口 / Main chunking entry
 *
 * @ai-context 段级优先：先按空行切段，段粒度不足时回退到句子边界硬切，
 * 保证输出块数最少且每块 ≤ MAX_CHUNK_CHARS。块 index 从 0 连续递增。
 */
export function chunkText(raw: string): TextChunk[] {
  if (!raw) return [];

  const trimmed = raw.trim();
  if (!trimmed) return [];

  // 短文本：单块直出
  if (trimmed.length <= MAX_CHUNK_CHARS) return [{ index: 0, text: trimmed }];

  // 长文本：段落优先
  const paragraphs = trimmed.split(PARAGRAPH_SPLIT_RE);
  if (paragraphs.length > 1) return assembleFromParagraphs(paragraphs);

  // 无段落结构：句子边界硬切
  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;
  while (start < trimmed.length) {
    const { head, rest } = splitAtBoundary(trimmed, start);
    if (!head) break; // 防御：零进展时终止，避免死循环
    chunks.push({ index: index++, text: head });
    start += head.length;
    if (rest.length === 0) break;
  }
  return chunks;
}
