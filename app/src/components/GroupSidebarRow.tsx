/**
 * GroupSidebarRow — 组侧栏单行（v0.14 C1 Obsidian 式改造自 GroupSidebar 提取）。
 *
 * @ai-context: 行内信息收敛为两行（spec §3.1 徽标收敛 1-2 个）：第一行
 *              色点 + 组名 + 计数 + ⓘ；第二行体系徽标 + 路由理由小字。
 *              kind 由分区表达（行内不再重复 kind badge）；feed 由分区表达。
 *              兼作拖拽归组 drop target（HTML5 DnD——NoteListView 行是 drag source）。
 * @ai-context: v0.14.1 ✎ 内联重命名——Enter 保存 / Esc 取消 / 失焦取消；
 *              所有事件 stopPropagation（不与行点击过滤/色点/ⓘ/拖拽冲突）。
 */
import { useMemo, useState } from "react";
import type { NoteGroup } from "../types";
import type { KnowledgeSystem } from "../types/knowledge";
import { parseRouteReason, routeLineState } from "../utils/routeReason";
import { paletteHex } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
import SystemBadge from "./SystemBadge";
import NoteColorPicker from "./NoteColorPicker";

interface Props {
  group: NoteGroup;
  active: boolean;
  systems: KnowledgeSystem[];
  /** 该组被哪些体系引用（触点① 徽标） */
  systemLinks: { systemId: number; count: number }[];
  colorPickerOpen: boolean;
  dragOver: boolean;
  onSelect: () => void;
  onInfo: (e: React.MouseEvent<HTMLElement>) => void;
  onToggleColorPicker: () => void;
  onColorChange: (color: string | null) => void;
  /** v0.14.1：行内重命名提交（Enter；空白/同名在**子组件 commitEdit 内拦截**——父级拿名即 invoke） */
  onRename: (name: string) => void;
  onOpenSystem: (systemId: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}

export default function GroupSidebarRow({
  group, active, systems, systemLinks, colorPickerOpen, dragOver,
  onSelect, onInfo, onToggleColorPicker, onColorChange, onRename, onOpenSystem,
  onDragOver, onDragLeave, onDrop,
}: Props) {
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );
  const reason = parseRouteReason(group.routeReason);
  // v0.14.1：内联编辑态（受控——编辑中行点击过滤不触发）
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(group.name);
    setEditing(true);
  };

  const commitEdit = () => {
    const t = nameDraft.trim();
    setEditing(false);
    if (t && t !== group.name) onRename(t);
  };

  const cancelEdit = () => {
    setEditing(false);
    setNameDraft(group.name);
  };
  const line = routeLineState(reason, group.routeOverridden);

  return (
    <div
      data-testid={`group-row-${group.id}`}
      // 审查修复：编辑态行点击短路——原仅 input/✎ 等 stopPropagation，
      // 行空白区点击会先 blur 取消编辑再触发组过滤切换（内容丢失+浏览位置漂移）
      onClick={editing ? (e) => e.stopPropagation() : onSelect}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        padding: "7px 10px", borderRadius: 6, cursor: "pointer",
        background: active ? "#f0fdfa" : dragOver ? "#fefce8" : "transparent",
        border: line.needsConfirm && !group.routeOverridden ? "1px dashed #f59e0b" : "1px solid transparent",
        outline: dragOver ? "1px dashed #0d9488" : "none",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* v0.14 B：组色点（点击设置；未设置显示灰点） */}
        <span
          data-testid={`group-color-dot-${group.id}`}
          onClick={(e) => { e.stopPropagation(); onToggleColorPicker(); }}
          title="设置组颜色"
          style={{
            width: 10, height: 10, borderRadius: 3, flexShrink: 0, cursor: "pointer", display: "inline-block",
            background: group.color ? paletteHex(group.color, theme) : "#d1d5db",
          }}
        />
        {editing ? (
          <input
            data-testid={`group-rename-input-${group.id}`}
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              // 审查修复：IME 组合态守卫——中文输入法下确认候选的 Enter 也会
              // 触发提交（compositionend 前），半成品组名被提前 rename
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={cancelEdit}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 13, flex: 1, minWidth: 0, padding: "2px 6px", border: "1px solid #0d9488", borderRadius: 4, outline: "none" }}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{group.name}</span>
        )}
        <span style={{ fontSize: 11, color: "#9ca3af" }}>{group.noteCount}</span>
      </div>
      {/* 第二行：体系徽标 + 路由理由小字（ⓘ 弹层明细） */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, paddingLeft: 16 }}>
        {systemLinks.map((sl) => {
          const sys = systems.find((s) => s.id === sl.systemId);
          if (!sys || sys.status === "archived") return null;
          return (
            <SystemBadge
              key={sl.systemId}
              name={sys.name}
              linkCount={sl.count}
              onClick={() => onOpenSystem(sl.systemId)}
            />
          );
        })}
        <span style={{ fontSize: 10, color: line.needsConfirm ? "#b45309" : "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {line.label}
        </span>
        <button
          data-testid={`group-rename-${group.id}`}
          onClick={startEdit}
          style={{ marginLeft: "auto", fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#9ca3af", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          title="重命名组"
        >
          ✎
        </button>
        <button
          data-testid={`group-info-${group.id}`}
          onClick={onInfo}
          style={{ fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#6b7280", padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
          title="路由详情 / 改判 / 组管理 / 周契约"
        >
          ⓘ
        </button>
      </div>
      {/* v0.14 B：组色选择浮层（相对组行定位；stopPropagation 防误触行过滤） */}
      {colorPickerOpen && (
        <div
          data-testid={`group-color-picker-${group.id}`}
          style={{ position: "absolute", top: "100%", left: 8, zIndex: 20, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
        >
          <NoteColorPicker
            value={group.color ?? null}
            onChange={onColorChange}
          />
        </div>
      )}
    </div>
  );
}
