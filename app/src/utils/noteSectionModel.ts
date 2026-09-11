/**
 * noteSectionModel — 笔记列表「展示节 / 可见序」纯函数层（批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 树视图展示结构的唯一来源（REQ-287/315）。节 = 未分组（有成员或未按组
 *              过滤时恒在）+ 各组（空组不产节；组头序与组侧栏同规则 orderGroups＝
 *              置顶→手排→自动）；scope 键 `none`/`g:{id}` 与 Rust 侧 note_orders.scope
 *              字符串契约绑定。
 * @ai-context: 全局可见序 = 各节成员顺次拼接，**折叠组行排除**（与渲染可见一致——
 *              Shift 区间选与划选的唯一基准；折叠组头本身仍在）。折叠键是**裸键**
 *              （`String(groupId)`/`"none"`，见 foldKeyOf），**不是** scope 键：误用
 *              scope 键会让用户折叠记忆静默失效（localStorage 键 `notes:group-fold:{裸键}`）。
 * @ai-context: 边界——节内展示序 scope==="flat" 时保持后端排序原样（平铺是过滤结果、
 *              非完整 scope，不做 scope 级重排）；其余走 orderScopeNotes。本模块纯函数、
 *              无 React 依赖、无副作用（配单测 utils/noteSectionModel.test.ts）。
 */
import type { Note, NoteGroup } from "../types";
import { paletteHex } from "./colorPalette";
import type { ThemeMode } from "./colorPalette";
import { orderScopeNotes } from "./noteOrder";
import { orderGroups } from "./groupOrder";
import type { GroupOrderRows } from "./groupOrder";

/** scope 键（组/null=未分组）——落库 note_orders 时使用的 scope 字面量 */
export const scopeKey = (groupId: number | null): string => (groupId == null ? "none" : `g:${groupId}`);

/** 折叠键（裸 group id / "none"）——折叠记忆与可见序共用的唯一派生 */
export const foldKeyOf = (groupId: number | null): string => (groupId == null ? "none" : String(groupId));

/** 树模式判据（无关键词、无标签、默认排序）——拖拽/移动矩阵总闸 */
export const isTreeMode = (keyword: string, tagFilter: string | null, sortMode: string): boolean =>
  keyword.trim() === "" && tagFilter === null && sortMode === "updated-desc";

/** 展示节：scope 键 + 组信息 + 组内展示序成员 */
export interface SectionData {
  scope: string;
  groupId: number | null;
  title: string;
  accent: string;
  items: Note[];
}

/** buildSections 入参（展示节的全部数据源＝原 useMemo 的依赖集） */
export interface SectionInput {
  notes: Note[];
  groups: NoteGroup[];
  groupFilter: number | null;
  theme: ThemeMode;
  treeMode: boolean;
  /** scope → 手排有序 ids（useNoteOrders 提供） */
  manualOrders: Record<string, number[]>;
  /** 组手排序行（树组头排序消费） */
  groupOrderRows: GroupOrderRows;
}

/**
 * scope 展示序（REQ-315）：置顶区（updated_at 降序）→ 手排 seq → 自动区；
 * 平铺（scope=flat）保持后端排序原样（排序模式语义在后端 list_notes——
 * 平铺是过滤结果非完整 scope，不做 scope 级重排）。
 */
function orderSectionItems(items: Note[], scope: string, manualOrders: Record<string, number[]>): Note[] {
  return scope === "flat" ? items : orderScopeNotes(items, manualOrders[scope]);
}

/**
 * 展示节（树=未分组+各组顺次；平铺=单 flat 节）。
 * @ai-context: 分桶只做一次——原实现的 `grouped` memo 是死载荷（仅当 treeMode 真值用，
 *              其 ungrouped/byGroup 从未被读取；批 0-C2 去重，输出不变）。
 */
export function buildSections(input: SectionInput): SectionData[] {
  const { notes, groups, groupFilter, theme, treeMode, manualOrders, groupOrderRows } = input;
  const mk = (scope: string, groupId: number | null, title: string, accent: string, items: Note[]): SectionData =>
    ({ scope, groupId, title, accent, items: orderSectionItems(items, scope, manualOrders) });
  const out: SectionData[] = [];
  if (treeMode) {
    const ungrouped: Note[] = [];
    const byGroup = new Map<number, Note[]>();
    for (const n of notes) {
      if (n.group_id == null) ungrouped.push(n);
      else { const a = byGroup.get(n.group_id) ?? []; a.push(n); byGroup.set(n.group_id, a); }
    }
    // 折叠只影响 body（folded prop）——组头必须常驻（chevron 再点可展开）
    if (ungrouped.length > 0 || groupFilter === null) {
      out.push(mk("none", null, "未分组", paletteHex(null, theme), ungrouped));
    }
    // REQ-315：组头序与组侧栏同规则（置顶→手排→自动）——组置顶在树面可见生效
    const orderedGroups = orderGroups(groups, groupOrderRows);
    for (const g of orderedGroups) {
      const items = byGroup.get(g.id) ?? [];
      if (items.length === 0) continue;
      out.push(mk(scopeKey(g.id), g.id, g.name, paletteHex(g.color ?? null, theme), items));
    }
  } else {
    out.push(mk("flat", null, "", paletteHex(null, theme), notes));
  }
  return out;
}

/** 全局可见序（L1 审查：折叠组行不参与区间/划选——与渲染可见一致；折叠组头仍在） */
export function buildVisibleOrder(sections: readonly SectionData[], groupFolds: Record<string, boolean>): number[] {
  const out: number[] = [];
  for (const sec of sections) {
    const key = foldKeyOf(sec.groupId);
    if (groupFolds[key] === true) continue; // 折叠=行不可见，排除出选择语义
    for (const n of sec.items) out.push(n.id);
  }
  return out;
}

/**
 * scope 手动底序（REQ-315）：可见展示序去掉置顶区——置顶笔记由 pin 列置顶区
 * 表达（按更新时间定序），不占手动位；快照只写本子序列。
 */
export function manualBaseIds(sections: readonly SectionData[], scope: string): number[] | null {
  const section = sections.find((s) => s.scope === scope);
  if (!section) return null;
  return section.items.filter((n) => n.pin !== 1).map((n) => n.id);
}
