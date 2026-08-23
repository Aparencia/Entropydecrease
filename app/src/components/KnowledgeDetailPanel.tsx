/**
 * KnowledgeDetailPanel — 知识体系右栏详情面板（v0.13.1 §五）。
 *
 * @ai-context: 按选中实体三态分派——节点（只读信息 + 引用）/概念（三问编辑）/
 *              模型（跨国学科断言编辑）。新建态（selection.id===null）复用编辑器
 *              走 add_* command（编辑器与列表共用同一 UI，免重复表单）。
 * @ai-context: 概念名全局唯一（§二）——保存时依赖 command 层唯一校验报错，
 *              前端仅做非空拦截；三问（本质/边界/联系）为概念记忆面的提问骨架。
 * @ai-context: 面板整体可折叠（§五 折叠按钮）——折叠成窄栏保留可读性，
 *              不占主树空间。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  KnowledgeSystem, KnowledgeNode, KnowledgeConcept, KnowledgeModel,
  KnowledgeLink, KnowledgeSelection, KnowledgeConceptStatus, KnowledgeModelStatus,
} from "../types/knowledge";
import { nodeTypeLabel, conceptStatusLabel } from "../types/knowledge";
import KnowledgeLinkSection from "./KnowledgeLinkSection";

interface Props {
  system: KnowledgeSystem;
  nodes: KnowledgeNode[];
  concepts: KnowledgeConcept[];
  models: KnowledgeModel[];
  links: KnowledgeLink[];
  selection: KnowledgeSelection | null;
  onChanged: () => void;
}

/** 概念状态选项（core/watching/archived） */
const CONCEPT_STATUSES: KnowledgeConceptStatus[] = ["core", "watching", "archived"];
/** 模型状态选项（active/watching/archived） */
const MODEL_STATUSES: KnowledgeModelStatus[] = ["active", "watching", "archived"];

export default function KnowledgeDetailPanel({ system, nodes, concepts, models, links, selection, onChanged }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  // 概念/模型编辑草稿（与选中实体同步）
  const [cName, setCName] = useState("");
  const [cEssence, setCEssence] = useState("");
  const [cBoundary, setCBoundary] = useState("");
  const [cRelation, setCRelation] = useState("");
  const [cStatus, setCStatus] = useState<KnowledgeConceptStatus>("core");
  const [mName, setMName] = useState("");
  const [mDisciplines, setMDisciplines] = useState("");
  const [mClaim, setMClaim] = useState("");
  const [mValidWhen, setMValidWhen] = useState("");
  const [mInvalidWhen, setMInvalidWhen] = useState("");
  const [mStatus, setMStatus] = useState<KnowledgeModelStatus>("active");

  // 选中实体变化 → 同步编辑器草稿（新建态清空）
  useEffect(() => {
    if (selection?.type === "concept") {
      const c = concepts.find((x) => x.id === selection.id) ?? null;
      setCName(c?.name ?? "");
      setCEssence(c?.essence ?? "");
      setCBoundary(c?.boundary ?? "");
      setCRelation(c?.relation ?? "");
      setCStatus(c?.status ?? "core");
      setErr("");
    }
    if (selection?.type === "model") {
      const m = models.find((x) => x.id === selection.id) ?? null;
      setMName(m?.name ?? "");
      setMDisciplines(m ? m.disciplines.join(", ") : "");
      setMClaim(m?.claim ?? "");
      setMValidWhen(m?.validWhen ?? "");
      setMInvalidWhen(m?.invalidWhen ?? "");
      setMStatus(m?.status ?? "active");
      setErr("");
    }
  }, [selection, concepts, models]);

  const saveConcept = async () => {
    if (!cName.trim()) { setErr("概念名不能为空"); return; }
    setSaving(true); setErr("");
    try {
      const common = { name: cName.trim(), essence: cEssence.trim() || null, boundary: cBoundary.trim() || null, relation: cRelation.trim() || null };
      if (selection?.id == null) await invoke("add_knowledge_concept", { systemId: system.id, ...common });
      else await invoke("update_knowledge_concept", { id: selection.id, ...common, status: cStatus });
      onChanged();
    } catch (e) { setErr(`概念保存失败: ${e}`); } finally { setSaving(false); }
  };

  const saveModel = async () => {
    if (!mName.trim()) { setErr("模型名不能为空"); return; }
    setSaving(true); setErr("");
    try {
      const disciplines = mDisciplines.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      if (disciplines.length === 0) { setErr("至少填写一个学科"); setSaving(false); return; }
      const common = {
        name: mName.trim(), disciplines,
        claim: mClaim.trim() || null, validWhen: mValidWhen.trim() || null, invalidWhen: mInvalidWhen.trim() || null,
      };
      if (selection?.id == null) await invoke("add_knowledge_model", { systemId: system.id, ...common });
      else await invoke("update_knowledge_model", { id: selection.id, ...common, status: mStatus });
      onChanged();
    } catch (e) { setErr(`模型保存失败: ${e}`); } finally { setSaving(false); }
  };

  // 折叠态：窄栏
  if (collapsed) {
    return (
      <div data-testid="detail-panel" style={{ width: 34, flexShrink: 0, borderLeft: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", background: "#fafafa" }}>
        <button data-testid="detail-expand" onClick={() => setCollapsed(false)} title="展开详情面板" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }}>
          ◂
        </button>
      </div>
    );
  }

  const selectedNode = selection?.type === "node" ? nodes.find((n) => n.id === selection.id) ?? null : null;

  return (
    <div data-testid="detail-panel" style={{ width: 320, flexShrink: 0, borderLeft: "1px solid #e5e7eb", display: "flex", flexDirection: "column", minWidth: 0, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #e5e7eb" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>详情</span>
        <button data-testid="detail-collapse" onClick={() => setCollapsed(true)} title="折叠详情面板" style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }}>
          ▸
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
        {!selection && (
          <div style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", paddingTop: 40 }}>
            从中间选择一个实体查看详情
          </div>
        )}

        {/* ── 节点：只读信息 + 引用 ── */}
        {selection?.type === "node" && selectedNode && (
          <div>
            <div style={sectionTitle}>节点</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 4 }}>{selectedNode.text}</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 8, background: "#f9fafb", color: "#6b7280" }}>{nodeTypeLabel[selectedNode.type]}</span>
              <span style={{ fontSize: 11, color: "#9ca3af", alignSelf: "center" }}>
                父节点：{selectedNode.parentId != null ? (nodes.find((n) => n.id === selectedNode.parentId)?.text ?? "—") : "（根）"}
              </span>
            </div>
            <KnowledgeLinkSection systemId={system.id} entityType="node" entityId={selectedNode.id} links={links} onChanged={onChanged} />
          </div>
        )}

        {/* ── 概念：三问编辑 + 状态 + 引用（新建态无引用段） ── */}
        {selection?.type === "concept" && (
          <div>
            <div style={sectionTitle}>{selection.id == null ? "新建概念" : "概念"}</div>
            <label style={label}>名称 *</label>
            <input data-testid="concept-name" value={cName} onChange={(e) => setCName(e.target.value)} style={input} />
            <label style={label}>本质（它"是"什么）</label>
            <textarea data-testid="concept-essence" value={cEssence} onChange={(e) => setCEssence(e.target.value)} rows={2} style={textarea} />
            <label style={label}>边界（它"不是"什么）</label>
            <textarea data-testid="concept-boundary" value={cBoundary} onChange={(e) => setCBoundary(e.target.value)} rows={2} style={textarea} />
            <label style={label}>联系（它和什么相关）</label>
            <textarea data-testid="concept-relation" value={cRelation} onChange={(e) => setCRelation(e.target.value)} rows={2} style={textarea} />
            <label style={label}>状态</label>
            <select data-testid="concept-status" value={cStatus} onChange={(e) => setCStatus(e.target.value as KnowledgeConceptStatus)} style={select}>
              {CONCEPT_STATUSES.map((s) => <option key={s} value={s}>{conceptStatusLabel[s]}</option>)}
            </select>
            <SaveButton label={selection.id == null ? "创建概念" : "保存更改"} saving={saving} onClick={() => void saveConcept()} dataTestid="concept-save" />
            {selection.id != null && <KnowledgeLinkSection systemId={system.id} entityType="concept" entityId={selection.id} links={links} onChanged={onChanged} />}
          </div>
        )}

        {/* ── 模型：多学科断言编辑 + 引用（新建态无引用段） ── */}
        {selection?.type === "model" && (
          <div>
            <div style={sectionTitle}>{selection.id == null ? "新建模型" : "模型"}</div>
            <label style={label}>名称 *</label>
            <input data-testid="model-name" value={mName} onChange={(e) => setMName(e.target.value)} style={input} />
            <label style={label}>学科（逗号分隔）</label>
            <input data-testid="model-disciplines" value={mDisciplines} onChange={(e) => setMDisciplines(e.target.value)} placeholder="编程, 学习方法" style={input} />
            <label style={label}>主张（claim）</label>
            <textarea data-testid="model-claim" value={mClaim} onChange={(e) => setMClaim(e.target.value)} rows={2} style={textarea} />
            <label style={label}>成立条件</label>
            <textarea data-testid="model-valid" value={mValidWhen} onChange={(e) => setMValidWhen(e.target.value)} rows={2} style={textarea} />
            <label style={label}>失效条件</label>
            <textarea data-testid="model-invalid" value={mInvalidWhen} onChange={(e) => setMInvalidWhen(e.target.value)} rows={2} style={textarea} />
            <label style={label}>状态</label>
            <select data-testid="model-status" value={mStatus} onChange={(e) => setMStatus(e.target.value as KnowledgeModelStatus)} style={select}>
              {MODEL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <SaveButton label={selection.id == null ? "创建模型" : "保存更改"} saving={saving} onClick={() => void saveModel()} dataTestid="model-save" />
            {selection.id != null && <KnowledgeLinkSection systemId={system.id} entityType="model" entityId={selection.id} links={links} onChanged={onChanged} />}
          </div>
        )}
      </div>

      {err && <p data-testid="detail-error" style={{ padding: "6px 12px", fontSize: 12, color: "#dc2626", borderTop: "1px solid #f3f4f6" }}>{err}</p>}
    </div>
  );
}

function SaveButton({ label, saving, onClick, dataTestid }: { label: string; saving: boolean; onClick: () => void; dataTestid: string }) {
  return (
    <button data-testid={dataTestid} onClick={onClick} disabled={saving} style={{ marginTop: 10, fontSize: 13, cursor: "pointer", padding: "6px 16px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>
      {saving ? "保存中…" : label}
    </button>
  );
}

/** 段标题样式 */
const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 };
/** 标签样式 */
const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", margin: "8px 0 3px" };
/** 输入样式 */
const input: React.CSSProperties = { width: "100%", fontSize: 13, padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" };
/** 文本域样式 */
const textarea: React.CSSProperties = { ...input, resize: "vertical", fontFamily: "inherit" };
/** 下拉样式 */
const select: React.CSSProperties = { width: "100%", fontSize: 12, padding: "5px 6px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" };
