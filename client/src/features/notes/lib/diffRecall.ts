/**
 * N2 合书测试答案 diff — 回忆答案与原文的轻量对照（正确/遗漏/错误三态）
 * Closed-book recall diff — lightweight three-state comparison
 *
 * @ai-context: 纯本地算法（零 AI 依赖）：句子级字符 bigram Dice 相似度。
 * 答案句在原文中找到高相似句子 → correct（绿色）；无对应 → wrong（红色）；
 * 原文中未被任何答案覆盖的句子 → missing（琥珀色遗漏提示）。阈值经测试
 * 校准，中文短句场景稳定。本地优先，不消耗 AI 配额。
 * @ai-context: Pure-local sentence diff using character bigram Dice
 * similarity — no AI quota consumed; thresholds calibrated by tests.
 */

/** diff 结果行：三态中的一种 */
export interface DiffSentence {
  text: string;
  kind: 'correct' | 'wrong' | 'missing';
  /** correct 时：答案句匹配到的原文句子 */
  matched?: string;
}

/** 判定为"正确"的最低相似度（Dice 系数） */
const CORRECT_THRESHOLD = 0.5;
/** 短句（≤6 字）需要更高相似度才判正确，防过度误判 */
const SHORT_SENTENCE_THRESHOLD = 0.65;

/** 按中文句读切分句子（。！？；换行），过滤空白 */
export function splitSentences(text: string): string[] {
  return text
    .split(/[。！？；\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

/** 字符 bigram 集合（去空白），单字回退为单字集合 */
function bigrams(text: string): Set<string> {
  const t = text.replace(/\s+/g, '');
  const out = new Set<string>();
  if (t.length === 0) return out;
  if (t.length === 1) { out.add(t); return out; }
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

/** Dice 系数相似度（bigram 集合） */
function dice(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let inter = 0;
  for (const x of ga) if (gb.has(x)) inter += 1;
  return (2 * inter) / (ga.size + gb.size);
}

/**
 * 对照回忆答案与原文，输出三态 diff 行：
 * - correct：答案句在原文中有高相似对应（附 matched 原文句）
 * - wrong：答案句在原文中无对应（可能是错误回忆）
 * - missing：原文中未被任何答案句覆盖的句子（遗漏提示）
 */
export function diffRecallAgainstNote(answer: string, note: string): DiffSentence[] {
  const answerSentences = splitSentences(answer);
  const noteSentences = splitSentences(note);
  if (answerSentences.length === 0) {
    // 未作答：全部原文句视为遗漏
    return noteSentences.map((text) => ({ text, kind: 'missing' }));
  }

  const result: DiffSentence[] = [];
  const covered = new Set<number>();
  for (const as of answerSentences) {
    let bestIndex = -1;
    let bestSim = 0;
    const threshold = as.length <= 6 ? SHORT_SENTENCE_THRESHOLD : CORRECT_THRESHOLD;
    noteSentences.forEach((ns, i) => {
      // 长度比剪枝：bigram Dice 上界 = 2/(1+maxLen/minLen)，低于阈值时
      // 相似度必然不达标，跳过 bigram 构建（结果与不剪枝完全等价）
      const ratio = Math.max(as.length, ns.length) / Math.min(as.length, ns.length);
      if (2 / (1 + ratio) < threshold) return;
      const s = dice(as, ns);
      if (s > bestSim) { bestSim = s; bestIndex = i; }
    });
    if (bestIndex >= 0 && bestSim >= threshold) {
      covered.add(bestIndex);
      result.push({ text: as, kind: 'correct', matched: noteSentences[bestIndex] });
    } else {
      result.push({ text: as, kind: 'wrong' });
    }
  }

  noteSentences.forEach((ns, i) => {
    if (!covered.has(i)) result.push({ text: ns, kind: 'missing' });
  });
  return result;
}
