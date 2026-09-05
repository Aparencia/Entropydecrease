/**
 * NoteLinkToSystem — 笔记「挂到体系」选择器（v0.13.7 触点②；v0.14 C3 增强；
 *                     REQ-286 v0.19.7 重构：搜索列表 + 三类内联轻建）。
 *
 * @ai-context: 用户痛点（反馈 #5）：挂接时体系常无目标节点，却须切体系页新建。
 *              v0.19.7 起：Tab+下拉改为「Tab + LinkEntityPicker（搜索+树形
 *              列表）」；问题行点击=挂接目标（同时充当「其下新建」父锚点）；
 *              搜索输入非空 → 「＋ 新建『xx』」即建即选（问题挂选中节点下/
 *              体系根；概念/模型体系级平铺、轻建=名称级，三问/命题详情回
 *              体系页既有对话框补全）。创建命令复用既有 add_knowledge_*
 *              （含 knowledge 域广播），零新后端。
 * @ai-context: 反查已挂（list_links_by_target）、切换目标先撤旧链（幂等防堆
 *              积）、REQ-276 右缘钳制浮层均保持既有语义。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  KnowledgeConcept, KnowledgeLink, KnowledgeModel, KnowledgeNode, KnowledgeSystem,
} from "../types/knowledge";
import LinkEntityPicker, { type LinkRow } from "./LinkEntityPicker";

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

/** 问题节点树 → 缩进行（父链循环守卫防脏数据死循环；深度上限 30） */
function flattenNodeRows(nodes: KnowledgeNode[]): LinkRow[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<number | null, KnowledgeNode[]>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    const arr = children.get(key) ?? [];
    arr.push(n);
    children.set(key, arr);
  }
  const rows: LinkRow[] = [];
  const depthOf = new Map<number, number>();
  const walk = (node: KnowledgeNode, depth: number) => {
    if (depth > 30) return; // 脏父链守卫（防御性，不 panic）
    depthOf.set(node.id, Math.min(depth, 30));
    for (const c of children.get(node.id) ?? []) walk(c, depth + 1);
  };
  for (const root of children.get(null) ?? []) walk(root, 0);
  // 孤儿兜底（父节点被删的残留——仍可选可挂，深度按父链现算封顶）
  for (const n of nodes) {
    if (depthOf.has(n.id)) continue;
    let d = 0;
    let cur: KnowledgeNode | undefined = n;
    const guard = new Set<number>();
    while (cur?.parentId != null && !guard.has(cur.parentId)) {
      guard.add(cur.parentId);
      d += 1;
      cur = byId.get(cur.parentId);
    }
    depthOf.set(n.id, Math.min(d, 30));
  }
  for (const n of nodes) rows.push({ id: n.id, label: n.text, depth: depthOf.get(n.id) ?? 0 });
  return rows;
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
      const hits = await invoke<KnowledgeLink[]>("list_links_by_target", { targetType: "note", targetId: noteId });
      setLinked(hits[0] ?? null);
      setErr("");
    } catch (e) { setErr(`体系加载失败: ${e}`); }
  }, [noteId]);

  useEffect(() => { void load(); }, [load]);

  // 已挂体系预选（未手动选体系时回退到当前挂接体系——实体名映射需要其列表）
  const effectiveSystemId = systemId ?? linked?.systemId ?? null;

  /** 按体系装载三类实体（体系一变即重置选择——防残留实体串体系） */
  const loadEntities = useCallback(async (sid: number | null) => {
    if (sid == null) { setNodes([]); setConcepts([]); setModels([]); return; }
    const [ns, cs, ms] = await Promise.all([
      invoke<KnowledgeNode[]>("list_knowledge_nodes", { systemId: sid }).catch((e) => { setErr(`节点加载失败: ${e}`); return [] as KnowledgeNode[]; }),
      invoke<KnowledgeConcept[]>("list_knowledge_concepts", { systemId: sid }).catch((e) => { setErr(`概念加载失败: ${e}`); return [] as KnowledgeConcept[]; }),
      invoke<KnowledgeModel[]>("list_knowledge_models", { systemId: sid }).catch((e) => { setErr(`模型加载失败: ${e}`); return [] as KnowledgeModel[]; }),
    ]);
    setNodes(ns); setConcepts(cs); setModels(ms);
  }, []);

  // 审查 D4：体系切换代际守卫——轻建在途（await 列表重载）期间若用户切换
  // 体系，旧代结果不得覆盖新体系选择/列表
  const entityGenRef = useRef(0);

  useEffect(() => {
    entityGenRef.current += 1;
    setEntityId(null);
    void loadEntities(effectiveSystemId);
  }, [effectiveSystemId, loadEntities]);

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

  // REQ-286：三类内联轻建——复用既有 add_knowledge_* 命令（含 knowledge 域广播）；
  // 问题=建于选中节点下（默认体系根）；概念/模型=名称级体系级平铺（三问/命题
  // 留空，详情回体系页既有对话框补全；模型学科占位「未分类」可后改）
  const createEntity = useCallback(async (name: string, anchorId: number | null) => {
    if (effectiveSystemId == null) throw new Error("请先选择体系");
    const gen = entityGenRef.current;
    let id: number;
    if (entityType === "node") {
      const n = await invoke<KnowledgeNode>("add_knowledge_node", {
        systemId: effectiveSystemId, parentId: anchorId ?? null, nodeType: "question", text: name,
      });
      id = n.id;
    } else if (entityType === "concept") {
      const c = await invoke<KnowledgeConcept>("add_knowledge_concept", {
        systemId: effectiveSystemId, name, essence: null, boundary: null, relation: null,
      });
      id = c.id;
    } else {
      // 审查 D1：Rust 契约 disciplines:String=JSON 数组字符串（normalize_disciplines
      // 只认 JSON 数组）——裸串必拒；同 KnowledgeSampleView JSON.stringify 范式
      const m = await invoke<KnowledgeModel>("add_knowledge_model", {
        systemId: effectiveSystemId, name, disciplines: JSON.stringify(["未分类"]),
        claim: null, validWhen: null, invalidWhen: null,
      });
      id = m.id;
    }
    await loadEntities(effectiveSystemId); // 列表重载（新增即见）
    // 审查 D4：代际一致才回填选择（期间切体系则丢弃本次回填）
    if (entityGenRef.current === gen) {
      setEntityId(id); // 即建即选——确认挂接一步收尾
    }
  }, [effectiveSystemId, entityType, loadEntities]);

  const nodeRows = useMemo(() => flattenNodeRows(nodes), [nodes]);
  const conceptRows = useMemo(
    () => concepts.map((c): LinkRow => ({ id: c.id, label: c.name, depth: 0 })),
    [concepts],
  );
  const modelRows = useMemo(
    () => models.map((m): LinkRow => ({ id: m.id, label: m.name, depth: 0 })),
    [models],
  );
  const activeRows = entityType === "node" ? nodeRows : entityType === "concept" ? conceptRows : modelRows;
  const kindMeta = {
    node: { kindLabel: "问题", placeholder: "搜索/输入新问题名…（回车即建）", rootAnchor: "体系根" },
    concept: { kindLabel: "概念", placeholder: "搜索/输入新概念名…（回车即建）", rootAnchor: "体系内" },
    model: { kindLabel: "模型", placeholder: "搜索/输入新模型名…（回车即建）", rootAnchor: "体系内" },
  }[entityType];

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
              display: "flex", flexDirection: "column", gap: 6, width: 280,
              maxHeight: 460, overflowY: "auto",
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

              {/* v0.14 C3：挂接目标三选一（问题/概念/模型） */}
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

              {/* REQ-286：搜索 + 列表（树形缩进）+ 行内轻建 */}
              {effectiveSystemId == null ? (
                <div style={{ fontSize: 11, color: "#9ca3af" }}>请先选择体系</div>
              ) : (
                <LinkEntityPicker
                  rows={activeRows}
                  selectedId={entityId}
                  placeholder={kindMeta.placeholder}
                  kindLabel={kindMeta.kindLabel}
                  rootAnchorLabel={kindMeta.rootAnchor}
                  onPick={(id) => setEntityId(id)}
                  onCreate={createEntity}
                  onClose={() => setOpen(false)}
                />
              )}

              {linked ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    data-testid="note-link-confirm"
                    onClick={() => void confirmLink()}
                    disabled={busy || entityId == null}
                    style={{ flex: 1, fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 4, border: "1px solid #0f766e", background: entityId == null ? "#f9fafb" : "#f0fdfa", color: entityId == null ? "#9ca3af" : "#0f766e" }}
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
                  disabled={busy || entityId == null}
                  style={{ fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 4, border: "1px solid #0f766e", background: entityId == null ? "#f9fafb" : "#f0fdfa", color: entityId == null ? "#9ca3af" : "#0f766e" }}
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
