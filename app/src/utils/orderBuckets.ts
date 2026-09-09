/**
 * 排序桶核心纯函数（REQ-315，v0.20.11 批 6）。
 *
 * @ai-context: 置顶/手排/自动三桶规则是笔记与笔记组的**同一套展示语义**：
 *              置顶区（pin=1，区内按更新时间降序）→ 手动序区（显式 seq 升序）→
 *              自动区（其余按更新时间降序）。时间字段命名在 notes/note_groups 间
 *              不同（updated_at / updatedAt）——核心函数经 accessor 注入，命名
 *              差异不扩散。置顶区不消费显式 seq：置顶项位置由更新时间表达（置顶
 *              动作会刷新 updated_at，见命令层），手动移动只作用于置顶区之外的
 *              子序列。
 * @ai-context: LRU 边界：排序函数不含 recency 浮顶——组侧栏「最近使用」是独立
 *              快捷区（GroupSidebar 自持），recency 从不重排分区内组序，故置顶/
 *              手排组天然不受最近使用位移（授权语义取最小一致改法）。
 */

/** 参与排序的最小形状（pin 缺失=0——旧 mock/数据兼容） */
export interface BucketOrderable {
  id: number;
  pin?: number;
}

/**
 * 按 置顶→手动 seq→自动(时间降序) 三桶重排。
 *
 * @ai-context: 桶内用**稳定排序**——并列（同 updated_at/同 seq）保持输入序：
 * 树/列表的输入序来自后端（updated_at 降序、同刻按插入序），稳定排序零额外
 * 摆动；跨 kind 整表调用遇 seq 撞值同样回落输入序（确定性=输入确定时确定）。
 */
export function orderPinnedSeqAuto<T extends BucketOrderable>(
  list: readonly T[],
  seq: ReadonlyMap<number, number>,
  updatedOf: (t: T) => number,
): T[] {
  const pinned: T[] = [];
  const manual: { item: T; s: number }[] = [];
  const auto: T[] = [];
  for (const t of list) {
    if (t.pin === 1) {
      pinned.push(t);
    } else {
      const s = seq.get(t.id);
      if (s !== undefined) manual.push({ item: t, s });
      else auto.push(t);
    }
  }
  const byUpdated = (a: T, b: T) => updatedOf(b) - updatedOf(a);
  pinned.sort(byUpdated);
  manual.sort((a, b) => a.s - b.s);
  auto.sort(byUpdated);
  return [...pinned, ...manual.map((m) => m.item), ...auto];
}

/** 取列表中未置顶成员（保持给定顺序）——手动移动/快照的合法作用域。 */
export function nonPinnedIds<T extends BucketOrderable>(ordered: readonly T[]): number[] {
  const out: number[] = [];
  for (const t of ordered) if (t.pin !== 1) out.push(t.id);
  return out;
}

/**
 * 显式序列表内上移/下移（纯函数：只换位不落库）。
 *
 * @ai-context: 入参必须是调用方算好的「可移动子序列」——置顶项不在其中
 *              （置顶区按更新时间定序，手动移动不作用于置顶项，语义见文件头）。
 * @returns 换位后的新列表；越界/找不到返回 null（UI 据此禁用按钮）。
 */
export function shiftInList(ids: readonly number[], id: number, dir: 1 | -1): number[] | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  const j = i + dir;
  if (j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * 拖拽落点插入（移出 moved 后按锚点定位）。
 *
 * @ai-context: 锚点落在置顶行上时=置顶区下沿（手动区首位）——置顶区不接受
 *              插入（位置由更新时间定序），用 { head: true } 表达同一意图；
 *              目标不可见（折叠/已消失）返回 null，调用方跳过保存。
 */
export function dropIntoList(
  ids: readonly number[],
  movedIds: readonly number[],
  anchor: { targetId: number; before: boolean } | { head: true },
): number[] | null {
  if ("head" in anchor) {
    const rest = ids.filter((id) => !movedIds.includes(id));
    rest.splice(0, 0, ...movedIds);
    return rest;
  }
  const rest = ids.filter((id) => !movedIds.includes(id));
  const i = rest.indexOf(anchor.targetId);
  if (i < 0) return null;
  rest.splice(anchor.before ? i : i + 1, 0, ...movedIds);
  return rest;
}
