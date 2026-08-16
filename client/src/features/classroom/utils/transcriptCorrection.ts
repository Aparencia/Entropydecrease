/**
 * 转写修正差异提取（P1-3 修正回写）
 *
 * @ai-context: 从「原始转写 → 用户修正文本」提取最小差异片段（公共前缀/
 * 后缀剥离），生成 replace 词条（term=错误形态 → target=修正形态）写入
 * 本地词库。单字差异不入库（误伤面大）；片段超长（>20 字）不入库（整句
 * 重写不是词条修正，交给笔记层）。
 * @ai-context EN: Minimal-diff extraction between original transcript and
 * user correction (common prefix/suffix stripping) to produce a replace
 * vocabulary entry. Single-char and over-long diffs are not persisted.
 */

export interface Correction {
  /** 原文差异片段（ASR 错误形态） */
  term: string;
  /** 修正后片段（目标形态） */
  target: string;
}

/**
 * 提取修正词条。
 * @returns 差异片段（term/target），无可入库差异时 null
 */
export function extractCorrection(original: string, corrected: string): Correction | null {
  const a = (original ?? '').trim();
  const b = (corrected ?? '').trim();
  if (!a || !b || a === b) return null;

  // 公共前缀
  let prefix = 0;
  const maxPrefix = Math.min(a.length, b.length);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++;

  // 公共后缀（不与前缀重叠）
  let suffix = 0;
  const maxSuffix = Math.min(a.length - prefix, b.length - prefix);
  while (
    suffix < maxSuffix
    && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) suffix++;

  const term = a.slice(prefix, a.length - suffix);
  const target = b.slice(prefix, b.length - suffix);
  // term 必须有内容；target 允许为空串（替换词条语义：删除误词）
  if (!term) return null;
  // 片段长度上限：整句重写不是词条修正
  if (term.length > 20 || target.length > 20) return null;
  // 单字差异允许入库：用户主动修正本身是强信号，单字错字纠正
  // （如「减」→「降」）正是最高频的术语修正形态
  return { term, target };
}
