/**
 * NoteGroupPanel — 笔记组侧栏（v0.11.0 REQ-195~198）。
 *
 * @ai-context: v4 §7.4 统一产物层的 UI 呈现——组是唯一容器；本面板负责
 *              组列表/按组过滤/路由理由展示（REQ-198 可见）/一键改判与
 *              笔记移动（REQ-198 可改，修改即记忆）。
 * @ai-context: 受控过滤态由 NotesPage 持有（groupFilter），本组件自管组数据
 *              加载与改判交互；任何变更后回调 onChanged 触发笔记列表重载。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GroupRouteReason, NoteGroup } from "../types";

/** 领域标签选项（与 Rust DomainKind 15 类同口径；改判下拉用） */
const DOMAIN_OPTIONS: [string, string][] = [
  ["economy", "经济管理"], ["programming", "编程开发"], ["math-science", "数学理科"],
  ["language", "语言学习"], ["beauty", "化妆美妆"], ["fitness", "健身运动"],
  ["law", "法律"], ["medical", "医学健康"], ["career", "职场技能"],
  ["design", "设计创意"], ["music", "音乐"], ["handcraft", "手工"],
  ["exam", "考试考证"], ["gaming", "游戏电竞"], ["psychology", "心理成长"],
];

/** 组类别徽标（文案+配色） */
function kindBadge(kind: string): { label: string; color: string } {
  if (kind === "course") return { label: "📚 课程", color: "#0f766e" };
  if (kind === "topic") return { label: "🏷 主题", color: "#7c3aed" };
  return { label: "📄 独立", color: "#6b7280" };
}

/** 解析路由理由 JSON（损坏防御性回退空对象）。 */
export function parseRouteReason(raw: string | null): GroupRouteReason {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as GroupRouteReason) : {};
  } catch {
    return {};
  }
}

interface Props {
  /** 当前过滤组（null=全部） */
  groupFilter: number | null;
  onGroupFilterChange: (id: number | null) => void;
  /** 当前选中笔记（提供"移入此组"快捷操作；null=无） */
  selectedNoteId: number | null;
  /** 组/笔记变更后的刷新回调（NotesPage 重载笔记列表） */
  onChanged: () => void;
}

export default function NoteGroupPanel({ groupFilter, onGroupFilterChange, selectedNoteId, onChanged }: Props) {
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  // 改判表单态（展开区消费）
  const [overrideKind, setOverrideKind] = useState("standalone");
  const [overrideDomain, setOverrideDomain] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await invoke<NoteGroup[]>("list_note_groups", { terrain: null });
      setGroups(list);
    } catch (e) {
      setStatus(`组加载失败: ${e}`);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── 改判（REQ-198 修改即记忆）──
  const runOverride = async (g: NoteGroup) => {
    try {
      await invoke<boolean>("override_group_route", {
        id: g.id,
        kind: overrideKind,
        domainTag: overrideKind === "topic" ? overrideDomain || null : null,
      });
      setStatus("");
      await load();
      onChanged();
    } catch (e) {
      setStatus(`改判失败: ${e}`);
    }
  };

  // ── 笔记移入/移出 ──
  const runMove = async (groupId: number | null) => {
    if (selectedNoteId == null) return;
    try {
      await invoke<boolean>("move_note_to_group", { noteId: selectedNoteId, groupId });
      setStatus("");
      await load();
      onChanged();
    } catch (e) {
      setStatus(`移动失败: ${e}`);
    }
  };

  return (
    <div style={{ width: 230, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid #e5e7eb", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🗂 笔记组</span>
        <button onClick={() => void load()} style={{ marginLeft: "auto", fontSize: 13, cursor: "pointer" }} title="刷新组列表">⟳</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 6 }}>
        {/* 全部（取消组过滤） */}
        <div
          onClick={() => onGroupFilterChange(null)}
          style={{
            padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 13,
            background: groupFilter === null ? "#f0fdfa" : "transparent",
            color: groupFilter === null ? "#0f766e" : "#374151", fontWeight: 500,
          }}
        >
          全部笔记
        </div>
        {groups.length === 0 && (
          <p style={{ fontSize: 12, color: "#9ca3af", padding: "12px 8px" }}>
            暂无笔记组——会话转笔记时自动归组
          </p>
        )}
        {groups.map((g) => {
          const badge = kindBadge(g.kind);
          const reason = parseRouteReason(g.routeReason);
          const active = groupFilter === g.id;
          const expanded = expandedId === g.id;
          return (
            <div key={g.id} style={{ marginTop: 4 }}>
              <div
                onClick={() => onGroupFilterChange(active ? null : g.id)}
                style={{
                  padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                  background: active ? "#f0fdfa" : "transparent",
                  border: reason.needsConfirm && !g.routeOverridden ? "1px dashed #f59e0b" : "1px solid transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {g.name}
                  </span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>{g.noteCount}</span>
                  <span
                    onClick={(e) => { e.stopPropagation(); setExpandedId(expanded ? null : g.id); setOverrideKind(g.kind); setOverrideDomain(g.domainTag ?? ""); }}
                    style={{ fontSize: 11, color: "#6b7280", cursor: "pointer", padding: "0 3px" }}
                    title="路由详情/改判"
                  >
                    {expanded ? "▾" : "▸"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: badge.color, background: "#f9fafb", borderRadius: 8, padding: "0 5px" }}>{badge.label}</span>
                  {reason.needsConfirm && !g.routeOverridden && (
                    <span style={{ fontSize: 10, color: "#b45309", background: "#fffbeb", borderRadius: 8, padding: "0 5px" }}>⚠ 待确认</span>
                  )}
                  {g.routeOverridden ? (
                    <span style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", borderRadius: 8, padding: "0 5px" }}>已改判</span>
                  ) : null}
                </div>
              </div>
              {/* 展开区：路由理由（可见）+ 改判/移动（可改）——REQ-198 */}
              {expanded && (
                <div style={{ margin: "4px 0 6px 10px", padding: 8, background: "#f9fafb", borderRadius: 6, fontSize: 12 }}>
                  {(reason.reasons ?? []).length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: "#6b7280", marginBottom: 2 }}>路由理由：</div>
                      {(reason.reasons ?? []).map((r, i) => (
                        <div key={i} style={{ color: "#374151", paddingLeft: 6 }}>· {r}</div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    <select value={overrideKind} onChange={(e) => setOverrideKind(e.target.value)}
                      style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4, flex: 1 }}>
                      <option value="standalone">独立组</option>
                      <option value="course">课程组</option>
                      <option value="topic">主题组</option>
                    </select>
                    {overrideKind === "topic" && (
                      <select value={overrideDomain} onChange={(e) => setOverrideDomain(e.target.value)}
                        style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4, flex: 1 }}>
                        <option value="">选择领域…</option>
                        {DOMAIN_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                      </select>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <button onClick={() => void runOverride(g)}
                      style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
                      ✓ 改判
                    </button>
                    {selectedNoteId != null && (
                      <>
                        <button onClick={() => void runMove(g.id)}
                          style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
                          ← 移入选中笔记
                        </button>
                        <button onClick={() => void runMove(null)}
                          style={{ fontSize: 11, cursor: "pointer", padding: "2px 8px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
                          移出组
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {status && <p style={{ padding: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}
    </div>
  );
}
