/**
 * NoteLinkToSystem — 笔记「挂到体系」选择器（v0.13.7 触点②；v0.14 C3 增强）。
 *
 * @ai-context: 修复知识链接手工输 id 断点（v0.13.1 遗留）——用户在笔记
 *              阅读视图把当前笔记挂到体系：选体系→选目标（问题/概念/模型
 *              三选一，spec §3.3 根因 A 修复）→确认，targetType=note 与
 *              targetId 自动携带，用户零 id 知识。
 * @ai-context: v0.14 C3——已挂状态用反查命令 list_links_by_target 一次拉取
 *              （替代逐体系正查聚合）；挂接后可切换目标（先撤旧链再建新链——
 *              幂等语义下同 target 多链会堆积）；旧版本挂接数据（仅 nodeId）
 *              自动兼容，UI 显示「问题」徽标（spec §5）。变更经 onChanged 通知。
 * @ai-context: REQ-276（v0.19.4）浮层右缘钳制：挂体系按钮位于笔记阅读头右端，
 *              面板左锚点向右展开会越过阅读区/窗口右缘造成残缺——改按钮右
 *              对齐向左展开（与 NoteMoveToGroupMenu 同范式）+ 超高面板内滚动
 *              + 外部点击背板收起（同类浮层统查：分组已右对齐、色板靠左无越缘）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  KnowledgeConcept, KnowledgeLink, KnowledgeModel, KnowledgeNode, KnowledgeSystem,
} from "../types/knowledge";

/** 挂接目标类型：问题节点 / 概念 / 模型（spec §3.3 三选一） */
export type LinkEntityType = "node" | "concept" | "model";

const ENTITY_TABS: { key: LinkEntityType; label: string }[] = [
  { key: "node", label: "问题" },
  { key: "concept", label: "概念" },
  { key: "model", label: "模型" },
];

interface Props {
  noteId: number;
  /** 挂接/取消后刷新回调（NotesPage 重载引用列表） */
  onChanged: () => void;
}

export default function NoteLinkToSystem({ noteId, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [systems, setSystems] = useState<KnowledgeSystem[]>([]);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [concepts, setConcepts] = useState<KnowledgeConcept[]>([]);
  const [models, setModels] = useState<KnowledgeModel[]>([]);
  const [systemId, setSystemId] = useState<number | null>(null);
  const [entityType, setEntityType] = useState<LinkEntityType>("node");
  const [entityId, setEntityId] = useState<number | null>(null);
  const [linked, setLinked] = useState<KnowledgeLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const sysList = await invoke<KnowledgeSystem[]>("list_knowledge_systems");
      setSystems(sysList);
      // v0.14 C3：反查命令一次拉取当前笔记全部挂接（替代逐体系正查聚合）
      const hits = await invoke<KnowledgeLink[]>("list_links_by_target", { targetType: "note", targetId: noteId });
      setLinked(hits[0] ?? null);
      setErr(""); // 成功后清掉陈旧错误（审查修复）
    } catch (e) { setErr(`体系加载失败: ${e}`); }
  }, [noteId]);

  useEffect(() => { void load(); }, [load]);

  // 已挂体系预选（未手动选体系时回退到当前挂接体系——实体名映射需要其列表）
  const effectiveSystemId = systemId ?? linked?.systemId ?? null;

  // 选体系后并行加载三类实体（体系一变即重置实体选择——防残留实体串体系
  // 被后端拒「引用实体不属于该体系」，审查修复）
  useEffect(() => {
    setEntityId(null);
    if (effectiveSystemId == null) { setNodes([]); setConcepts([]); setModels([]); return; }
    invoke<KnowledgeNode[]>("list_knowledge_nodes", { systemId: effectiveSystemId }).then(setNodes).catch((e) => setErr(`节点加载失败: ${e}`));
    invoke<KnowledgeConcept[]>("list_knowledge_concepts", { systemId: effectiveSystemId }).then(setConcepts).catch((e) => setErr(`概念加载失败: ${e}`));
    invoke<KnowledgeModel[]>("list_knowledge_models", { systemId: effectiveSystemId }).then(setModels).catch((e) => setErr(`模型加载失败: ${e}`));
  }, [effectiveSystemId]);

  const domainSystems = useMemo(() => systems.filter((s) => s.status !== "archived"), [systems]);

  const linkedLabel = useMemo(() => {
    if (!linked) return "";
    if (linked.conceptId != null) {
      const c = concepts.find((x) => x.id === linked.conceptId);
      return c ? `概念 · ${c.name}` : `概念 #${linked.conceptId}`;
    }
    if (linked.modelId != null) {
      const m = models.find((x) => x.id === linked.modelId);
      return m ? `模型 · ${m.name}` : `模型 #${linked.modelId}`;
    }
    const n = nodes.find((x) => x.id === linked.nodeId);
    return n ? `问题 · ${n.text.slice(0, 16)}` : `问题 #${linked.nodeId}`;
  }, [linked, nodes, concepts, models]);

  const confirmLink = async () => {
    if (effectiveSystemId == null || entityId == null) return;
    setBusy(true); setErr("");
    try {
      // 切换目标：先撤旧链再建新链（幂等语义下同 target 多链会堆积，切换必须先删）
      if (linked) await invoke("delete_knowledge_link", { id: linked.id });
      const payload: Record<string, unknown> = {
        systemId: effectiveSystemId, targetType: "note", targetId: noteId,
      };
      payload[`${entityType}Id`] = entityId;
      await invoke("link_knowledge_target", payload);
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
        title={linked ? "点击管理/切换挂接目标" : "把这条笔记挂到体系的问题/概念/模型上"}
      >
        {linked ? `🧭 已挂 · ${linkedSystem?.name ?? "体系"}` : "🧭 挂到体系"}
      </button>
      {linked && (
        <span data-testid="note-link-linked-label" style={{ fontSize: 10, color: "#0f766e", paddingLeft: 2 }}>
          {linkedLabel}
        </span>
      )}

      {open && (
        <>
          {/* REQ-276：透明背板（与 NoteMoveToGroupMenu 同范式）——点击外部收起 */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent" }}
          />
          <div
            data-testid="note-link-panel"
            style={{
              position: "absolute", zIndex: 31, top: "calc(100% + 6px)", right: 0,
              padding: 10, background: "#fff", border: "1px solid #e5e7eb",
              borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              display: "flex", flexDirection: "column", gap: 6, width: 260,
              // REQ-276：右缘钳制（挂体系按钮位于阅读头右端——向左展开不越右缘）；
              // 内容超高时面板内滚动（不撑破视口下缘）
              maxHeight: 380, overflowY: "auto",
            }}
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

              {/* v0.14 C3：挂接目标三选一（spec §3.3 根因 A 修复——不再只支持问题节点） */}
              <div data-testid="note-link-entity-tabs" style={{ display: "flex", gap: 2, background: "#f3f4f6", borderRadius: 8, padding: 1 }}>
                {ENTITY_TABS.map((t) => (
                  <button
                    key={t.key}
                    data-testid={`note-link-tab-${t.key}`}
                    onClick={() => { setEntityType(t.key); setEntityId(null); }}
                    style={{ flex: 1, fontSize: 11, cursor: "pointer", padding: "3px 0", borderRadius: 6, border: "none", background: entityType === t.key ? "#fff" : "transparent", color: entityType === t.key ? "#0f766e" : "#9ca3af", fontWeight: entityType === t.key ? 600 : 400 }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <select
                data-testid="note-link-entity"
                value={entityId ?? ""}
                onChange={(e) => setEntityId(Number(e.target.value) || null)}
                style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
                disabled={effectiveSystemId == null}
              >
                <option value="">选择{ENTITY_TABS.find((t) => t.key === entityType)?.label}…</option>
                {(entityType === "node" ? nodes : entityType === "concept" ? concepts : models).map((n) => (
                  <option key={n.id} value={n.id}>
                    {"text" in n ? (n.text as string).slice(0, 24) : (n as KnowledgeConcept).name.slice(0, 24)}
                  </option>
                ))}
              </select>

              {linked ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    data-testid="note-link-confirm"
                    onClick={() => void confirmLink()}
                    disabled={busy || effectiveSystemId == null || entityId == null}
                    style={{ flex: 1, fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 4, border: "1px solid #0f766e", background: effectiveSystemId == null || entityId == null ? "#f9fafb" : "#f0fdfa", color: effectiveSystemId == null || entityId == null ? "#9ca3af" : "#0f766e" }}
                  >
                    {busy ? "处理中…" : "切换目标"}
                  </button>
                  <button
                    data-testid="note-link-unlink"
                    onClick={() => void unlink()}
                    disabled={busy}
                    style={{ flex: 1, fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#dc2626" }}
                  >
                    {busy ? "处理中…" : "取消挂接"}
                  </button>
                </div>
              ) : (
                <button
                  data-testid="note-link-confirm"
                  onClick={() => void confirmLink()}
                  disabled={busy || effectiveSystemId == null || entityId == null}
                  style={{ fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 4, border: "1px solid #0f766e", background: effectiveSystemId == null || entityId == null ? "#f9fafb" : "#f0fdfa", color: effectiveSystemId == null || entityId == null ? "#9ca3af" : "#0f766e" }}
                >
                  {busy ? "挂接中…" : "确认挂接"}
                </button>
              )}
            </>
          )}
          {err && <div style={{ fontSize: 11, color: "#dc2626" }}>{err}</div>}
          </div>
        </>
      )}
    </span>
  );
}
