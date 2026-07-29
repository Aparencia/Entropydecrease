/**
 * 多源结果融合（纯函数）
 *
 * @ai-context: 融合算法三步——时间戳排序、Jaccard 字符集相似度去重
 * （阈值 0.8，与 VisionWorker 内部去重算法一致，两处需保持同步）、
 * 置信度降序拼接 + 加权平均。纯函数，无副作用，可安全重构。
 */
import type { FusionInput, FusionResult } from './routeTypes';

/**
 * 融合多路径结果（去重 + 时间轴对齐 + 置信度加权）。
 *
 * - 基于时间戳对齐不同来源的结果
 * - 文本去重：Jaccard 相似度 > 0.8 视为重复
 * - 置信度加权合并
 */
export function fuseResults(results: FusionInput[]): FusionResult {
  if (results.length === 0) {
    return { text: '', confidence: 0, sources: [] };
  }

  // 按时间戳排序
  const sorted = [...results].sort((a, b) => a.timestamp - b.timestamp);

  // 去重 + 合并
  const uniqueEntries: FusionInput[] = [];
  for (const entry of sorted) {
    const isDuplicate = uniqueEntries.some(
      existing => jaccardSimilarity(existing.text, entry.text) > 0.8,
    );
    if (!isDuplicate) {
      uniqueEntries.push(entry);
    }
  }

  if (uniqueEntries.length === 0) {
    return { text: '', confidence: 0, sources: [] };
  }

  // 置信度加权合并文本
  // 策略：按置信度降序拼接去重后的文本段落
  const weighted = uniqueEntries.sort((a, b) => b.confidence - a.confidence);
  const mergedText = weighted.map(e => e.text).join('\n');

  // 综合置信度 = 加权平均
  const totalWeight = uniqueEntries.reduce((sum, e) => sum + e.confidence, 0);
  const avgConfidence = totalWeight / uniqueEntries.length;

  const sources = [...new Set(uniqueEntries.map(e => e.source))];

  return {
    text: mergedText,
    confidence: Math.round(avgConfidence * 1000) / 1000,
    sources,
  };
}

/**
 * 计算两段文本的 Jaccard 字符集相似度（基于 unique 字符集合）。
 * 与 VisionWorker 内部去重方法相同的算法。
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = new Set(a);
  const setB = new Set(b);

  let intersectionSize = 0;
  for (const ch of setA) {
    if (setB.has(ch)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}
