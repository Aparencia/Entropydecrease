/**
 * KnowledgeDecisionForm — 四行决策/应用表单（v0.13.3 §五 UI 层）。
 *
 * @ai-context: 只记"我的决策"（一表两面，§一）——mode=decision 思辨面（🧭：我依据
 *              什么判断）/ application 学习面（🛠：我用它做了什么）。提交走
 *              log_decision / log_application；used_refs 是 JSON 字符串，引用必填
 *              （command 层强制，前端预拦截空引用——不产生无引用膨胀记录）。
 * @ai-context: 四行法（指南附录C）——content（决策内容/应用动作，必填）→ expectation
 *              （预期）→ actual（实际；允许负面——失败真实记录，不评质量）→ reflection
 *              （反思：如果重来改变什么）。占位=指南语义，**不预填内容**（预填＝假燃料）。
 * @ai-context: 引用选择器两组——体系实体（节点/概念/模型）：先选体系（默认当前）再
 *              实体多选；证据（组/笔记/闪卡/碎片）：组下拉→组内容物/碎片列表。
 *              application 且 conceptId 提供时默认带上 conceptIds=[conceptId]（挂概念）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  KnowledgeConcept, KnowledgeDecision, KnowledgeModel, KnowledgeNode,
  KnowledgeSystem, UsedRefs,
} from "../types/knowledge";
import { hasUsedRefs, serializeUsedRefs } from "../types/knowledge";
import type { Flashcard, Fragment, Note, NoteGroup } from "../types/notes";

interface Props {
  mode: "decision" | "application";
  /** 体系 id（概念所属体系；command systemId 必传） */
  systemId: number;
  /** 挂载概念 id（application 概念模式；默认带入 conceptIds=[conceptId]） */
  conceptId?: number | null;
  /** 保存成功回调（父层刷新详情/日志） */
  onSaved: (d: KnowledgeDecision) => void;
  /** 关闭表单 */
  onClose: () => void;
}

/** 模式徽标（决策=思辨面🧭 / 应用=学习面🛠） */
const MODE_BADGE: Record<"decision" | "application", { badge: string; title: string }> = {
  decision: { badge: "🧭", title: "记一个决策" },
  application: { badge: "🛠", title: "记一次使用" },
};

/** 初始 refs（application 且 conceptId 提供 → 默认挂当前概念） */
function initRefs(mode: "decision" | "application", conceptId: number | null | undefined): UsedRefs {
  return {
    nodeIds: [],
    conceptIds: mode === "application" && conceptId != null ? [conceptId] : [],
    modelIds: [],
    groupId: null, cardId: null, noteId: null, fragmentId: null,
  };
}

export default function KnowledgeDecisionForm({ mode, systemId, conceptId, onSaved, onClose }: Props) {
  const [content, setContent] = useState("");
  const [expectation, setExpectation] = useState("");
  const [actual, setActual] = useState("");
  const [reflection, setReflection] = useState("");
  const [systems, setSystems] = useState<KnowledgeSystem[]>([]);
  const [entitySystemId, setEntitySystemId] = useState(systemId);
  const [nodes, setNodes] = useState<KnowledgeNode[]>([]);
  const [concepts, setConcepts] = useState<KnowledgeConcept[]>([]);
  const [models, setModels] = useState<KnowledgeModel[]>([]);
  const [refs, setRefs] = useState<UsedRefs>(() => initRefs(mode, conceptId));
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupNotes, setGroupNotes] = useState<Note[]>([]);
  const [groupCards, setGroupCards] = useState<Flashcard[]>([]);
  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  /**
   * 加载选中体系的实体（节点/概念/模型）。
   * @ai-context: 引用选择器数据源；体系切换（entitySystemId）时重载，保证实体归属正确。
   */
  const loadEntities = useCallback(async (sid: number) => {
    try {
      const [ns, cs, ms] = await Promise.all([
        invoke<KnowledgeNode[]>("list_knowledge_nodes", { systemId: sid }),
        invoke<KnowledgeConcept[]>("list_knowledge_concepts", { systemId: sid }),
        invoke<KnowledgeModel[]>("list_knowledge_models", { systemId: sid }),
      ]);
      setNodes(ns); setConcepts(cs); setModels(ms);
    } catch (e) { setErr(`实体加载失败: ${e}`); }
  }, []);

  /** 加载选中组的笔记/闪卡（证据内容物；无组则清空） */
  const loadGroupContents = useCallback(async (gid: number) => {
    if (gid <= 0) { setGroupNotes([]); setGroupCards([]); return; }
    try {
      const [notes, cards] = await Promise.all([
        invoke<Note[]>("list_group_notes", { groupId: gid }),
        invoke<Flashcard[]>("list_group_cards", { groupId: gid }),
      ]);
      setGroupNotes(notes); setGroupCards(cards);
    } catch (e) { setErr(`组内容加载失败: ${e}`); }
  }, []);

  useEffect(() => {
    invoke<KnowledgeSystem[]>("list_knowledge_systems").then(setSystems).catch((e) => setErr(`体系加载失败: ${e}`));
    invoke<NoteGroup[]>("list_note_groups", { terrain: null }).then(setGroups).catch((e) => setErr(`笔记组加载失败: ${e}`));
    invoke<Fragment[]>("list_fragments", { status: "active", limit: 500 }).then(setFragments).catch((e) => setErr(`碎片加载失败: ${e}`));
    void loadEntities(systemId);
  }, [systemId, loadEntities]);

  /** 体系下拉选项：始终包含当前体系（即使 list_knowledge_systems 暂缺） */
  const systemOptions = useMemo(() => {
    const opts = systems.map((s) => ({ id: s.id, label: s.name }));
    if (!opts.some((o) => o.id === systemId)) opts.unshift({ id: systemId, label: `体系 #${systemId}` });
    return opts;
  }, [systems, systemId]);

  const toggleIn = (k: "nodeIds" | "conceptIds" | "modelIds", id: number) => {
    setRefs((r) => ({ ...r, [k]: r[k].includes(id) ? r[k].filter((x) => x !== id) : [...r[k], id] }));
  };
  const toggleEntitySystem = (sid: number) => {
    setEntitySystemId(sid);
    // 切体系重置实体选择；application 概念模式始终保留挂载概念（跨下拉不回退挂概念）
    setRefs((r) => ({ ...r, nodeIds: [], modelIds: [], conceptIds: mode === "application" && conceptId != null ? [conceptId] : [] }));
    void loadEntities(sid);
  };
  const toggleGroup = (gid: number) => {
    const next = groupId === gid ? null : gid;
    setGroupId(next);
    setRefs((r) => ({ ...r, groupId: next }));
    void loadGroupContents(next ?? 0);
  };
  const toggleSingle = (k: "cardId" | "noteId" | "fragmentId", id: number) => {
    setRefs((r) => ({ ...r, [k]: r[k] === id ? null : id }));
  };

  const submit = async () => {
    if (!content.trim()) { setErr("请填写决策内容/应用动作（必填）。"); return; }
    if (!hasUsedRefs(refs)) { setErr("请至少添加一个引用（体系实体或证据）。"); return; }
    setSaving(true); setErr("");
    try {
      // used_refs 序列化为 JSON 字符串（后端契约 snake_case 键；null 字段省略）；
      // 其余参数 camelCase
      const usedRefs = serializeUsedRefs(refs);
      const common = {
        content: content.trim(),
        expectation: expectation.trim() || null,
        actual: actual.trim() || null,
        reflection: reflection.trim() || null,
        usedRefs,
      };
      let saved: KnowledgeDecision;
      if (mode === "application") {
        saved = await invoke<KnowledgeDecision>("log_application", { conceptId, systemId, ...common });
      } else {
        saved = await invoke<KnowledgeDecision>("log_decision", { systemId, ...common });
      }
      onSaved(saved);
    } catch (e) { setErr(`保存失败: ${e}`); } finally { setSaving(false); }
  };

  const meta = MODE_BADGE[mode];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div data-testid="decision-form" onClick={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: "94vw", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 10px 40px rgba(0,0,0,0.15)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#0f766e" }}>{meta.badge} {meta.title}</span>
          <button data-testid="decision-form-close" onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }} title="关闭">✕</button>
        </div>

        <div style={{ padding: "12px 16px", maxHeight: "70vh", overflowY: "auto" }}>
          {/* ── 四行法 ── */}
          <Field label="决策内容 / 应用动作 *" testid="form-content" value={content} onChange={setContent} placeholder="一句话写下你判断/做了什么（不预填，写你自己的）。" />
          <Field label="预期结果" testid="form-expectation" value={expectation} onChange={setExpectation} placeholder="记下你当时预期会发生什么。" />
          <Field label="实际结果" testid="form-actual" value={actual} onChange={setActual} placeholder="后来实际发生了什么（允许失败——真实记录）。" />
          <Field label="反思：如果重来改变什么" testid="form-reflection" value={reflection} onChange={setReflection} placeholder="重来一次，你会改变什么？" />

          {/* ── 引用选择器 ── */}
          <div style={{ marginTop: 12, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6 }}>🔗 引用（必填）</div>
            {mode === "application" && conceptId != null && (
              <span data-testid="ref-badge-concept" style={{ fontSize: 11, padding: "1px 8px", borderRadius: 8, background: "#ecfdf5", color: "#047857", marginBottom: 6, display: "inline-block" }}>已挂概念 #{conceptId}</span>
            )}

            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "8px 0 4px" }}>体系实体</div>
            <select data-testid="form-system-select" value={entitySystemId} onChange={(e) => toggleEntitySystem(Number(e.target.value))} style={{ width: "100%", fontSize: 12, padding: "5px 6px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}>
              {systemOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <RefCheckboxList title="概念" items={concepts.map((c) => ({ id: c.id, label: c.name }))} checked={(id) => refs.conceptIds.includes(id)} onToggle={(id) => toggleIn("conceptIds", id)} dataPrefix="ref-concept" />
            <RefCheckboxList title="节点" items={nodes.map((n) => ({ id: n.id, label: n.text }))} checked={(id) => refs.nodeIds.includes(id)} onToggle={(id) => toggleIn("nodeIds", id)} dataPrefix="ref-node" />
            <RefCheckboxList title="模型" items={models.map((m) => ({ id: m.id, label: m.name }))} checked={(id) => refs.modelIds.includes(id)} onToggle={(id) => toggleIn("modelIds", id)} dataPrefix="ref-model" />

            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "10px 0 4px" }}>证据</div>
            <select data-testid="ref-group-select" value={groupId ?? ""} onChange={(e) => toggleGroup(Number(e.target.value))} style={{ width: "100%", fontSize: 12, padding: "5px 6px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}>
              <option value="">选择笔记组…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {groupId != null && (
              <>
                <RefCheckboxList title="笔记" items={groupNotes.map((n) => ({ id: n.id, label: n.title }))} checked={(id) => refs.noteId === id} onToggle={(id) => toggleSingle("noteId", id)} dataPrefix="ref-note" />
                <RefCheckboxList title="闪卡" items={groupCards.map((c) => ({ id: c.id, label: c.front }))} checked={(id) => refs.cardId === id} onToggle={(id) => toggleSingle("cardId", id)} dataPrefix="ref-card" />
              </>
            )}
            <RefCheckboxList title="碎片" items={fragments.map((f) => ({ id: f.id, label: f.text }))} checked={(id) => refs.fragmentId === id} onToggle={(id) => toggleSingle("fragmentId", id)} dataPrefix="ref-fragment" />
          </div>

          {err && <div data-testid="form-error" style={{ fontSize: 12, color: "#dc2626", marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px", lineHeight: 1.5 }}>{err}</div>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderTop: "1px solid #e5e7eb", background: "#fafafa" }}>
          <span style={{ flex: 1 }} />
          <button data-testid="decision-form-cancel" onClick={onClose} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}>取消</button>
          <button data-testid="form-submit" onClick={() => void submit()} disabled={saving} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>{saving ? "保存中…" : "保存"}</button>
        </div>
      </div>
    </div>
  );
}

/** 四行法单行字段（label + 文本域；不预填内容） */
function Field({ label, testid, value, onChange, placeholder }: { label: string; testid: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", margin: "6px 0 3px" }}>{label}</div>
      <textarea data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} style={{ width: "100%", fontSize: 13, padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
    </div>
  );
}

/** 复选列表（引用多选：概念/节点/模型/笔记/闪卡/碎片） */
function RefCheckboxList({ title, items, checked, onToggle, dataPrefix }: { title: string; items: { id: number; label: string }[]; checked: (id: number) => boolean; onToggle: (id: number) => void; dataPrefix: string }) {
  if (items.length === 0) return <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{title}：暂无</div>;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{title}</div>
      {items.map((it) => (
        <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "1px 0", cursor: "pointer" }}>
          <input type="checkbox" data-testid={`${dataPrefix}-${it.id}`} checked={checked(it.id)} onChange={() => onToggle(it.id)} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
        </label>
      ))}
    </div>
  );
}
