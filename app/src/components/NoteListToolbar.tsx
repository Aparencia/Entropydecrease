/**
 * NoteListToolbar — 笔记列表顶栏（标题栏 + 搜索/排序/标签区；批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 展示适配器——只做「透传 + 一层组合」，**不含业务逻辑**（选择模式态在
 *              hooks/useNoteListSelection，过滤/排序态在父层 pages/NotesPage）。
 *              返回 **fragment**：两个区块仍是列表外壳（width/borderRight/flex 列）的
 *              直接子元素，不新增包裹层（包裹层会改变 flex 布局）。
 * @ai-context: 文案与 data-testid 是测试契约（`batch-mode-toggle`、
 *              「选择模式（N）」「选择」「+ 新建」…测试用 getByText 精确匹配），
 *              **逐字保留**（含全角括号与省略号）。样式全内联，**不换 className**。
 * @ai-context: `ghostBtn` 由本文件导出并被 NoteListBatchMenu 复用——同一份按钮基底，
 *              避免两处样式漂移；`btn` 仅作为其基底，保持模块私有。
 * @ai-context: 边界——`SortMode` 以 **type-only import** 自 NoteListView 取（编译期
 *              擦除，无运行时循环依赖）；公共 API（`export type SortMode`）仍归主文件。
 */
import type { SortMode } from "./NoteListView";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };
/** 幽灵按钮基底（顶栏「选择」+ 批量栏/选集菜单 6 处共用） */
export const ghostBtn: React.CSSProperties = { ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" };

interface Props {
  /** 批量选择模式（单击行=勾选） */
  selectionMode: boolean;
  /** 选集大小（模式徽标「选择模式（N）」） */
  selectionCount: number;
  /** 「选择 / 退出选择模式」切换（父层裁决进入/退出） */
  onToggleBatchMode: () => void;
  onCreate: () => void;
  onCollapse?: () => void;
  keyword: string;
  onKeywordChange: (kw: string) => void;
  onRefresh: () => void;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  allTags: string[];
  tagFilter: string | null;
  onTagFilterChange: (tag: string | null) => void;
}

export default function NoteListToolbar({
  selectionMode, selectionCount, onToggleBatchMode, onCreate, onCollapse,
  keyword, onKeywordChange, onRefresh, sortMode, onSortModeChange,
  allTags, tagFilter, onTagFilterChange,
}: Props) {
  return (
    <>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📝 笔记</span>
        {selectionMode && (
          <span style={{ fontSize: 10.5, color: "#4f46e5", border: "1px solid #c7d2fe", borderRadius: 10, padding: "0 6px", background: "#eef2ff", lineHeight: "16px" }}>
            选择模式{selectionCount > 0 ? `（${selectionCount}）` : ""}
          </span>
        )}
        <button
          data-testid="batch-mode-toggle"
          onClick={onToggleBatchMode}
          style={{
            ...ghostBtn,
            marginLeft: "auto",
            borderColor: selectionMode ? "#4f46e5" : undefined,
            color: selectionMode ? "#3730a3" : "#4b5563",
          }}
          title={selectionMode ? "退出选择模式（Esc）" : "进入选择模式：单击笔记=勾选（可多选后批量操作）"}
        >
          选择
        </button>
        <button onClick={onCreate} style={{ fontSize: 12, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#f9fafb" }} title="新建笔记">+ 新建</button>
        <button onClick={onCollapse} style={{ fontSize: 12, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="折叠列表">⟨</button>
      </div>

      <div style={{ padding: 10, borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={keyword} onChange={(e) => onKeywordChange(e.target.value)} placeholder="搜索标题/正文…" style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, minWidth: 0 }} />
          <button onClick={onRefresh} style={{ fontSize: 13, cursor: "pointer" }}>⟳</button>
        </div>
        <select value={sortMode} onChange={(e) => onSortModeChange(e.target.value as SortMode)} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}>
          <option value="updated-desc">按更新时间</option>
          <option value="pin-first">置顶优先</option>
          <option value="created-desc">按创建时间</option>
        </select>
        {allTags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {tagFilter && (
              <span onClick={() => onTagFilterChange(null)} style={{ fontSize: 11, color: "#6b7280", cursor: "pointer", border: "1px solid #d1d5db", borderRadius: 10, padding: "1px 6px", background: "#f3f4f6" }}>清除过滤 ✕</span>
            )}
            {allTags.map((t) => (
              <span key={t} onClick={() => onTagFilterChange(t)} style={{ fontSize: 11, cursor: "pointer", border: `1px solid ${tagFilter === t ? "#0d9488" : "#e5e7eb"}`, borderRadius: 10, padding: "1px 6px", background: tagFilter === t ? "#f0fdfa" : "#f9fafb", color: tagFilter === t ? "#0d9488" : "#6b7280" }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
