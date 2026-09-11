/**
 * NoteListView — 笔记页中部列表**编排层**：搜索/标签/排序 + 列表（REQ-287 v0.19.7 重构；
 * 批 0-C2 Task 2 拆分：654 → 230 行，逻辑下沉 hook、展示下沉组件）。
 *
 * @ai-context: 交互矩阵落地（§2.6/2.9）——行内 checkbox 移除：多选三通道
 *              （Ctrl/⌘+单击=加/减、Shift+单击=按列表位置区间、工具栏「选择」
 *              批量模式行单击=勾选，Esc/完成退出）；拖拽矩阵（组头/组行双
 *              drop、同 scope 行间落点=手动排序自动启用快照、自动排序组禁入
 *              位置语义只做归组、搜索/标签平铺禁排序拖拽）；组头空白=划选
 *              锚点（区间=组内自首行至当前行带）；批量栏=删除+移动到组；
 *              右键=选集批处理（删除/移动）或单行既有菜单。手动序落库
 *              note_orders（scope=g{id}/none），父层只经 onNoteMoved 重载数据。
 * @ai-context: 树序范围：全局可见序（树=未分组+各组顺次、折叠组行不参与）为
 *              区间/划选唯一基准；跨组语义=归组（目标手排时按落点插入）。
 * @ai-context: 模块边界（本文件只做装配——状态与副作用的唯一宿主在各拆件，改行为
 *              请改对应文件）——
 *              · 节模型/可见序/scope 键/裸折叠键/手动底序 → `utils/noteSectionModel`
 *              · 折叠记忆 + 展树数据接线 → `hooks/useNoteSections`
 *              · 序行 store（拉取/整表覆写/回自动）→ `hooks/useNoteOrders`
 *              · 拖拽/移动三入口 + **共用并发锁 dropBusyRef** → `hooks/useNoteMoves`
 *              · 多选三通道 + 菜单三态 + 唯一 Esc handler → `hooks/useNoteListSelection`
 *              · 划选（window 监听 + elementFromPoint 行命中）→ `hooks/useNoteMarquee`
 *              · 展示件 → `components/NoteListToolbar | NoteListBody | NoteListBatchMenu`
 * @ai-context: 公共 API 冻结（勿改）：default export · `export type SortMode` ·
 *              再导出 `{ parseTags, fmtDate }`（NoteReadingView / parseTags.test 依赖）。
 */
import { useCallback, useMemo } from "react";
import type { Note, NoteGroup } from "../types";
import type { ThemeMode } from "../utils/colorPalette";
// 批 0-C2：展示节/可见序纯函数层（含 scope 键与裸折叠键派生——纯逻辑与副作用分离）
import { manualBaseIds, scopeKey } from "../utils/noteSectionModel";
// 批 0-C2：序行 store（笔记手排序行 + 组手排序行）——兑现既有登记拆分计划
import { useNoteOrders } from "../hooks/useNoteOrders";
// 批 0-C2：折叠记忆（裸键）+ 展树数据接线（treeMode/sections/visibleOrder）
import { useNoteSections } from "../hooks/useNoteSections";
// 批 0-C2：拖拽/移动三入口接线（共享一把行落点并发锁——硬性同文件约束）
import { useNoteMoves } from "../hooks/useNoteMoves";
// 批 0-C2：多选三通道 + 菜单三态 + 唯一 Esc handler（可见序镜像同文件）
import { useNoteListSelection } from "../hooks/useNoteListSelection";
// 批 0-C2：划选（组头空白起手；window 监听 + elementFromPoint 命中——整块搬迁）
import { useNoteMarquee } from "../hooks/useNoteMarquee";
// 批 0-C2：展示件（列表体 / 顶栏 / 批量栏与选集菜单）——纯透传适配器，逻辑在 hook
import NoteListBody from "./NoteListBody";
import NoteListToolbar from "./NoteListToolbar";
import { NoteListBatchBar, NoteListBatchContextMenu } from "./NoteListBatchMenu";
import NoteRowContextMenu from "./NoteRowContextMenu";

// 兼容既有导入面（NoteReadingView/NotesPage/parseTags.test 从此解析——v0.15 移厝 utils）
export { parseTags, fmtDate } from "../utils/noteHelpers";

export type SortMode = "updated-desc" | "pin-first" | "created-desc";

interface Props {
  width?: number;
  notes: Note[];
  groups?: NoteGroup[];
  groupFilter?: number | null;
  onGroupFilterChange?: (id: number | null) => void;
  keyword: string;
  tagFilter: string | null;
  sortMode: SortMode;
  allTags: string[];
  selectedId: number | null;
  status: string;
  noteColors?: Record<number, string | null>;
  tagColors?: Record<string, string>;
  onKeywordChange: (kw: string) => void;
  onTagFilterChange: (tag: string | null) => void;
  onSortModeChange: (mode: SortMode) => void;
  onSelect: (note: Note) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionId: number) => void;
  onBatchDelete: (ids: number[]) => Promise<boolean>;
  onNotePinToggle?: (note: Note) => void;
  onNoteEdit?: (note: Note) => void;
  onNoteDelete?: (note: Note) => void;
  onNoteMoved?: () => void;
  /** REQ-316（批 7）：移组触发空组自动清理 → 上抛组标题（父层 toast 留痕） */
  onCleanNotice?: (groupNames: string[]) => void;
  onCollapse?: () => void;
  /** 外部重载令牌（NotesPage refreshToken——侧栏手排/置顶/回自动经 onChanged
   *  递增；本组件据此重拉组序行与笔记序行，树组头与侧栏保持同序） */
  refreshToken?: number;
}

export default function NoteListView({
  width = 320, notes, groups = [], groupFilter = null, onGroupFilterChange,
  keyword, tagFilter, sortMode, allTags, selectedId, status,
  noteColors, tagColors,
  onKeywordChange, onTagFilterChange, onSortModeChange, onSelect, onCreate, onRefresh, onOpenSession, onBatchDelete,
  onNotePinToggle, onNoteEdit, onNoteDelete, onNoteMoved, onCleanNotice, onCollapse,
  refreshToken = 0,
}: Props) {
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );

  // 序行 store（笔记手排序行 + 组手排序行）——装载/保存路径下沉 hooks/useNoteOrders
  // （依赖 refreshToken 的理由随实现搬至该 hook 头注释：审查 P2-10 的令牌重拉）
  const { manualOrders, groupOrderRows, saveOrder, resetOrder } = useNoteOrders(refreshToken);

  // 折叠记忆 + 展树数据（treeMode 总闸 / sections 展示节 / visibleOrder 全局可见序）
  // —— 裸键折叠记忆与纯函数派生见 hooks/useNoteSections + utils/noteSectionModel
  const { treeMode, sections, visibleOrder, groupFolds, toggleGroupFold } = useNoteSections({
    notes, groups, keyword, tagFilter, sortMode, groupFilter, theme, manualOrders, groupOrderRows,
  });

  // ── 行交互 / 多选 / 菜单（Esc 优先级链、可见序镜像、选集裁剪）——见 hooks/useNoteListSelection
  const {
    selection, setSelection, selectionMode, setSelectionMode,
    contextMenu, setContextMenu, batchMenu, setBatchMenu, batchMoveOpen, setBatchMoveOpen,
    clearSelection, exitBatch, handleOpen, handleModifierClick, openRowContextMenu,
    closeBatchMenu, batchDelete,
  } = useNoteListSelection({ notes, visibleOrder, onSelect, onBatchDelete });

  /** scope 手动底序（REQ-315）：可见展示序去掉置顶区（快照只写本子序列）——纯函数在 noteSectionModel */
  const manualBaseOf = useCallback((scope: string): number[] | null => manualBaseIds(sections, scope), [sections]);

  // 拖拽/移动三入口（归组 / 组内上移下移 / 行间落点）——共享一把并发锁，见 hooks/useNoteMoves
  const { busyMove, moveToGroup, moveWithinScope, handleDropOnRow } = useNoteMoves({
    notes, treeMode, manualOrders, manualBaseOf, saveOrder, onNoteMoved, onCleanNotice, closeBatchMenu,
  });

  // 划选（组头空白起手：window 四路监听 + elementFromPoint 行命中）——整块搬迁见 hooks/useNoteMarquee
  const { startMarquee } = useNoteMarquee({ sections, visibleOrder, groupFolds, setSelection });

  /**
   * 右键菜单「上移/下移」可用性（REQ-315）：仅树视图 scope 上下文开放（交互矩阵：
   * 平铺/搜索/标签/非默认排序禁移动——移动=scope 级手排快照，过滤结果是子集非
   * 完整 scope）。置顶项 idx=-1 双禁用（提示语由菜单按 note.pin 呈现）。
   */
  const orderActions = useMemo(() => {
    if (!contextMenu || !treeMode) return null;
    const note = contextMenu.note;
    const base = manualBaseOf(scopeKey(note.group_id ?? null));
    if (!base) return null;
    const idx = base.indexOf(note.id);
    return {
      canMoveUp: idx > 0,
      canMoveDown: idx >= 0 && idx < base.length - 1,
      move: (n: Note, dir: 1 | -1) => void moveWithinScope(n, dir),
    };
  }, [contextMenu, treeMode, manualBaseOf, moveWithinScope]);

  return (
    <div style={{ width, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minWidth: 0 }}>
      <NoteListToolbar
        selectionMode={selectionMode}
        selectionCount={selection.size}
        onToggleBatchMode={() => (selectionMode ? exitBatch() : setSelectionMode(true))}
        onCreate={onCreate}
        onCollapse={onCollapse}
        keyword={keyword}
        onKeywordChange={onKeywordChange}
        onRefresh={onRefresh}
        sortMode={sortMode}
        onSortModeChange={onSortModeChange}
        allTags={allTags}
        tagFilter={tagFilter}
        onTagFilterChange={onTagFilterChange}
      />

      <NoteListBody
        sections={sections}
        notes={notes}
        groupFolds={groupFolds}
        groupFilter={groupFilter}
        manualOrders={manualOrders}
        selection={selection}
        selectedId={selectedId}
        theme={theme}
        noteColors={noteColors}
        tagColors={tagColors}
        onOpen={handleOpen}
        onModifierClick={handleModifierClick}
        onDropOnRow={handleDropOnRow}
        onContextMenu={openRowContextMenu}
        onOpenSession={onOpenSession}
        onGroupFilterChange={onGroupFilterChange}
        onToggleFold={toggleGroupFold}
        onResetManual={resetOrder}
        onDropNotes={moveToGroup}
        onMarqueeStart={startMarquee}
      />

      {/* 批量操作栏（去勾选框后的批量入口：删除 + 移动到组；选择模式下同样可用） */}
      {selection.size > 0 && (
        <NoteListBatchBar
          count={selection.size}
          selectionMode={selectionMode}
          onMoveToGroup={() => setBatchMenu({ ids: [...selection], x: 0, y: 0 })}
          onDelete={() => void (async () => { if (await onBatchDelete([...selection])) clearSelection(); })()}
          onDone={exitBatch}
          onCancel={clearSelection}
        />
      )}

      {status && <p style={{ padding: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}

      {/* 单行右键菜单（既有） */}
      {contextMenu && onNotePinToggle && onNoteEdit && onNoteDelete && onNoteMoved && (
        <NoteRowContextMenu
          note={contextMenu.note}
          groups={groups}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onPinToggle={onNotePinToggle}
          onEdit={onNoteEdit}
          onDelete={onNoteDelete}
          onMoved={onNoteMoved}
          onCleanNotice={onCleanNotice}
          // REQ-315：树视图才显 上移/下移（平铺态禁移动——orderActions 为 null）
          onMoveWithinScope={orderActions?.move}
          canMoveUp={orderActions?.canMoveUp ?? false}
          canMoveDown={orderActions?.canMoveDown ?? false}
        />
      )}

      {/* 选集批处理菜单（删除/移动到组）——受控：菜单态与 Esc 链在 useNoteListSelection */}
      {batchMenu && (
        <NoteListBatchContextMenu
          ids={batchMenu.ids}
          x={batchMenu.x}
          y={batchMenu.y}
          moveOpen={batchMoveOpen}
          groups={groups}
          busyMove={busyMove}
          onClose={() => { setBatchMenu(null); setBatchMoveOpen(false); }}
          onOpenMove={() => setBatchMoveOpen(true)}
          onDelete={() => void batchDelete()}
          onClearSelection={() => { setBatchMenu(null); clearSelection(); }}
          onMoveToGroup={(groupId) => void moveToGroup(batchMenu.ids, groupId)}
          onBack={() => setBatchMoveOpen(false)}
        />
      )}
    </div>
  );
}
