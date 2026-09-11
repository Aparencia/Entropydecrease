/**
 * NoteListBody — 笔记列表体（滚动容器 + 节/行装配；批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 展示适配器——只做「透传 + 一层组合」，**不含业务逻辑**（逻辑在
 *              hooks/useNoteSections、useNoteMoves、useNoteListSelection 与
 *              utils/noteSectionModel）。行 id / data-testid 契约由 NoteListRow 与
 *              NoteTreeSection 承载，本文件不新增 DOM 属性、不改文案。
 * @ai-context: 硬点——① 行色条 accent 由 paletteHex(noteColors[id], theme) 现场解析
 *              （与拆分前同一表达式）；② 平铺分支渲染 `notes.map(renderRow)` 而
 *              树分支渲染 `sec.items.map(renderRow)` —— 二者今日等价（flat 节的 items
 *              就是 notes），**勿"顺手统一"**（`sec.items` 走的是 orderScopeNotes 短路，
 *              改动会牵动重排语义）；③ 折叠只由 NoteTreeSection 的 folded 决定，
 *              本文件不裁剪 sec.items。
 * @ai-context: 边界——无副作用、无内部状态；空态（无节）渲染「暂无笔记」与拆分前同款。
 */
import type { Note } from "../types";
import type { ThemeMode } from "../utils/colorPalette";
import { paletteHex } from "../utils/colorPalette";
import type { SectionData } from "../utils/noteSectionModel";
import NoteListRow from "./NoteListRow";
import NoteTreeSection from "./NoteTreeSection";

interface Props {
  /** 展示节（树=未分组+各组顺次；平铺=单 flat 节） */
  sections: SectionData[];
  /** 平铺分支的行源（经备注 ② —— 故意不用 sec.items） */
  notes: Note[];
  /** 折叠态（裸键：`String(groupId)` / `"none"`） */
  groupFolds: Record<string, boolean>;
  groupFilter: number | null;
  /** scope → 手排有序 ids（组头「手排 ↺」徽标判据） */
  manualOrders: Record<string, number[]>;
  selection: ReadonlySet<number>;
  selectedId: number | null;
  theme: ThemeMode;
  noteColors?: Record<number, string | null>;
  tagColors?: Record<string, string>;
  /** 行单击（批量模式下由 hook 改判勾选） */
  onOpen: (note: Note) => void;
  /** Ctrl/⌘=加减选；Shift=可见序区间选 */
  onModifierClick: (note: Note, ctrl: boolean, shift: boolean) => void;
  /** 行间落点（组内手动排序；钩子在父层判定启用/禁入） */
  onDropOnRow: (ids: number[], targetId: number, before: boolean) => void;
  /** 行右键（父层按多选语义分派单行菜单 / 选集菜单） */
  onContextMenu: (e: React.MouseEvent, note: Note) => void;
  onOpenSession: (sessionId: number) => void;
  /** 组名点击=过滤切换（父层裁决 决策 1 语义） */
  onGroupFilterChange?: (id: number | null) => void;
  /** 组折叠翻转（裸键） */
  onToggleFold: (key: string) => void;
  /** 一键回自动排序（清 note_orders scope） */
  onResetManual: (scope: string) => void;
  /** 拖入组头 → 归组 */
  onDropNotes: (ids: number[], groupId: number | null) => void;
  /** 组头空白按下 → 划选起点 */
  onMarqueeStart: (scope: string) => void;
}

export default function NoteListBody({
  sections, notes, groupFolds, groupFilter, manualOrders, selection, selectedId, theme,
  noteColors, tagColors, onOpen, onModifierClick, onDropOnRow, onContextMenu, onOpenSession,
  onGroupFilterChange, onToggleFold, onResetManual, onDropNotes, onMarqueeStart,
}: Props) {
  const rowAccent = (n: Note) => paletteHex(noteColors?.[n.id] ?? null, theme);

  const renderRow = (n: Note) => (
    <NoteListRow
      key={n.id}
      note={n}
      accent={rowAccent(n)}
      openId={selectedId}
      multiSelected={selection.has(n.id)}
      tagColors={tagColors}
      onOpen={onOpen}
      onModifierClick={onModifierClick}
      dragIds={selection.size > 0 && selection.has(n.id) ? [...selection] : []}
      onDropOnRow={onDropOnRow}
      onOpenSession={onOpenSession}
      onContextMenu={onContextMenu}
    />
  );

  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      {sections.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 24 }}>暂无笔记</p>}
      {sections.map((sec) => (
        sec.scope === "flat" ? (
          <div key="flat">{notes.map(renderRow)}</div>
        ) : (
          <NoteTreeSection
            key={sec.scope}
            title={sec.title}
            count={sec.items.length}
            accent={sec.accent}
            active={sec.groupId === null ? groupFilter === null : groupFilter === sec.groupId}
            folded={groupFolds[sec.groupId == null ? "none" : String(sec.groupId)] === true}
            onToggleFold={() => onToggleFold(sec.groupId == null ? "none" : String(sec.groupId))}
            onSelectTitle={() => onGroupFilterChange?.(sec.groupId === null ? null : (groupFilter === sec.groupId ? null : sec.groupId))}
            manual={!!manualOrders[sec.scope]}
            onResetManual={() => onResetManual(sec.scope)}
            onDropNotes={(ids) => onDropNotes(ids, sec.groupId)}
            onMarqueeStart={() => onMarqueeStart(sec.scope)}
          >
            {sec.items.map(renderRow)}
          </NoteTreeSection>
        )
      ))}
    </div>
  );
}
