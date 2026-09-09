/**
 * NoteRowContextMenu — 笔记行右键菜单（v0.16.1 用户决定②完整菜单；
 * REQ-315 v0.20.11 批 6 扩展：显式上移/下移 + 措辞统一「置顶」）。
 *
 * @ai-context: 原生右键菜单已全局禁用（browser_chrome.rs）——本组件是笔记行的
 *              应用内替代：📁 移动到组（二级视图：全部组+移出组，复用
 *              move_note_to_group）/ 📌 置顶（措辞统一：数据字段 pin 不变）/
 *              ↑↓ 上移/下移（REQ-315：组内显式移动——树视图消费，补"必须拖
 *              一次"发现性缺口）/ 📋 复制标题/正文 / ✏ 编辑 / 🗑 删除。
 *              置顶/编辑/删除委托父层既有处理（runPinToggle/setEditing/runDelete），
 *              归组在本组件内 invoke 后经 onMoveToGroup 上抛刷新（含右栏选中重取）。
 *              复制经 navigator.clipboard.writeText（WebView2 安全上下文可用；
 *              失败静默——键盘复制仍是主路径）。
 * @ai-context: 上移/下移语义——置顶项禁用（置顶区按更新时间定序，不占手动位，
 *              取消置顶后可移动；交互矩阵 REQ-287 平铺态（搜索/标签/非默认
 *              排序）本就不显示移动项）；边界项禁用由父层按可见序计算传入。
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteGroup } from "../types";
// REQ-316（批 7）：移组返回契约（源空组清理留痕数据源）
import type { MoveNoteResult } from "../types/notes";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";

interface Props {
  note: Note;
  groups: NoteGroup[];
  x: number;
  y: number;
  onClose: () => void;
  /** 置顶/取消置顶（父层 invoke + 刷新） */
  onPinToggle: (note: Note) => void;
  /** 进入编辑（父层选中 + 打开编辑态） */
  onEdit: (note: Note) => void;
  /** 删除（父层确认 + 删除 + 刷新） */
  onDelete: (note: Note) => void;
  /** 归组完成回调（父层刷新列表 + 右栏） */
  onMoved: () => void;
  /** REQ-316（批 7）：移组触发源空组自动清理 → 上抛组标题（父层 toast 留痕） */
  onCleanNotice?: (groupNames: string[]) => void;
  /** REQ-315：组内上移/下移（树视图 scope 上下文才传——父层按可见序计算可用性） */
  onMoveWithinScope?: (note: Note, dir: 1 | -1) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

const ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "5px 10px",
  border: "none",
  background: "none",
  borderRadius: 6,
  fontSize: 12.5,
  color: "#374151",
  cursor: "pointer",
  textAlign: "left",
};

const ITEM_ICON: React.CSSProperties = { width: 20, fontSize: 12, textAlign: "center" };

export default function NoteRowContextMenu({
  note, groups, x, y, onClose, onPinToggle, onEdit, onDelete, onMoved,
  onCleanNotice, onMoveWithinScope, canMoveUp = false, canMoveDown = false,
}: Props) {
  const [view, setView] = useState<"root" | "groups">("root");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const currentId = note.group_id ?? null;
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );
  // v0.16.1 审查修复：ESC 关闭（与 RouteInfoPopover 键盘可达性同规）
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  // REQ-315：置顶项移动禁用提示（置顶区按更新时间定序——非隐藏原因，见文件头）
  const pinMoveHint = note.pin === 1 ? "置顶笔记固定于置顶区（按更新时间排序），取消置顶后可移动" : undefined;
  const px = Math.max(4, Math.min(x, window.innerWidth - 232));
  const py = Math.max(4, Math.min(y, window.innerHeight - 460));

  const moveTo = async (groupId: number | null) => {
    if (busy || groupId === currentId) return;
    setBusy(true);
    try {
      const r = await invoke<MoveNoteResult>("move_note_to_group", { noteId: note.id, groupId });
      setStatus("");
      setBusy(false);
      // REQ-316（批 7）：源组因移走变空 → 自动清理留痕（结果空=零变化）
      if (r.autoCleanedGroups.length > 0) onCleanNotice?.([...new Set(r.autoCleanedGroups)]);
      onClose();
      onMoved();
    } catch (e) {
      setStatus(`移动失败: ${e}`);
      setBusy(false);
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`已复制${label}`);
    } catch {
      setStatus("复制失败（可用 Ctrl+C）");
    }
  };

  return (
    <>
      {/* 透明背板：点击/右键收起 */}
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "fixed", inset: 0, zIndex: 60, background: "transparent" }}
      />
      <div
        role="menu"
        data-testid="note-row-menu"
        data-app-menu=""
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          left: px,
          top: py,
          zIndex: 61,
          width: 216,
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
          padding: 4,
        }}
      >
        <div style={{ fontSize: 11, color: "#6b7280", padding: "2px 10px 4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {note.title}
        </div>

        {view === "root" ? (
          <>
            {/* REQ-315：显式组内移动（仅树视图 scope 上下文渲染；置顶/边界禁用） */}
            {onMoveWithinScope && (
              <>
                <button
                  data-testid="ctx-move-up"
                  disabled={!canMoveUp}
                  title={pinMoveHint ?? "已在首位"}
                  style={{ ...ITEM, opacity: canMoveUp ? 1 : 0.45, cursor: canMoveUp ? "pointer" : "default" }}
                  onClick={() => { if (canMoveUp) { onClose(); onMoveWithinScope(note, -1); } }}
                >
                  <span style={ITEM_ICON}>↑</span> 上移
                </button>
                <button
                  data-testid="ctx-move-down"
                  disabled={!canMoveDown}
                  title={pinMoveHint ?? "已在末位"}
                  style={{ ...ITEM, opacity: canMoveDown ? 1 : 0.45, cursor: canMoveDown ? "pointer" : "default" }}
                  onClick={() => { if (canMoveDown) { onClose(); onMoveWithinScope(note, 1); } }}
                >
                  <span style={ITEM_ICON}>↓</span> 下移
                </button>
              </>
            )}
            <button data-testid="ctx-pin" style={ITEM} onClick={() => { onClose(); onPinToggle(note); }}>
              <span style={ITEM_ICON}>📌</span> {note.pin ? "取消置顶" : "置顶"}
            </button>
            <button data-testid="ctx-groups" style={ITEM} onClick={() => setView("groups")}>
              <span style={ITEM_ICON}>📁</span> 移动到组 <span style={{ marginLeft: "auto", color: "#9ca3af" }}>▸</span>
            </button>
            <button data-testid="ctx-copy-title" style={ITEM} onClick={() => void copy(note.title, "标题")}>
              <span style={ITEM_ICON}>📋</span> 复制标题
            </button>
            <button data-testid="ctx-copy-body" style={ITEM} onClick={() => void copy(note.content, "正文")}>
              <span style={ITEM_ICON}>📋</span> 复制正文
            </button>
            <button data-testid="ctx-edit" style={ITEM} onClick={() => { onClose(); onEdit(note); }}>
              <span style={ITEM_ICON}>✏️</span> 编辑
            </button>
            <div style={{ height: 1, background: "#f3f4f6", margin: "3px 6px" }} />
            <button
              data-testid="ctx-delete"
              style={{ ...ITEM, color: "#b91c1c" }}
              onClick={() => { onClose(); onDelete(note); }}
            >
              <span style={ITEM_ICON}>🗑</span> 删除
            </button>
          </>
        ) : (
          <>
            <button style={ITEM} onClick={() => setView("root")} data-testid="ctx-groups-back">
              <span style={ITEM_ICON}>←</span> 返回
            </button>
            <div style={{ maxHeight: 260, overflowY: "auto" }}>
              {groups.length === 0 && (
                <div style={{ fontSize: 12, color: "#9ca3af", padding: "4px 10px" }}>暂无组——左侧「＋ 新建组」</div>
              )}
              {groups.map((g) => {
                const active = g.id === currentId;
                return (
                  <button
                    key={g.id}
                    data-testid={`ctx-group-${g.id}`}
                    style={{ ...ITEM, color: active ? "#0f766e" : "#374151", cursor: active ? "default" : "pointer" }}
                    disabled={busy || active}
                    onClick={() => void moveTo(g.id)}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: paletteHex(g.color, theme), flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                    {active && <span>✓</span>}
                  </button>
                );
              })}
              {currentId != null && (
                <button
                  data-testid="ctx-group-none"
                  style={{ ...ITEM, color: "#b91c1c", borderTop: "1px solid #f3f4f6", marginTop: 4 }}
                  disabled={busy}
                  onClick={() => void moveTo(null)}
                >
                  移出分组（回「全部」）
                </button>
              )}
            </div>
          </>
        )}

        {status && (
          <div style={{ fontSize: 11, color: status.startsWith("已") ? "#047857" : "#dc2626", padding: "4px 10px 2px" }}>
            {status}
          </div>
        )}
      </div>
    </>
  );
}
