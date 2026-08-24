/**
 * KnowledgeSampleView — 摄影示例体系浏览 + 一键复制（v0.13.7 具象化）。
 *
 * @ai-context: 示例≠预填（纪律裁决 2026-08-24）——浏览是被动参照；复制是
 *              主动获得骨架（"待改造"非"已完成"）。无全局体系时阻塞等待
 *              用户先建全局（onNeedGlobal 由父级开全局向导）。
 * @ai-context: 复制落库顺序 golden——create_knowledge_system → 逐条
 *              add_knowledge_node（parentId 由"示例内数组下标"映射为真实 id，
 *              串行保证父先于子）→ 概念 ×3 → 模型 ×1。顺序在测试有断言，勿改。
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SAMPLE_SYSTEM } from "../utils/knowledgeSample";
import type { KnowledgeSystem } from "../types/knowledge";

interface Props {
  /** 复制完成回调（父级刷新体系列表并选中新体系） */
  onCopied: (system: KnowledgeSystem) => void;
  /** 无全局体系时触发（父级打开全局创建向导；完成后父级调用 refreshGlobal 重试） */
  onNeedGlobal: () => void;
  /** 外部刷新信号（全局创建完成后父级触发） */
  refreshGlobal?: number;
}

export default function KnowledgeSampleView({ onCopied, onNeedGlobal, refreshGlobal = 0 }: Props) {
  const [globalSystem, setGlobalSystem] = useState<KnowledgeSystem | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const checkGlobal = async () => {
    try {
      const list = await invoke<KnowledgeSystem[]>("list_knowledge_systems");
      setGlobalSystem(list.find((s) => s.kind === "global") ?? null);
    } catch (e) {
      setErr(`体系检查失败: ${e}`);
    }
  };
  useEffect(() => { void checkGlobal(); }, [refreshGlobal]);

  const tree = useMemo(() => {
    const byParent = new Map<number | null, { type: string; text: string; index: number }[]>();
    SAMPLE_SYSTEM.nodes.forEach((n, i) => {
      const list = byParent.get(n.parentId) ?? [];
      list.push({ type: n.type, text: n.text, index: i });
      byParent.set(n.parentId, list);
    });
    return byParent;
  }, []);

  const renderNodes = (parentId: number | null, depth: number): ReactNode =>
    (tree.get(parentId) ?? []).map((n) => (
      <div key={n.index} style={{ paddingLeft: depth * 14, fontSize: 12, marginTop: 2 }}>
        {n.type === "question" ? "❓" : n.type === "scenario" ? "🎯" : "📂"} {n.text}
        {renderNodes(n.index, depth + 1)}
      </div>
    ));

  const runCopy = async () => {
    if (busy) return;
    if (!globalSystem) { onNeedGlobal(); return; }
    setBusy(true); setErr("");
    try {
      const sys = await invoke<KnowledgeSystem>("create_knowledge_system", {
        name: SAMPLE_SYSTEM.name,
        kind: SAMPLE_SYSTEM.kind,
        parentSystemId: globalSystem.id,
        coreQuestion: SAMPLE_SYSTEM.coreQuestion,
      });
      // 示例内 parentId 是 nodes 数组下标索引 → 落库时维护 index → 真实 node id 映射。
      // 子节点 parentId 恒指向更小的下标（父先于子），串行创建即可满足映射。
      const idMap = new Map<number, number>();
      for (let index = 0; index < SAMPLE_SYSTEM.nodes.length; index++) {
        const n = SAMPLE_SYSTEM.nodes[index];
        const realParentId = n.parentId == null ? undefined : idMap.get(n.parentId);
        const created = await invoke<{ id: number }>("add_knowledge_node", {
          systemId: sys.id,
          parentId: realParentId,
          nodeType: n.type,
          text: n.text,
        });
        idMap.set(index, created.id);
      }
      for (const c of SAMPLE_SYSTEM.concepts) {
        await invoke("add_knowledge_concept", {
          systemId: sys.id, name: c.name, essence: c.essence, boundary: c.boundary, relation: c.relation,
        });
      }
      for (const m of SAMPLE_SYSTEM.models) {
        await invoke("add_knowledge_model", {
          systemId: sys.id, name: m.name, disciplines: m.disciplines, claim: m.claim,
          validWhen: m.validWhen, invalidWhen: m.invalidWhen,
        });
      }
      onCopied(sys);
    } catch (e) {
      setErr(`复制失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="sample-view" style={{ width: "100%", maxWidth: 560, textAlign: "left", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f766e", marginBottom: 4 }}>📷 示例：领域体系「{SAMPLE_SYSTEM.name}」</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>核心问题：{SAMPLE_SYSTEM.coreQuestion}</div>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>🌳 问题树</div>
      {renderNodes(null, 0)}
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>🧬 概念（三问）</div>
      {SAMPLE_SYSTEM.concepts.map((c) => (
        <div key={c.name} style={{ fontSize: 12, marginBottom: 6, padding: 6, background: "#f9fafb", borderRadius: 6 }}>
          <b>{c.name}</b>
          <div style={{ color: "#6b7280" }}>本质：{c.essence}</div>
          <div style={{ color: "#6b7280" }}>边界：{c.boundary}</div>
          <div style={{ color: "#6b7280" }}>联系：{c.relation}</div>
        </div>
      ))}
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>⚙ 模型</div>
      {SAMPLE_SYSTEM.models.map((m) => (
        <div key={m.name} style={{ fontSize: 12, padding: 6, background: "#f9fafb", borderRadius: 6 }}>
          <b>{m.name}</b>（{m.disciplines.join("/")}）
          <div style={{ color: "#6b7280" }}>主张：{m.claim}</div>
          <div style={{ color: "#6b7280" }}>何时成立：{m.validWhen} · 何时失效：{m.invalidWhen}</div>
        </div>
      ))}
      <button
        data-testid="sample-copy"
        onClick={() => void runCopy()}
        disabled={busy}
        style={{ marginTop: 12, fontSize: 13, cursor: "pointer", padding: "8px 18px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e", fontWeight: 600 }}
      >
        {busy ? "复制中…" : "📋 复制为我的体系"}
      </button>
      {err && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6 }}>{err}</div>}
    </div>
  );
}
