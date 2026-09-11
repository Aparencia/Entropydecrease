/**
 * useNoteMarquee — 组头空白起手的划选（批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 划选（REQ-287）：组头空白 pointerdown → 起点 = 组内首行在**全局可见序**
 *              中的位次 → 指针当前命中的行带区间（含两端）写入选集。命中判定是
 *              `document.elementFromPoint` → `closest('[id^="note-row-"]')` →
 *              `Number(id.replace("note-row-", ""))` —— **隐式依赖 NoteListRow 的行 id
 *              契约**（两端均无类型保障，改动任一侧即静默失效）。这块是**零自动化覆盖**
 *              区域（jsdom 无真实命中），故判定式与语句顺序**逐字不动**。
 * @ai-context: 生命周期（L9 审查修复的泄漏点，整块搬迁）：window 级 pointermove /
 *              pointerup / pointercancel / blur **四路监听必须成对注销**；rAF 节流
 *              （每帧最多一次命中判定）；`e.buttons === 0` 是"窗口外松手"兜底。
 *              `cleanup` 定义在 `onMove` 之后却被 `onMove` 提前引用（闭包安全）——
 *              **不要重排语句顺序、不要"优化"成 useEffect**。
 * @ai-context: 边界——折叠组行不可见，不提供划选起点（避免选中不可见数据）；区间只取
 *              可见序切片，折叠组行天然被排除；起点行不在可见序内（异常）整体失效。
 */
import { useCallback } from "react";
import type { SectionData } from "../utils/noteSectionModel";

export interface NoteMarqueeInput {
  /** 展示节（按 scope 找起点组；useNoteSections 产出） */
  sections: SectionData[];
  /** 全局可见序（起点位次与区间切片的唯一基准） */
  visibleOrder: number[];
  /** 折叠态（裸键——折叠组禁划选起点） */
  groupFolds: Record<string, boolean>;
  /** 划选写入选集（useNoteListSelection.setSelection） */
  setSelection: (next: Set<number>) => void;
}

export function useNoteMarquee({ sections, visibleOrder, groupFolds, setSelection }: NoteMarqueeInput) {
  /** 划选（组头空白起 → 组内首行至当前行带；走既有行命中的全局可见序）。
   *  L9 审查修正：rAF 节流 + pointercancel/blur/松开（buttons=0）即清理——
   *  不再有"窗口外释放后监听永久残留、悬停任意行改写选区"的泄漏。 */
  const startMarquee = useCallback((scope: string) => {
    // 折叠组行不可见——不提供划选起点（避免选中不可见数据）
    const foldKey = scope === "none" ? "none" : scope.slice(2);
    if (groupFolds[foldKey] === true) return;
    const section = sections.find((s) => s.scope === scope);
    if (!section || section.items.length === 0) return;
    const startGlobal = visibleOrder.indexOf(section.items[0].id);
    if (startGlobal < 0) return;

    let raf = 0;
    const hit = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const rowEl = el?.closest<HTMLElement>('[id^="note-row-"]');
      if (!rowEl) return;
      const id = Number(rowEl.id.replace("note-row-", ""));
      const gi = visibleOrder.indexOf(id);
      if (gi < 0) return;
      const lo = Math.min(startGlobal, gi);
      const hi = Math.max(startGlobal, gi);
      setSelection(new Set(visibleOrder.slice(lo, hi + 1)));
    };
    const onMove = (e: PointerEvent) => {
      if (e.buttons === 0) { cleanup(); return; }
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; hit(e); });
    };
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      window.removeEventListener("blur", cleanup);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    window.addEventListener("blur", cleanup);
  }, [sections, visibleOrder, groupFolds, setSelection]);

  return { startMarquee };
}
