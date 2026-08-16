/**
 * 热词命中率计算 — 术语表 vs 转写文本
 *
 * @ai-context: 识别评估基线指标之二（P0-1）。热词命中率 = 术语表中被正确
 * 识别（含替换后纠正）的术语数 / 术语表总数。口径对齐竞品「自定义热词」
 * 验收：术语在参考转写中出现，且识别文本同样出现（允许经 replace 词条
 * 纠正后命中）。输出按术语粒度明细，便于定位高频错词。
 * @ai-context EN: Hotword hit-rate metric for the evaluation baseline (P0-1).
 * Hit rate = correctly recognized terms (including post-replace corrections)
 * divided by total terms. Per-term detail enables spotting frequent mis-hits.
 */

import { normalizeText } from './cer.mjs';

/**
 * 计算热词命中率。
 * @param {string} reference 参考转写（人工校对）
 * @param {string} hypothesis 识别文本（已应用替换词条后的版本）
 * @param {string[]} terms 术语表（课程专属词条）
 * @returns {{ hitRate: number, hits: string[], misses: string[], notInRef: string[] }}
 *   hits: 参考中出现且识别命中的术语；misses: 参考中出现但识别未命中的术语；
 *   notInRef: 术语表中参考文本里未出现的词（不计入分母，单独列出）。
 */
export function computeHotwordHitRate(reference, hypothesis, terms) {
  const ref = normalizeText(reference);
  const hyp = normalizeText(hypothesis);
  const uniqueTerms = [...new Set((terms ?? []).map((t) => normalizeText(t)).filter(Boolean))];

  const hits = [];
  const misses = [];
  const notInRef = [];

  for (const term of uniqueTerms) {
    const inRef = ref.includes(term);
    if (!inRef) {
      notInRef.push(term);
      continue;
    }
    if (hyp.includes(term)) {
      hits.push(term);
    } else {
      misses.push(term);
    }
  }

  const denominator = hits.length + misses.length;
  const hitRate = denominator === 0 ? 1 : hits.length / denominator;
  return { hitRate, hits, misses, notInRef };
}

/** 语料级聚合热词命中率（术语并集计分，加权口径 = 命中总数 / 参考中出现总数） */
export function aggregateHotwordHitRate(items) {
  let totalHit = 0;
  let totalInRef = 0;
  const missDetail = new Map();
  for (const item of items) {
    const r = computeHotwordHitRate(item.reference, item.hypothesis, item.terms ?? []);
    totalHit += r.hits.length;
    totalInRef += r.hits.length + r.misses.length;
    for (const term of r.misses) {
      missDetail.set(term, (missDetail.get(term) ?? 0) + 1);
    }
  }
  const hitRate = totalInRef === 0 ? 1 : totalHit / totalInRef;
  return { hitRate, totalHit, totalInRef, topMisses: [...missDetail.entries()].sort((a, b) => b[1] - a[1]) };
}
