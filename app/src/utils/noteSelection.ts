/**
 * noteSelection — 笔记列表多选纯逻辑（REQ-287，v0.19.7）。
 *
 * @ai-context: 交互矩阵——去行内 checkbox：Ctrl/Shift+单击多选（Ctrl=加/减单
 *              id；Shift=首尾区间并集）、「批量选择」模式下行单击=勾选；行
 *              列顺序（树视图含组序）由调用方以 orderedIds 传入，区间语义
 *              锚定**列表位置**而非 id 大小。全部纯函数可单测。
 */

/** Ctrl+单击：切换单个 id 成员资格 */
export function toggleSelection(prev: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Shift+单击：anchor→target 连续区间并入（含两端；目标不在序内=仅目标） */
export function rangeSelection(
  prev: ReadonlySet<number>,
  orderedIds: readonly number[],
  anchor: number | null,
  target: number,
): Set<number> {
  const next = new Set(prev);
  const pos = new Map<number, number>();
  orderedIds.forEach((id, i) => pos.set(id, i));
  const b = pos.get(target);
  if (b == null) {
    next.add(target);
    return next;
  }
  const a = anchor != null ? pos.get(anchor) : null;
  const [lo, hi] = a == null || a === b
    ? [b, b]
    : a < b ? [a, b] : [b, a];
  for (let i = lo; i <= hi; i += 1) next.add(orderedIds[i]);
  return next;
}

/** 批量选择模式 / 修饰键外的行单击：单选（不并集） */
export function singleSelection(_prev: ReadonlySet<number>, id: number): Set<number> {
  return new Set([id]);
}

/** 全选当前可见 / 清空 */
export function selectAll(ids: readonly number[]): Set<number> {
  return new Set(ids);
}

export function emptySelection(): Set<number> {
  return new Set();
}
