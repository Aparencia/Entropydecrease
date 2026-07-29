/**
 * 轻量逐行差异对比模块
 * v0.9.0: 基于 LCS（最长公共子序列）算法实现文本差异对比
 *
 * 纯函数设计，无副作用，便于单元测试
 *
 * @ai-context: LCS 动态规划逐行 diff，供同步冲突对比 UI 展示使用；
 * O(m*n) 复杂度，超长文本（>5000行）调用方需自行截断。纯函数可安全重构。
 */

/** 差异行类型 */
export type DiffType = 'equal' | 'add' | 'remove';

/** 差异行 */
export interface DiffLine {
  /** 行类型：equal（不变）/ add（新增）/ remove（删除） */
  type: DiffType;
  /** 行内容 */
  content: string;
  /** 在原文中的行号（remove/equal 时有效，add 时为 -1） */
  oldLineNo: number;
  /** 在新文中的行号（add/equal 时有效，remove 时为 -1） */
  newLineNo: number;
}

/**
 * 计算两个数组的最长公共子序列（LCS）索引对
 *
 * 使用动态规划，时间复杂度 O(m*n)，空间优化为 O(min(m,n))
 *
 * @param oldLines 原文行数组
 * @param newLines 新文行数组
 * @returns LCS 索引对数组 [oldIndex, newIndex]
 */
function computeLCS(
  oldLines: string[],
  newLines: string[]
): Array<[number, number]> {
  const m = oldLines.length;
  const n = newLines.length;

  // 优化：让较短的数组作为列维度
  if (m < n) {
    const swapped = computeLCS(newLines, oldLines);
    return swapped.map(([a, b]) => [b, a] as [number, number]);
  }

  // 空间优化：只保留两行 DP
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);
  // 回溯路径记录
  const trace: Array<Array<number>> = [];

  for (let i = 1; i <= m; i++) {
    const row = new Array<number>(n + 1).fill(0);
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        row[j] = prev[j - 1] + 1;
      } else {
        row[j] = Math.max(prev[j], row[j - 1]);
      }
    }
    trace.push([...row]);
    prev = curr;
    curr = row;
  }

  // 回溯提取 LCS 路径
  const result: Array<[number, number]> = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      result.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (i > 1 && j > 1) {
      const row = trace[i - 2]; // trace index is i-1-1
      if (row[j] >= row[j - 1]) {
        // prev[j] >= curr[j-1] means move up
        i--;
      } else {
        j--;
      }
    } else if (i > 1) {
      // prev[j] vs curr[j-1], but j=1
      const row = trace[i - 2];
      if (row[j] >= curr[j - 1]) {
        i--;
      } else {
        j--;
      }
    } else {
      // i=1
      if (j > 1) {
        j--;
      } else {
        break;
      }
    }
  }

  return result;
}

/**
 * 逐行对比两段文本的差异
 *
 * @param oldText 原始文本
 * @param newText 修改后文本
 * @returns DiffLine 数组，按顺序描述每一行的变化
 *
 * @example
 * ```ts
 * const diff = textDiff('a\nb\nc', 'a\nx\nc');
 * // [
 * //   { type: 'equal', content: 'a', oldLineNo: 0, newLineNo: 0 },
 * //   { type: 'remove', content: 'b', oldLineNo: 1, newLineNo: -1 },
 * //   { type: 'add', content: 'x', oldLineNo: -1, newLineNo: 1 },
 * //   { type: 'equal', content: 'c', oldLineNo: 2, newLineNo: 2 },
 * // ]
 * ```
 */
export function textDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // 空文本快速路径
  if (oldLines.length === 1 && oldLines[0] === '' && newLines.length === 1 && newLines[0] === '') {
    return [];
  }

  const lcs = computeLCS(oldLines, newLines);

  const result: DiffLine[] = [];
  let oi = 0; // old line index
  let ni = 0; // new line index
  let li = 0; // lcs pair index

  while (oi < oldLines.length || ni < newLines.length) {
    const [lcsOi, lcsNi] = li < lcs.length ? lcs[li] : [oldLines.length, newLines.length];

    // 在 LCS 对之前的 old lines → remove
    while (oi < lcsOi) {
      result.push({ type: 'remove', content: oldLines[oi], oldLineNo: oi, newLineNo: -1 });
      oi++;
    }

    // 在 LCS 对之前的 new lines → add
    while (ni < lcsNi) {
      result.push({ type: 'add', content: newLines[ni], oldLineNo: -1, newLineNo: ni });
      ni++;
    }

    // LCS 匹配行 → equal
    if (li < lcs.length) {
      result.push({ type: 'equal', content: oldLines[oi], oldLineNo: oi, newLineNo: ni });
      oi++;
      ni++;
      li++;
    }
  }

  return result;
}

/**
 * 获取差异统计信息
 *
 * @param diffLines textDiff 输出的 DiffLine 数组
 * @returns 统计对象
 */
export function diffStats(diffLines: DiffLine[]): {
  added: number;
  removed: number;
  unchanged: number;
} {
  let added = 0;
  let removed = 0;
  let unchanged = 0;

  for (const line of diffLines) {
    if (line.type === 'add') added++;
    else if (line.type === 'remove') removed++;
    else unchanged++;
  }

  return { added, removed, unchanged };
}
