/**
 * CER（字符错误率）计算 — 编辑距离实现
 *
 * @ai-context: 识别评估基线的核心指标（P0-1）。中文按字符、英文按词计算
 * 编辑距离（Levenshtein），CER = (S+D+I) / N。对齐市场口径（AISHELL 评测
 * 体系）：参考文本归一化（全角转半角、去多余空白）后再比对，避免标点
 * 全半角差异污染指标。
 * @ai-context EN: Core metric for the recognition evaluation baseline (P0-1).
 * Levenshtein edit distance on characters (Chinese) or words (English);
 * CER = (S+D+I)/N. Reference text is normalized before comparison to keep
 * full/half-width punctuation noise out of the metric.
 */

/** 文本归一化：全角转半角、压缩连续空白、去首尾空白 */
export function normalizeText(text) {
  return String(text ?? '')
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[ \t\u3000]+/g, ' ')
    .trim();
}

/**
 * 分词：中文逐字（连续 CJK 段按字符拆分），英文/数字按词。
 * 中文连续段按字符是 CER 口径（AISHELL）；英文按词是 WER 口径。
 */
export function tokenize(text, mode = 'auto') {
  const normalized = normalizeText(text);
  if (mode === 'word') {
    return normalized.split(/\s+/).filter(Boolean);
  }
  if (mode === 'char') {
    return [...normalized].filter((ch) => ch !== ' ');
  }
  // auto：CJK 字符逐字，拉丁/数字词按词
  const tokens = [];
  const re = /[\u4e00-\u9fff]|[A-Za-z0-9]+(?:[.\-_][A-Za-z0-9]+)*|[^\s]/g;
  for (const m of normalized.matchAll(re)) {
    tokens.push(m[0]);
  }
  return tokens;
}

/** 编辑距离（O(n*m) 双行滚动数组，避免长文本 O(n²) 内存） */
export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array(n + 1).fill(0).map((_, j) => j);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // 插入
        prev[j] + 1,           // 删除
        prev[j - 1] + cost,    // 替换
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * 计算 CER：参考文本 vs 识别文本。
 * @returns { cer: number, substitutions: number, deletions: number, insertions: number, refLength: number }
 */
export function computeCer(reference, hypothesis, mode = 'auto') {
  const refTokens = tokenize(reference, mode);
  const hypTokens = tokenize(hypothesis, mode);
  const distance = editDistance(refTokens, hypTokens);
  const refLength = refTokens.length;
  if (refLength === 0) {
    // 参考为空：识别出内容即全为插入；两者皆空 CER=0
    return {
      cer: hypTokens.length === 0 ? 0 : 1,
      substitutions: 0,
      deletions: 0,
      insertions: hypTokens.length,
      refLength: 0,
    };
  }
  // 回溯拆解 S/D/I 计数（供定位错误类型分布；与距离总和一致）
  let { substitutions, deletions, insertions } = backtraceCounts(refTokens, hypTokens);
  const cer = distance / refLength;
  return { cer, substitutions, deletions, insertions, refLength };
}

/** 回溯拆解编辑操作计数（Damerau 不启用，与 editDistance 一致） */
function backtraceCounts(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  let i = m;
  let j = n;
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
      if (a[i - 1] !== b[j - 1]) substitutions++;
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      deletions++;
      i--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      insertions++;
      j--;
    } else {
      // 防御：不可能到达（dp 一致性保证），避免死循环
      i = Math.max(0, i - 1);
      j = Math.max(0, j - 1);
    }
  }
  return { substitutions, deletions, insertions };
}

/** 语料级聚合 CER（按参考总长加权，与 AISHELL 聚合口径一致） */
export function aggregateCer(items) {
  let totalDistance = 0;
  let totalRef = 0;
  for (const item of items) {
    const ref = tokenize(item.reference, item.mode ?? 'auto');
    const hyp = tokenize(item.hypothesis, item.mode ?? 'auto');
    totalDistance += editDistance(ref, hyp);
    totalRef += ref.length;
  }
  return totalRef === 0 ? 0 : totalDistance / totalRef;
}
