/**
 * NoteLinkToSystem — 笔记「挂到体系」选择器（v0.13.7 触点②）。
 *
 * @ai-context: 修复知识链接手工输 id 断点（v0.13.1 遗留）——用户在笔记
 *              阅读视图把当前笔记挂到体系节点：选体系→选节点→确认，
 *              targetType=note/targetId 自动携带，用户零 id 知识。
 * @ai-context: 已挂状态反查 list_knowledge_links（后端强制 system_id——
 *              按体系逐次查询聚合，再按 targetType=note 过滤；与触点①
 *              GroupSidebar 全量直取不同——本组件查询时体系列表已就绪）；
 *              取消走 delete_knowledge_link；变更经 onChanged 通知刷新。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KnowledgeLink, KnowledgeNode, KnowledgeSystem } from "../types/knowledge";

interface Props {
  noteId: number;
  /** 挂接/取消后刷新回调（NotesPage 重载引用列表） */
  onChanged: () => void;
}

export default function NoteLinkToSystem({ noteId, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [systems, setSystems] = useState<KnowledgeSystem[]>([]);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [systemId, setSystemId] = useState<number | null>(null);
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [linked, setLinked] = useState<KnowledgeLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const sysList = await invoke<KnowledgeSystem[]>("list_knowledge_systems");
      setSystems(sysList);
      // list_knowledge_links 后端强制 system_id（None 报"必须指定体系"）——
      // 按非归档体系逐次查询后聚合，再反查当前笔记的挂接
      const active = sysList.filter((s) => s.status !== "archived");
      const linkGroups = await Promise.all(
        active.map((s) => invoke<KnowledgeLink[]>("list_knowledge_links", { systemId: s.id })),
      );
      const links = linkGroups.flat();
      setLinked(links.find((l) => l.targetType === "note" && l.targetId === noteId) ?? null);
      setErr(""); // 成功后清掉陈旧错误（审查修复）
    } catch (e) { setErr(`体系加载失败: ${e}`); }
  }, [noteId]);

  useEffect(() => { void load(); }, [load]);

  // 选体系后拉取该体系节点树（体系一变即重置节点选择——
  // 防残留 nodeId 串体系被后端拒「引用实体不属于该体系」，审查修复）
  useEffect(() => {
    setNodeId(null);
    if (systemId == null) { setNodes([]); return; }
    invoke<KnowledgeNode[]>("list_knowledge_nodes", { systemId })
      .then(setNodes)
      .catch((e) => setErr(`节点加载失败: ${e}`));
  }, [systemId]);

  const domainSystems = useMemo(() => systems.filter((s) => s.status !== "archived"), [systems]);
  const effectiveSystemId = systemId ?? linked?.systemId ?? null;

  const confirmLink = async () => {
    if (effectiveSystemId == null) return;
    setBusy(true); setErr("");
    try {
      await invoke("link_knowledge_target", {
        systemId: effectiveSystemId,
        nodeId: nodeId ?? undefined,
        targetType: "note",
        targetId: noteId,
      });
      setOpen(false);
      await load();
      onChanged();
    } catch (e) { setErr(`挂接失败: ${e}`); } finally { setBusy(false); }
  };

  const unlink = async () => {
    if (!linked) return;
    setBusy(true); setErr("");
    try {
      await invoke("delete_knowledge_link", { id: linked.id });
      setLinked(null);
      setOpen(false);
      onChanged();
    } catch (e) { setErr(`取消挂接失败: ${e}`); } finally { setBusy(false); }
  };

  const linkedSystem = systems.find((s) => s.id === linked?.systemId) ?? null;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 4, position: "relative" }}>
      <button
        data-testid="note-link-open"
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 12, cursor: "pointer", padding: "4px 10px", borderRadius: 4,
          border: linked ? "1px solid #99f6e4" : "1px solid #d1d5db",
          background: linked ? "#f0fdfa" : "#fff",
          color: linked ? "#0f766e" : "#374151",
        }}
        title={linked ? "点击管理体系挂接" : "把这条笔记挂到体系的问题/概念上"}
      >
        {linked ? `🧭 已挂 · ${linkedSystem?.name ?? "体系"}` : "🧭 挂到体系"}
      </button>

      {open && (
        <div
          data-testid="note-link-panel"
          style={{ position: "absolute", zIndex: 30, marginTop: 30, padding: 10, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", gap: 6, width: 260 }}
        >
          {domainSystems.length === 0 ? (
            <div data-testid="note-link-empty" style={{ fontSize: 12, color: "#9ca3af" }}>暂无体系——请先到「🧠 体系」页创建。</div>
          ) : (
            <>
              <select
                data-testid="note-link-system"
                value={effectiveSystemId ?? ""}
                onChange={(e) => setSystemId(Number(e.target.value) || null)}
                style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
              >
                <option value="">选择体系…</option>
                {domainSystems.map((s) => (
                  <option key={s.id} value={s.id}>{s.kind === "global" ? "🌐 " : "📂 "}{s.name}</option>
                ))}
              </select>
              <select
                data-testid="note-link-node"
                value={nodeId ?? ""}
                onChange={(e) => setNodeId(Number(e.target.value) || null)}
                style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
                disabled={effectiveSystemId == null}
              >
                <option value="">选择节点…</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.text.slice(0, 24)}</option>
                ))}
              </select>
              {linked ? (
                <button
                  data-testid="note-link-unlink"
                  onClick={() => void unlink()}
                  disabled={busy}
                  style={{ fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#dc2626" }}
                >
                  {busy ? "处理中…" : "取消挂接"}
                </button>
              ) : (
                <button
                  data-testid="note-link-confirm"
                  onClick={() => void confirmLink()}
                  disabled={busy || effectiveSystemId == null || nodeId == null}
                  style={{ fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 4, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}
                >
                  {busy ? "挂接中…" : "确认挂接"}
                </button>
              )}
            </>
          )}
          {err && <div style={{ fontSize: 11, color: "#dc2626" }}>{err}</div>}
        </div>
      )}
    </span>
  );
}
