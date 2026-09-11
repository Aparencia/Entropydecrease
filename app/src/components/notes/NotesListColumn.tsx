/**
 * NotesListColumn — 笔记页中部列（收件箱 ↔ 笔记列表原位切换 + 列拖拽手柄）。
 *
 * @ai-context: 本文件是**展示适配器**（自 NotesPage 拆分，行为不变）：只做「三形态
 *              互斥切换 + 全量过滤态透传」，**不含业务逻辑** —— 列表数据与刷新在
 *              `useNotesListData`，删除/批量删在 `useNotesBatchActions`，升笔记后的
 *              打开动作（清过滤态 + 重载）由页面经 onPromoted 注入。
 * @ai-context: prop 分组——
 *              ① 列状态与形态：listCol（useColumnLayout("notes-list")）/ view
 *              ② 刷新链路：onChanged（组/碎片变更）/ onCleanNotice（空组清理留痕）
 *                 / onPromoted（碎片升笔记成功 → 页面打开新笔记闭环）
 *              ③ NoteListView 全量透传：列表数据（notes/groups/…/tagColors/status/
 *                 refreshToken）与全部交互回调
 * @ai-context: DOM 边界——顶层**必须**返回 **fragment**：`ColumnBar` / `NoteListView`
 *              的折叠窄条 / 列表本体是页面根 flex 容器的直接子元素，且
 *              `ColumnResizer` 在**三形态条件之外**（折叠态也渲染——拖拽手柄不得
 *              被带进条件分支）；多包一层会改变三栏宽度分配。
 * @ai-context: 等价红线——三形态的**同级顺序**（折叠窄条 → 收件箱 → 笔记列表）
 *              与图标/标题文案逐字保留；`ColumnResizer` 的 onResize/onReset 直接
 *              取自 listCol（勿改列状态键名与 min/max）。
 */
import type { Note, NoteGroup } from "../../types";
import type { SortMode } from "../NoteListView";
import type { ColumnLayout } from "../../hooks/useColumnLayout";
import NoteListView from "../NoteListView";
import FeedFragmentList from "../FeedFragmentList";
import ColumnBar from "../ColumnBar";
import ColumnResizer from "../ColumnResizer";

interface Props {
  /** 中部列状态（页面 useColumnLayout("notes-list")） */
  listCol: ColumnLayout;
  /** 中部视图：notes=笔记列表；inbox=收件箱碎片（折叠态优先于两者） */
  view: "notes" | "inbox";
  /** 组/碎片变更后的刷新（组侧栏与收件箱共用） */
  onChanged: () => void;
  /** 空组清理留痕上抛（父层 toast） */
  onCleanNotice: (groupNames: string[]) => void;
  /** 碎片升笔记成功 → 页面打开新笔记（闭环）+ 清搜索/标签/组过滤 + 重载 */
  onPromoted: (note: Note) => void;
  // ── NoteListView 透传（列表数据） ──
  notes: Note[];
  groups?: NoteGroup[];
  groupFilter: number | null;
  keyword: string;
  tagFilter: string | null;
  sortMode: SortMode;
  allTags: string[];
  selectedId: number | null;
  status: string;
  noteColors?: Record<number, string | null>;
  tagColors?: Record<string, string>;
  /** 外部重载令牌（侧栏手排/置顶/回自动后重拉组序行） */
  refreshToken: number;
  // ── NoteListView 透传（交互回调） ──
  onGroupFilterChange: (id: number | null) => void;
  onKeywordChange: (kw: string) => void;
  onTagFilterChange: (tag: string | null) => void;
  onSortModeChange: (mode: SortMode) => void;
  onSelect: (note: Note) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onOpenSession: (sessionId: number) => void;
  onBatchDelete: (ids: number[]) => Promise<boolean>;
  onNotePinToggle: (note: Note) => void;
  onNoteEdit: (note: Note) => void;
  onNoteDelete: (note: Note) => void;
  onNoteMoved: () => void;
}

export default function NotesListColumn({
  listCol, view, onChanged, onCleanNotice, onPromoted,
  notes, groups, groupFilter, keyword, tagFilter, sortMode, allTags, selectedId, status,
  noteColors, tagColors, refreshToken,
  onGroupFilterChange, onKeywordChange, onTagFilterChange, onSortModeChange,
  onSelect, onCreate, onRefresh, onOpenSession, onBatchDelete,
  onNotePinToggle, onNoteEdit, onNoteDelete, onNoteMoved,
}: Props) {
  return (
    <>
      {/* ── 中部：收件箱视图 ↔ 笔记列表原位切换（布局不变；v0.15 分组树/可折叠）── */}
      {listCol.folded ? (
        <ColumnBar icon="📝" title="笔记列表" onClick={listCol.expand} />
      ) : view === "inbox" ? (
        <FeedFragmentList
          width={listCol.width}
          onChanged={onChanged}
          onCleanNotice={onCleanNotice}
          onPromoted={onPromoted}
          onCollapse={() => listCol.setManualFolded(true)}
        />
      ) : (
        <NoteListView
          width={listCol.width}
          notes={notes}
          groups={groups}
          groupFilter={groupFilter}
          onGroupFilterChange={onGroupFilterChange}
          keyword={keyword}
          tagFilter={tagFilter}
          sortMode={sortMode}
          allTags={allTags}
          selectedId={selectedId}
          status={status}
          onKeywordChange={onKeywordChange}
          onTagFilterChange={onTagFilterChange}
          onSortModeChange={onSortModeChange}
          onSelect={onSelect}
          onCreate={onCreate}
          onRefresh={onRefresh}
          onOpenSession={onOpenSession}
          onBatchDelete={onBatchDelete}
          noteColors={noteColors}
          tagColors={tagColors}
          // v0.16.1：笔记行右键菜单动作（复用既有处理——置顶/编辑/删除/归组刷新）
          onNotePinToggle={onNotePinToggle}
          onNoteEdit={onNoteEdit}
          onNoteDelete={onNoteDelete}
          onNoteMoved={onNoteMoved}
          onCleanNotice={onCleanNotice}
          onCollapse={() => listCol.setManualFolded(true)}
          // 批 6 审查 P2-10：侧栏手排/置顶/回自动（useGroupOrders→refreshAll）后
          // 重拉组序行——树组头与组侧栏同序（原挂载单拉，旧序/已删序行残留）
          refreshToken={refreshToken}
        />
      )}
      <ColumnResizer onResize={listCol.resizeBy} onReset={listCol.resetWidth} />
    </>
  );
}
