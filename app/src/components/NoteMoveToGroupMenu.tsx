/**
 * NoteMoveToGroupMenu — 阅读头「移动到组」下拉（v0.16.1 手动分组入口）。
 *
 * @ai-context: 手动分组此前仅两条路径——拖拽笔记行到组行（HTML5 DnD，WebView2
 *              下不稳健且难发现）与组行 ⓘ 弹层「移入选中笔记」（需先选中笔记，
 *              入口隐蔽）。本组件在笔记阅读头提供显式「移动到组」：当前组 ✓ +
 *              组色点 + 全部组列表 + 移出组（回「全部」）；复用 move_note_to_group
 *              命令；变更经 onChanged（NotesPage.handleNoteChanged）刷新列表与
 *              右栏（选中笔记 get_note 回填 group_id）。
 */
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteGroup } from "../types";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";

interface Props {
  note: Note;
  groups: NoteGroup[];
  /** 变更后的刷新回调（父层重载列表 + 重取选中笔记） */
  onChanged: () => void;
}

const DROPDOWN_ITEM: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  padding: "5px 8px",
  border: "none",
  background: "none",
  borderRadius: 4,
  fontSize: 12,
  color: "#374151",
  cursor: "pointer",
  textAlign: "left",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function GroupDot({ colorId }: { colorId: string | null | undefined }) {
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );
  return (
    <span
      style={{
        width: 9,
        height: 9,
        borderRadius: 3,
        flexShrink: 0,
        display: "inline-block",
        background: paletteHex(colorId, theme),
      }}
    />
  );
}

export default function NoteMoveToGroupMenu({ note, groups, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const currentId = note.group_id ?? null;

  const move = async (groupId: number | null) => {
    if (busy || groupId === currentId) return;
    setBusy(true);
    try {
      await invoke<boolean>("move_note_to_group", { noteId: note.id, groupId });
      setStatus("");
      setOpen(false);
      onChanged();
    } catch (e) {
      setStatus(`移动失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        data-testid="move-to-group-open"
        onClick={() => setOpen((v) => !v)}
        title="手动归组：把这条笔记移入/移出笔记组"
        style={{
          fontSize: 12,
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: 4,
          border: "1px solid #d1d5db",
          background: "#fff",
          color: "#374151",
        }}
      >
        📁 分组
      </button>
      {open && (
        <>
          {/* 透明背板：点击外部收起 */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent" }}
          />
          <div
            data-testid="move-to-group-pop"
            style={{
              position: "absolute",
              top: "100%",
              right: 0,
              zIndex: 31,
              minWidth: 220,
              maxHeight: 320,
              overflowY: "auto",
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", padding: "2px 8px 4px" }}>
              移动到组（当前：{groups.find((g) => g.id === currentId)?.name ?? "未分组"}）
            </div>
            {groups.length === 0 && (
              <div style={{ fontSize: 12, color: "#9ca3af", padding: "2px 8px 6px" }}>
                暂无组——左侧「＋ 新建组」创建后即可归组
              </div>
            )}
            {groups.map((g) => {
              const active = g.id === currentId;
              return (
                <button
                  key={g.id}
                  data-testid={`move-to-group-${g.id}`}
                  onClick={() => void move(g.id)}
                  disabled={busy || active}
                  style={{
                    ...DROPDOWN_ITEM,
                    background: active ? "#f0fdfa" : undefined,
                    color: active ? "#0f766e" : "#374151",
                    cursor: active ? "default" : "pointer",
                  }}
                  title={g.name}
                >
                  <GroupDot colorId={g.color} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                  {active && <span>✓</span>}
                </button>
              );
            })}
            {currentId != null && (
              <button
                data-testid="move-to-group-none"
                onClick={() => void move(null)}
                disabled={busy}
                style={{ ...DROPDOWN_ITEM, color: "#b91c1c", borderTop: "1px solid #f3f4f6", marginTop: 4 }}
              >
                移出分组（回「全部笔记」）
              </button>
            )}
            {status && (
              <div style={{ fontSize: 11, color: "#dc2626", padding: "4px 8px" }}>{status}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
