/**
 * noteHealth — N3 笔记健康度检测（纯本地）
 *
 * @ai-context: 基于费曼学习法的笔记质量启发式评估，零 AI 依赖：
 * 结构分（标题/列表组织度）+ 生成分（自己的话 vs 照抄特征）+ 覆盖度（字数/词汇丰富度）
 * → 0-100 健康度 + 改进建议。觉察 > 管控——只提示不阻断。
 */

export interface NoteHealthResult {
  /** 综合健康度 0-100 */
  score: number;
  structure: number;
  generative: number;
  coverage: number;
  /** 改进建议（正向语言） */
  suggestions: string[];
}

/** 生成性标记：第一人称/转述/总结类短语——"自己的话"的信号 */
const GENERATIVE_MARKERS = [
  '我觉得', '我认为', '我理解', '我的理解', '换句话说', '也就是说',
  '简单说', '总结一下', '打个比方', '相当于', '本质上', '可以理解为',
];

/** 权重：生成性最重要（费曼核心），结构次之，覆盖度兜底 */
const WEIGHTS = { structure: 0.35, generative: 0.4, coverage: 0.25 };

/** 提取行级统计 */
function analyzeLines(text: string) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l)).length;
  const lists = lines.filter((l) => /^([-*+]\s)|(\d+[.、]\s)/.test(l)).length;
  const quotes = lines.filter((l) => /^>\s?/.test(l)).length;
  return { total: lines.length, headings, lists, quotes };
}

/** 结构分：标题与列表组织度 */
function scoreStructure(text: string): { score: number; tip: string | null } {
  const { total, headings, lists } = analyzeLines(text);
  if (total === 0) return { score: 0, tip: null };
  if (total < 3) return { score: 40, tip: '内容还比较短，试着用小标题分一分段落？' };
  const hasHeading = headings > 0;
  const listRatio = Math.min(lists / Math.max(total, 1), 0.5) * 2; // 0-1
  const score = Math.round((hasHeading ? 55 : 25) + listRatio * 35 + Math.min(headings, 3) * 3);
  return {
    score: Math.min(score, 100),
    tip: hasHeading ? null : '加个小标题，笔记会更清晰易回顾。',
  };
}

/** 生成分：自己的话 vs 照抄特征 */
function scoreGenerative(text: string): { score: number; tip: string | null } {
  const plain = text.replace(/^#{1,6}\s/gm, '');
  const markerHits = GENERATIVE_MARKERS.filter((m) => plain.includes(m)).length;

  // 照抄特征：超长段落（>120 字无断行）占比
  const paragraphs = plain.split('\n').map((p) => p.trim()).filter(Boolean);
  const longCount = paragraphs.filter((p) => p.length > 120).length;
  const longRatio = paragraphs.length > 0 ? longCount / paragraphs.length : 0;

  // 照抄特征：引用块占比过高
  const { total, quotes } = analyzeLines(text);
  const quoteRatio = total > 0 ? quotes / total : 0;

  let score = 40 + Math.min(markerHits, 4) * 15; // 生成标记加分
  score -= Math.round(longRatio * 40);           // 大段照抄扣分
  score -= Math.round(Math.max(quoteRatio - 0.3, 0) * 60); // 引用过多扣分
  score = Math.max(0, Math.min(100, score));

  const tip = markerHits === 0 && (longRatio > 0.3 || quoteRatio > 0.3)
    ? '试试用自己的话复述一遍——"换句话说……"是很好的开始。'
    : null;
  return { score, tip };
}

/** 覆盖度：字数达标 + 词汇丰富度（字符去重率） */
function scoreCoverage(text: string): { score: number; tip: string | null } {
  const chars = text.replace(/[\s#>*\-\d.、。，。！？!?]/g, '');
  const len = chars.length;
  if (len === 0) return { score: 0, tip: null };
  const lengthScore = Math.min(len / 200, 1) * 60; // 200 字达标
  const unique = new Set(chars).size;
  const diversity = unique / len; // 中文自然文本约 0.3-0.6
  const diversityScore = Math.min(diversity / 0.4, 1) * 40;
  const score = Math.round(lengthScore + diversityScore);
  return {
    score: Math.min(score, 100),
    tip: len < 200 ? '再多写一点你的理解，覆盖会更完整。' : null,
  };
}

/**
 * 计算笔记健康度
 * @ai-context: 输入 markdown 或纯文本；短内容（<30 字）返回 null 表示不评估
 */
export function assessNoteHealth(text: string): NoteHealthResult | null {
  const trimmed = text.trim();
  if (trimmed.length < 30) return null;

  const structure = scoreStructure(trimmed);
  const generative = scoreGenerative(trimmed);
  const coverage = scoreCoverage(trimmed);

  const score = Math.round(
    structure.score * WEIGHTS.structure
    + generative.score * WEIGHTS.generative
    + coverage.score * WEIGHTS.coverage,
  );

  const suggestions = [structure.tip, generative.tip, coverage.tip].filter(Boolean) as string[];
  return { score, structure: structure.score, generative: generative.score, coverage: coverage.score, suggestions };
}

/** 健康度分级（用于 UI 着色） */
export function healthLevel(score: number): 'good' | 'fair' | 'weak' {
  if (score >= 70) return 'good';
  if (score >= 40) return 'fair';
  return 'weak';
}
