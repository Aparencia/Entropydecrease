/**
 * NoteListView — 笔记页中部列表：搜索/标签/排序 + 列表（REQ-287 v0.19.7 重构）。
 *
 * @ai-context: 交互矩阵落地（§2.6/2.9）——行内 checkbox 移除：多选三通道
 *              （Ctrl/⌘+单击=加/减、Shift+单击=按列表位置区间、工具栏「选择」
 *              批量模式行单击=勾选，Esc/完成退出）；拖拽矩阵（组头/组行双
 *              drop、同 scope 行间落点=手动排序自动启用快照、自动排序组禁入
 *              位置语义只做归组、搜索/标签平铺禁排序拖拽）；组头空白=划选
 *              锚点（区间=组内自首行至当前行带）；批量栏=删除+移动到组；
 *              右键=选集批处理（删除/移动）或单行既有菜单。手动序落库
 *              note_orders（scope=g{id}/none）——本组件全权管理（拉取/保存/
 *              回自动），父层只经 onNoteMoved 重载数据。
 * @ai-context: 树序范围：全局可见序（树=未分组+各组顺次、折叠组行不参与）为
 *              区间/划选唯一基准；跨组语义=归组（目标手排时按落点插入）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Note, NoteGroup } from "../types";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
// 批 0-C2：展示节/可见序纯函数层（含 scope 键与裸折叠键派生——纯逻辑与副作用分离）
import { buildSections, buildVisibleOrder, isTreeMode, manualBaseIds, scopeKey } from "../utils/noteSectionModel";
// 批 0-C2：序行 store（笔记手排序行 + 组手排序行）——兑现既有登记拆分计划
import { useNoteOrders } from "../hooks/useNoteOrders";
// 批 0-C2：拖拽/移动三入口接线（共享一把行落点并发锁——硬性同文件约束）
import { useNoteMoves } from "../hooks/useNoteMoves";
// 批 0-C2：多选三通道 + 菜单三态 + 唯一 Esc handler（可见序镜像同文件）
import { useNoteListSelection } from "../hooks/useNoteListSelection";
import NoteListRow from "./NoteListRow";
import NoteTreeSection from "./NoteTreeSection";
import NoteRowContextMenu from "./NoteRowContextMenu";

// 兼容既有导入面（NoteReadingView/NotesPage/parseTags.test 从此解析——v0.15 移厝 utils）
export { parseTags, fmtDate } from "../utils/noteHelpers";

export type SortMode = "updated-desc" | "pin-first" | "created-desc";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };
const ghostBtn: React.CSSProperties = { ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" };

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

/** 读组折叠记忆（localStorage 损坏/无 → 默认展开） */
function readGroupFold(key: string): boolean {
  try { return window.localStorage.getItem(`notes:group-fold:${key}`) === "1"; } catch { return false; }
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

  // 组折叠态
  const [groupFolds, setGroupFolds] = useState<Record<string, boolean>>({});

  // 序行 store（笔记手排序行 + 组手排序行）——装载/保存路径下沉 hooks/useNoteOrders
  const { manualOrders, groupOrderRows, saveOrder, resetOrder } = useNoteOrders(refreshToken);

  // 手动序装载（REQ-287：notes 行）+ REQ-315：组序行（树组头排序）——见 hooks/useNoteOrders
  // （依赖 refreshToken 的理由随实现搬至该 hook 头注释：审查 P2-10 的令牌重拉）

  // ── 分组树数据（同 v0.15 结构）——可见序统一从本结构生成 ──
  // Why 不再有分桶 memo：旧 `grouped` 是死载荷——仅被当作 treeMode 的第二真值，
  // 其 ungrouped/byGroup 从未被读取（真分桶一直在 sections 内重算）；批 0-C2 去重
  const treeMode = isTreeMode(keyword, tagFilter, sortMode);

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
      for (const [k, v] of Object.entries(groupFolds)) window.localStorage.setItem(`notes:group-fold:${k}`, v ? "1" : "0");
    } catch { /* 隐私模式 */ }
  }, [groupFolds]);

  // 显示节（树/平铺）——节内展示序/分桶/accent 全在 utils/noteSectionModel.buildSections
  // deps 保留 groupFolds：函数体不读它，但移除会改变重算次数（本批只搬家不优化）
  const sections = useMemo(
    () => buildSections({ notes, groups, groupFilter, theme, treeMode, manualOrders, groupOrderRows }),
    [treeMode, groups, notes, groupFolds, manualOrders, theme, groupFilter, groupOrderRows],
  );

  // 可见序（L1 审查：折叠组行不参与区间/划选——与渲染可见一致；折叠组头仍在）
  const visibleOrder = useMemo(() => buildVisibleOrder(sections, groupFolds), [sections, groupFolds]);

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
  }, [sections, visibleOrder, groupFolds]);

  const rowAccent = (n: Note) => paletteHex(noteColors?.[n.id] ?? null, theme);

  const renderRow = (n: Note) => (
    <NoteListRow
      key={n.id}
      note={n}
      accent={rowAccent(n)}
      openId={selectedId}
      multiSelected={selection.has(n.id)}
      tagColors={tagColors}
      onOpen={handleOpen}
      onModifierClick={handleModifierClick}
      dragIds={selection.size > 0 && selection.has(n.id) ? [...selection] : []}
      onDropOnRow={handleDropOnRow}
      onOpenSession={onOpenSession}
      onContextMenu={openRowContextMenu}
    />
  );

  const toggleGroupFold = (key: string) => setGroupFolds((cur) => ({ ...cur, [key]: !cur[key] }));

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
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>📝 笔记</span>
        {selectionMode && (
          <span style={{ fontSize: 10.5, color: "#4f46e5", border: "1px solid #c7d2fe", borderRadius: 10, padding: "0 6px", background: "#eef2ff", lineHeight: "16px" }}>
            选择模式{selection.size > 0 ? `（${selection.size}）` : ""}
          </span>
        )}
        <button
          data-testid="batch-mode-toggle"
          onClick={() => (selectionMode ? exitBatch() : setSelectionMode(true))}
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
              onToggleFold={() => toggleGroupFold(sec.groupId == null ? "none" : String(sec.groupId))}
              onSelectTitle={() => onGroupFilterChange?.(sec.groupId === null ? null : (groupFilter === sec.groupId ? null : sec.groupId))}
              manual={!!manualOrders[sec.scope]}
              onResetManual={() => void resetOrder(sec.scope)}
              onDropNotes={(ids) => void moveToGroup(ids, sec.groupId)}
              onMarqueeStart={() => startMarquee(sec.scope)}
            >
              {sec.items.map(renderRow)}
            </NoteTreeSection>
          )
        ))}
      </div>

      {/* 批量操作栏（去勾选框后的批量入口：删除 + 移动到组；选择模式下同样可用） */}
      {selection.size > 0 && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6, alignItems: "center", background: "#fff" }}>
          <span style={{ fontSize: 12, color: "#3730a3" }}>已选 {selection.size} 个</span>
          <button data-testid="batch-move-btn" style={ghostBtn} onClick={() => setBatchMenu({ ids: [...selection], x: 0, y: 0 })}>移动到组</button>
          <button data-testid="batch-delete-btn" style={{ ...ghostBtn, borderColor: "#fca5a5", color: "#dc2626" }} onClick={() => void (async () => { if (await onBatchDelete([...selection])) clearSelection(); })()}>批量删除</button>
          {selectionMode && <button data-testid="batch-done-btn" style={{ ...ghostBtn, color: "#3730a3" }} onClick={exitBatch}>完成</button>}
          <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={clearSelection}>取消</button>
        </div>
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

      {/* 选集批处理菜单（删除/移动到组） */}
      {batchMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => { setBatchMenu(null); setBatchMoveOpen(false); }} />
          <div data-testid="batch-context-menu" style={{ position: "fixed", zIndex: 41, left: batchMenu.x || 12, top: batchMenu.y || 12, minWidth: 180, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", padding: 6, fontSize: 12 }}>
            <div style={{ padding: "2px 6px", color: "#9ca3af", fontSize: 11 }}>已选 {batchMenu.ids.length} 个</div>
            {!batchMoveOpen ? (
              <>
                <button style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left" }} disabled={busyMove} onClick={() => setBatchMoveOpen(true)}>📁 移动到组…</button>
                <button data-testid="batch-menu-delete" style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left", borderColor: "#fca5a5", color: "#dc2626" }} disabled={busyMove} onClick={() => void batchDelete()}>删除选中（{batchMenu.ids.length}）</button>
                <button style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left" }} onClick={() => { setBatchMenu(null); clearSelection(); }}>清除选择</button>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" }}>
                <button style={{ ...ghostBtn, textAlign: "left" }} disabled={busyMove} onClick={() => void moveToGroup(batchMenu.ids, null)}>（移出组）</button>
                {groups.map((g) => (
                  <button key={g.id} style={{ ...ghostBtn, textAlign: "left" }} disabled={busyMove} onClick={() => void moveToGroup(batchMenu.ids, g.id)}>📁 {g.name}</button>
                ))}
                <button style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", textAlign: "left" }} onClick={() => setBatchMoveOpen(false)}>← 返回</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
