/**
 * useNoteSections — 组折叠记忆 + 展示节/可见序派生（批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 折叠态用**裸键**记忆：`String(groupId)` / `"none"`，localStorage 键
 *              `notes:group-fold:{裸键}`。⚠️ 这与落库用的 scope 键（`g:{id}`，见
 *              noteSectionModel.scopeKey）**不是一回事**——混用会让用户折叠记忆静默
 *              失效，而既有测试每测 `localStorage.clear()` 恰好掩盖它（键派生断言见
 *              components/NoteListView.fold.test.tsx）。
 * @ai-context: 副作用——① 组列表变化时幂等补默认键（缺失才读 localStorage；损坏/无 →
 *              默认展开，try/catch 兜底）；② 折叠态变化时全量写回 localStorage（隐私
 *              模式写失败静默）。展示节与可见序的纯逻辑在 utils/noteSectionModel，
 *              本 hook 只做记忆 + 接线（纯逻辑与副作用物理分离）。
 * @ai-context: 边界——treeMode（无关键词/无标签/默认排序）是拖拽与移动矩阵的总闸；
 *              可见序**排除折叠组行**（L1 审查：与渲染可见一致，Shift 区间选/划选共用）；
 *              sections memo 的 deps 保留 groupFolds（函数体不读它，但移除会改变重算
 *              次数——本批只搬家不优化）。
 */
import { useEffect, useMemo, useState } from "react";
import type { Note, NoteGroup } from "../types";
import type { ThemeMode } from "../utils/colorPalette";
import type { GroupOrderRows } from "../utils/groupOrder";
import { buildSections, buildVisibleOrder, isTreeMode } from "../utils/noteSectionModel";

/** localStorage 折叠记忆键（裸键=group id / "none"） */
const foldStorageKey = (key: string): string => `notes:group-fold:${key}`;

/** 读组折叠记忆（localStorage 损坏/无 → 默认展开） */
function readGroupFold(key: string): boolean {
  try { return window.localStorage.getItem(foldStorageKey(key)) === "1"; } catch { return false; }
}

export interface NoteSectionsInput {
  notes: Note[];
  groups: NoteGroup[];
  keyword: string;
  tagFilter: string | null;
  sortMode: string;
  groupFilter: number | null;
  theme: ThemeMode;
  /** scope → 手排有序 ids（useNoteOrders） */
  manualOrders: Record<string, number[]>;
  /** 组手排序行（树组头排序消费；useNoteOrders） */
  groupOrderRows: GroupOrderRows;
}

export function useNoteSections({
  notes, groups, keyword, tagFilter, sortMode, groupFilter, theme, manualOrders, groupOrderRows,
}: NoteSectionsInput) {
  // 组折叠态
  const [groupFolds, setGroupFolds] = useState<Record<string, boolean>>({});

  // 折叠初始值（沿用 v0.15）
  useEffect(() => {
    setGroupFolds((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const g of groups) {
        const key = String(g.id);
        if (!(key in next)) { next[key] = readGroupFold(key); changed = true; }
      }
      if (!("none" in next)) { next.none = readGroupFold("none"); changed = true; }
      return changed ? next : cur;
    });
  }, [groups]);
  useEffect(() => {
    try {
      for (const [k, v] of Object.entries(groupFolds)) window.localStorage.setItem(foldStorageKey(k), v ? "1" : "0");
    } catch { /* 隐私模式 */ }
  }, [groupFolds]);

  const toggleGroupFold = (key: string) => setGroupFolds((cur) => ({ ...cur, [key]: !cur[key] }));

  // ── 分组树数据（同 v0.15 结构）——可见序统一从本结构生成 ──
  // Why 不再有分桶 memo：旧 `grouped` 是死载荷——仅被当作 treeMode 的第二真值，
  // 其 ungrouped/byGroup 从未被读取（真分桶一直在 sections 内重算）；批 0-C2 去重
  const treeMode = isTreeMode(keyword, tagFilter, sortMode);

  // 显示节（树/平铺）——节内展示序/分桶/accent 全在 utils/noteSectionModel.buildSections
  // deps 保留 groupFolds：函数体不读它，但移除会改变重算次数（本批只搬家不优化）
  const sections = useMemo(
    () => buildSections({ notes, groups, groupFilter, theme, treeMode, manualOrders, groupOrderRows }),
    [treeMode, groups, notes, groupFolds, manualOrders, theme, groupFilter, groupOrderRows],
  );

  // 可见序（L1 审查：折叠组行不参与区间/划选——与渲染可见一致；折叠组头仍在）
  const visibleOrder = useMemo(() => buildVisibleOrder(sections, groupFolds), [sections, groupFolds]);

  // toggleGroupFold 保持普通函数（非 useCallback）：消费点（组头 onToggleFold、可见序
  // 重算）本就是内联箭头，包装反而改变引用语义——纯搬运不加装饰
  return { treeMode, sections, visibleOrder, groupFolds, toggleGroupFold };
}
