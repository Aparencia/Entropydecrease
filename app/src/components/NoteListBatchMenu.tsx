/**
 * NoteListBatchMenu — 批量操作栏 + 选集批处理菜单（批 0-C2·Task 2 自 NoteListView 抽出）。
 *
 * @ai-context: 两个**受控展示件**同置一个模块（共享按钮基底与同一批处理语义）：
 *              ① `NoteListBatchBar`——选集非空时浮出的底部条（移动到组 / 批量删除 /
 *              完成 / 取消）；② `NoteListBatchContextMenu`——行右键选集或批量栏唤起的
 *              菜单，含二级「移动到组」视图（全部组 + 移出组）。
 * @ai-context: 做成受控件的理由（R8 风险）：菜单态与 **唯一 Esc handler** 的优先级链
 *              （batchMenu → contextMenu → 批量模式）留在 hooks/useNoteListSelection。
 *              若本模块自带 window keydown（照抄 NoteRowContextMenu 的范式），会出现两个
 *              window 监听同时判定，行为依赖 React 批处理时序。⇒ 本模块**零状态、
 *              零副作用、零 invoke**。
 * @ai-context: 文案与 data-testid 是测试契约（`batch-move-btn` / `batch-delete-btn` /
 *              `batch-done-btn` / `batch-context-menu` / `batch-menu-delete`，以及
 *              「已选 N 个」「📁 移动到组…」「删除选中（N）」「清除选择」「完成」
 *              「取消」「（移出组）」「📁 {组名}」「← 返回」——测试用 getByText 精确匹配，
 *              含全角括号与省略号），**逐字保留**。zIndex 40/41 与拆分前一致
 *              （本批不迁移到 ADR-032 的 zIndex 标尺）；`busyMove` 禁用态同前。
 */
import type { NoteGroup } from "../types";
import { ghostBtn } from "./NoteListToolbar";

interface BatchBarProps {
  /** 选集大小（「已选 N 个」） */
  count: number;
  /** 批量选择模式（决定是否显示「完成」） */
  selectionMode: boolean;
  /** 打开选集菜单（父层以选集构造 batchMenu，坐标为 0/0 → 由菜单回退到 12/12） */
  onMoveToGroup: () => void;
  /** 批量删除（父层确认；成功才清选） */
  onDelete: () => void;
  /** 退出选择模式并清选 */
  onDone: () => void;
  /** 仅清选（保留模式） */
  onCancel: () => void;
}

/** 批量操作栏（去勾选框后的批量入口：删除 + 移动到组；选择模式下同样可用） */
export function NoteListBatchBar({ count, selectionMode, onMoveToGroup, onDelete, onDone, onCancel }: BatchBarProps) {
  return (
    <div style={{ borderTop: "1px solid #e5e7eb", padding: 8, display: "flex", gap: 6, alignItems: "center", background: "#fff" }}>
      <span style={{ fontSize: 12, color: "#3730a3" }}>已选 {count} 个</span>
      <button data-testid="batch-move-btn" style={ghostBtn} onClick={onMoveToGroup}>移动到组</button>
      <button data-testid="batch-delete-btn" style={{ ...ghostBtn, borderColor: "#fca5a5", color: "#dc2626" }} onClick={onDelete}>批量删除</button>
      {selectionMode && <button data-testid="batch-done-btn" style={{ ...ghostBtn, color: "#3730a3" }} onClick={onDone}>完成</button>}
      <button style={{ ...ghostBtn, marginLeft: "auto" }} onClick={onCancel}>取消</button>
    </div>
  );
}

interface BatchMenuProps {
  /** 选集 ids（菜单标题「已选 N 个」与「删除选中（N）」） */
  ids: number[];
  x: number;
  y: number;
  /** 二级「移动到组」视图开关（父层持有——Esc 优先级链同闭包） */
  moveOpen: boolean;
  groups: NoteGroup[];
  /** 归组进行中：二级视图全部按钮禁用 */
  busyMove: boolean;
  /** 收起菜单（背板点击） */
  onClose: () => void;
  onOpenMove: () => void;
  onDelete: () => void;
  /** 清除选择（收起菜单 + 清选集） */
  onClearSelection: () => void;
  /** 归入目标组（null=移出组） */
  onMoveToGroup: (groupId: number | null) => void;
  /** 从二级视图返回一级 */
  onBack: () => void;
}

/** 选集批处理菜单（删除/移动到组）——透明背板 + 面板，整体一个 fragment（无额外 DOM 层） */
export function NoteListBatchContextMenu({
  ids, x, y, moveOpen, groups, busyMove, onClose, onOpenMove, onDelete, onClearSelection, onMoveToGroup, onBack,
}: BatchMenuProps) {
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={onClose} />
      <div data-testid="batch-context-menu" style={{ position: "fixed", zIndex: 41, left: x || 12, top: y || 12, minWidth: 180, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", padding: 6, fontSize: 12 }}>
        <div style={{ padding: "2px 6px", color: "#9ca3af", fontSize: 11 }}>已选 {ids.length} 个</div>
        {!moveOpen ? (
          <>
            <button style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left" }} disabled={busyMove} onClick={onOpenMove}>📁 移动到组…</button>
            <button data-testid="batch-menu-delete" style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left", borderColor: "#fca5a5", color: "#dc2626" }} disabled={busyMove} onClick={onDelete}>删除选中（{ids.length}）</button>
            <button style={{ ...ghostBtn, width: "100%", marginTop: 4, textAlign: "left" }} onClick={onClearSelection}>清除选择</button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" }}>
            <button style={{ ...ghostBtn, textAlign: "left" }} disabled={busyMove} onClick={() => onMoveToGroup(null)}>（移出组）</button>
            {groups.map((g) => (
              <button key={g.id} style={{ ...ghostBtn, textAlign: "left" }} disabled={busyMove} onClick={() => onMoveToGroup(g.id)}>📁 {g.name}</button>
            ))}
            <button style={{ border: "none", background: "none", color: "#6b7280", cursor: "pointer", textAlign: "left" }} onClick={onBack}>← 返回</button>
          </div>
        )}
      </div>
    </>
  );
}
