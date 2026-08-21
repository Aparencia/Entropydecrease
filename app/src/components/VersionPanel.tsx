/**
 * VersionPanel — 笔记版本时间线面板（REQ-144 + REQ-143 完整，v0.8.0 M4）。
 *
 * @ai-context: 快照链可见化：列表（时间/source 徽标/费用/合并摘要）+ 任意
 *              两版段级 diff 对比（note_diff 内核——M2 精修预览同款高亮）+
 *              回滚（新版本 user_edit，不破坏历史链）+ AI 成本记录
 *              （note_ai_usage——token/费用/模型/切片）。
 * @ai-context: 每次变更=新版本（转笔记首快照/精修/补充/手动保存/回滚）——
 *              "重新生成"从覆盖变为新版本；50 版上限超限合并最旧。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiUsageRecord, DiffOp, NoteVersion, NoteVersionSource } from "../types";

const btn: React.CSSProperties = { padding: "4px 8px", cursor: "pointer", fontSize: 11, borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" };

/** source 徽标（文案/配色） */
const SOURCE_BADGE: Record<NoteVersionSource, { label: string; color: string; bg: string }> = {
  rule: { label: "本地规则", color: "#374151", bg: "#f3f4f6" },
  "ai-refine": { label: "AI 精修", color: "#3730a3", bg: "#eef2ff" },
  "ai-enrich": { label: "AI 补充", color: "#6b21a8", bg: "#faf5ff" },
  "user-edit": { label: "用户编辑", color: "#0d9488", bg: "#f0fdfa" },
};

function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** diff 三态渲染（与精修预览同款） */
function DiffLine({ op }: { op: DiffOp }) {
  if ("added" in op) return <div style={{ background: "#ecfdf5", color: "#047857", padding: "2px 6px", borderRadius: 4 }}>+ {op.added}</div>;
  if ("removed" in op) return <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "2px 6px", borderRadius: 4, textDecoration: "line-through" }}>− {op.removed}</div>;
  return <div style={{ color: "#6b7280", padding: "2px 6px" }}>  {("unchanged" in op ? op.unchanged : "").replace(/^#+\s*/, "") || " "}</div>;
}

export default function VersionPanel({ noteId, onChanged }: { noteId: number; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<NoteVersion[]>([]);
  const [usage, setUsage] = useState<AiUsageRecord[]>([]);
  const [diff, setDiff] = useState<DiffOp[] | null>(null);
  const [v1Id, setV1Id] = useState<number | null>(null);
  const [v2Id, setV2Id] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const vs = await invoke<NoteVersion[]>("note_versions_list", { noteId });
      setVersions(vs);
      // 默认对比：最旧 vs 最新
      if (vs.length >= 2) {
        setV1Id(vs[0].id);
        setV2Id(vs[vs.length - 1].id);
      } else if (vs.length === 1) {
        setV1Id(vs[0].id);
        setV2Id(vs[0].id);
      }
      const us = await invoke<AiUsageRecord[]>("note_versions_usage", { noteId }).catch(() => []);
      setUsage(us);
    } catch (e) {
      setMsg(`加载版本失败：${e}`);
    }
  }, [noteId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open || v1Id == null || v2Id == null) return;
    void invoke<DiffOp[]>("note_versions_diff", { noteId, v1Id, v2Id })
      .then(setDiff)
      .catch(() => setDiff(null));
  }, [open, v1Id, v2Id, noteId]);

  const rollback = async (versionId: number) => {
    const v = versions.find((x) => x.id === versionId);
    if (!v) return;
    if (!window.confirm(`回滚到「${SOURCE_BADGE[v.source].label}」版本（${fmtTime(v.createdAt)}）？将创建新版本，历史链保留。`)) return;
    try {
      await invoke<{ id: number }>("note_versions_rollback", { noteId, targetVersionId: versionId });
      setMsg("已回滚（新版本 user-edit，历史链未破坏）");
      onChanged?.();
      await load();
    } catch (e) {
      setMsg(`回滚失败：${e}`);
    }
  };

  const totalCost = usage.reduce((s, u) => s + u.costYuan, 0);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10, background: "#fcfcfd" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={{ ...btn, fontWeight: 600 }} onClick={() => setOpen((o) => !o)}>
          {open ? "▾" : "▸"} 🕘 版本时间线（{versions.length || "…"}）
        </button>
        {totalCost > 0 && (
          <span style={{ fontSize: 11, color: "#6b7280" }}>AI 累计成本 ¥{totalCost.toFixed(4)}</span>
        )}
        {/* A4：版本统计摘要 */}
        {versions.length > 0 && (
          <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: "auto" }}>
            {versions.filter((v) => v.source === "user-edit").length} 次编辑 ·
            {versions.filter((v) => v.source === "ai-refine" || v.source === "ai-enrich").length} 次 AI ·
            {versions.length} 版本
          </span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {/* 版本列表（时间/source 徽标/费用/合并摘要 + 回滚） */}
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6 }}>
            {versions.map((v, i) => {
              const badge = SOURCE_BADGE[v.source] ?? SOURCE_BADGE.rule;
              return (
                <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 8px", borderBottom: "1px solid #f3f4f6", fontSize: 11 }}>
                  <span style={{ color: "#6b7280", width: 110, flexShrink: 0 }}>{fmtTime(v.createdAt)}</span>
                  <span style={{ color: badge.color, background: badge.bg, borderRadius: 8, padding: "1px 8px", fontWeight: 600 }}>{badge.label}</span>
                  {v.meta.costYuan != null && <span style={{ color: "#b45309" }}>¥{v.meta.costYuan.toFixed(4)}</span>}
                  {v.meta.model && <span style={{ color: "#9ca3af", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.meta.model}</span>}
                  {v.meta.mergedFrom && <span style={{ color: "#9ca3af" }} title={v.meta.mergedFrom}>· 已合并</span>}
                  <span style={{ flex: 1 }} />
                  {i !== versions.length - 1 && (
                    <button style={{ ...btn, color: "#b45309" }} onClick={() => void rollback(v.id)}>
                      回滚到此处
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* 两版对比（diff） */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", margin: "8px 0" }}>
            <select value={v1Id ?? ""} onChange={(e) => setV1Id(Number(e.target.value))} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #d1d5db" }}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>v{v.id} · {SOURCE_BADGE[v.source].label}</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: "#6b7280" }}>→</span>
            <select value={v2Id ?? ""} onChange={(e) => setV2Id(Number(e.target.value))} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 6, border: "1px solid #d1d5db" }}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>v{v.id} · {SOURCE_BADGE[v.source].label}</option>
              ))}
            </select>
          </div>
          {diff && (
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", padding: 6, fontSize: 11, fontFamily: "monospace" }}>
              {diff.length === 0 ? <div style={{ color: "#6b7280" }}>两版内容一致</div> : diff.map((op, i) => <DiffLine key={i} op={op} />)}
            </div>
          )}

          {/* AI 成本记录（REQ-143 完整：token/费用/模型/切片） */}
          {usage.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#374151", marginBottom: 4 }}>AI 成本记录</div>
              {usage.map((u) => (
                <div key={u.id} style={{ fontSize: 11, color: "#6b7280", padding: "2px 0" }}>
                  {fmtTime(u.createdAt)} · {u.opType === "refine" ? "精修" : "补充"} · in {u.tokensIn} / out {u.tokensOut} token · ¥{u.costYuan.toFixed(4)} · {u.model} · {u.slices} 片
                </div>
              ))}
            </div>
          )}

          {msg && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
