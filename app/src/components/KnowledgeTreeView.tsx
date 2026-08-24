/**
 * KnowledgeTreeView — 问题树渲染（v0.13.1 §五 中栏）。
 *
 * @ai-context: 树＋列表，不做图可视化（§五 UI 原则）——节点以递归列表呈现，
 *              每节点一个身份标签（问题/场景/领域入口）+ 挂载引用数（link 按
 *              nodeId 计数，整树批量拉取后计数）。节点操作 inline（加子节点/
 *              编辑文本/删除），避免弹窗割裂，符合"决策仪表盘"而非 Notion 树。
 * @ai-context: 删除级联（§四）——delete_knowledge_node 会删除整棵子树，故需
 *              二次确认明确告知代价；引用的 ON DELETE SET NULL 不落回节点本体。
 * @ai-context: 不预填内容——零节点时仅给出"从子问题开始"指引，绝不注入示例节点
 *              （预填＝假燃料）。
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { KnowledgeNode, KnowledgeLink, KnowledgeNodeType } from "../types/knowledge";
import { nodeTypeLabel } from "../types/knowledge";

interface Props {
  systemId: number;
  /** list_knowledge_nodes 返回的扁平列表（前端组树） */
  nodes: KnowledgeNode[];
  /** 当前体系的全部引用（按 nodeId 计挂载数） */
  links: KnowledgeLink[];
  selectedNodeId: number | null;
  onSelectNode: (id: number) => void;
  /** 数据变更后刷新（父页重载 nodes/links） */
  onChanged: () => void;
}

/** 节点类型配色（决策仪表盘质感） */
function typeColor(t: KnowledgeNodeType): string {
  if (t === "domain_entry") return "#7c3aed";
  if (t === "scenario") return "#d97706";
  return "#0f766e";
}

/** 当前正在添加的节点草稿（parentId=null 表示添加根节点） */
interface AddDraft {
  parentId: number | null;
  type: KnowledgeNodeType;
}

export default function KnowledgeTreeView({ systemId, nodes, links, selectedNodeId, onSelectNode, onChanged }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addDraft, setAddDraft] = useState<AddDraft | null>(null);
  const [addText, setAddText] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [status, setStatus] = useState("");

  // parentId -> children（同层按 orderIdx 再 id 排序，保持稳定）
  const children = useMemo(() => {
    const m = new Map<number | null, KnowledgeNode[]>();
    for (const n of nodes) {
      if (!m.has(n.parentId)) m.set(n.parentId, []);
      m.get(n.parentId)!.push(n);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.orderIdx - b.orderIdx || a.id - b.id);
    return m;
  }, [nodes]);

  // 每个节点挂载引用数（links 按 nodeId 计数）
  const refCount = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of links) {
      if (l.nodeId != null) m.set(l.nodeId, (m.get(l.nodeId) ?? 0) + 1);
    }
    return m;
  }, [links]);

  // 默认展开所有有子节点的节点（首次观察时整树可见；折叠/展开为显式动作）
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set<number>(prev);
      for (const n of nodes) if ((children.get(n.id)?.length ?? 0) > 0) next.add(n.id);
      return next;
    });
  }, [nodes, children]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startAdd = (parentId: number | null, type: KnowledgeNodeType = "question") => {
    setAddDraft({ parentId, type });
    setAddText("");
    setEditId(null);
    setStatus("");
  };

  const confirmAdd = async () => {
    if (!addDraft || !addText.trim()) return;
    try {
      await invoke("add_knowledge_node", { systemId, parentId: addDraft.parentId, nodeType: addDraft.type, text: addText.trim() });
      setAddDraft(null);
      setAddText("");
      onChanged();
    } catch (e) {
      setStatus(`添加失败: ${e}`);
    }
  };

  const startEdit = (n: KnowledgeNode) => {
    setEditId(n.id);
    setEditText(n.text);
    setAddDraft(null);
    setStatus("");
  };

  const confirmEdit = async () => {
    if (editId == null || !editText.trim()) return;
    try {
      await invoke("update_knowledge_node", { id: editId, text: editText.trim() });
      setEditId(null);
      onChanged();
    } catch (e) {
      setStatus(`更新失败: ${e}`);
    }
  };

  const del = async (n: KnowledgeNode) => {
    const ok = await confirm(`确定删除「${n.text}」？该节点的整棵子树将被级联删除。`, { title: "熵减", kind: "warning" });
    if (!ok) return;
    try {
      await invoke("delete_knowledge_node", { id: n.id });
      onChanged();
    } catch (e) {
      setStatus(`删除失败: ${e}`);
    }
  };

  const renderNode = (n: KnowledgeNode): React.ReactNode => {
    const kids = children.get(n.id) ?? [];
    const hasKids = kids.length > 0;
    const open = expanded.has(n.id);
    const isSelected = selectedNodeId === n.id;
    const count = refCount.get(n.id) ?? 0;
    const isEditing = editId === n.id;
    const isAddHere = addDraft?.parentId === n.id;

    return (
      <div key={n.id}>
        <div
          data-testid={`node-${n.id}`}
          onClick={() => onSelectNode(n.id)}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6,
            cursor: "pointer", background: isSelected ? "#f0fdfa" : "transparent",
            border: isSelected ? "1px solid #99f6e4" : "1px solid transparent",
          }}
        >
          <span
            data-testid={`node-toggle-${n.id}`}
            onClick={(e) => { e.stopPropagation(); if (hasKids) toggle(n.id); }}
            style={{ width: 14, cursor: hasKids ? "pointer" : "default", color: "#9ca3af", fontSize: 11, textAlign: "center" }}
          >
            {hasKids ? (open ? "▾" : "▸") : "·"}
          </span>
          <span data-testid={`node-type-${n.id}`} style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "#f9fafb", color: typeColor(n.type), whiteSpace: "nowrap" }}>
            {nodeTypeLabel[n.type]}
          </span>
          {isEditing ? (
            <input
              data-testid={`node-edit-input-${n.id}`}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              style={{ flex: 1, fontSize: 13, padding: "2px 6px", border: "1px solid #14b8a6", borderRadius: 4 }}
            />
          ) : (
            <span style={{ flex: 1, fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.text}</span>
          )}
          {count > 0 && (
            <span data-testid={`node-ref-${n.id}`} style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{count} 引用</span>
          )}
          {!isEditing && (
            <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", gap: 2 }}>
              <button data-testid={`node-add-${n.id}`} onClick={() => startAdd(n.id)} title="加子节点" style={actionBtn}>➕</button>
              <button data-testid={`node-edit-${n.id}`} onClick={() => startEdit(n)} title="编辑文本" style={actionBtn}>✏️</button>
              <button data-testid={`node-del-${n.id}`} onClick={() => void del(n)} title="删除（级联）" style={actionBtn}>🗑</button>
            </span>
          )}
        </div>

        {/* 子节点添加表单（inline） */}
        {isAddHere && (
          <div style={{ display: "flex", gap: 4, marginLeft: 28, alignItems: "center", padding: "3px 0" }}>
            <select data-testid="node-add-type" value={addDraft!.type} onChange={(e) => setAddDraft({ ...addDraft!, type: e.target.value as KnowledgeNodeType })} style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4 }}>
              {(Object.keys(nodeTypeLabel) as KnowledgeNodeType[]).map((t) => (
                <option key={t} value={t}>{nodeTypeLabel[t]}</option>
              ))}
            </select>
            <input data-testid="node-add-input" value={addText} onChange={(e) => setAddText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirmAdd(); }} placeholder="子问题…" style={{ flex: 1, fontSize: 12, padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }} />
            <button data-testid="node-add-confirm" onClick={() => void confirmAdd()} style={actionBtn}>✓</button>
            <button data-testid="node-add-cancel" onClick={() => setAddDraft(null)} style={actionBtn}>取消</button>
          </div>
        )}

        {/* 编辑确认/取消 */}
        {isEditing && (
          <div style={{ display: "flex", gap: 4, marginLeft: 28, padding: "3px 0" }}>
            <button data-testid="node-edit-confirm" onClick={() => void confirmEdit()} style={actionBtn}>✓ 保存</button>
            <button data-testid="node-edit-cancel" onClick={() => setEditId(null)} style={actionBtn}>取消</button>
          </div>
        )}

        {open && kids.map((k) => renderNode(k))}
      </div>
    );
  };

  const roots = children.get(null) ?? [];

  // 零节点空态：只给指引，不注入示例内容（预填＝假燃料）
  // 但当用户已点击「添加根问题」时（addDraft 非空且 parentId===null），
  // 不走空态早返回——否则添加表单永远渲染不到（Bug 修复）
  if (nodes.length === 0 && !(addDraft?.parentId === null)) {
    return (
      <div style={{ padding: "24px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>🌱</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 6 }}>从子问题开始</div>
        <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.7, margin: "0 auto 12px", maxWidth: 300 }}>
          把卡住你的大问题拆成一个个能动手的子问题，每拆一层，就把它从"一团乱麻"变成"一条路径"。
        </p>
        <button data-testid="tree-add-root" onClick={() => startAdd(null)} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}>
          ＋ 添加根问题
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>问题树</span>
        <button data-testid="tree-add-root" onClick={() => startAdd(null)} style={{ marginLeft: "auto", fontSize: 11, cursor: "pointer", padding: "3px 10px", borderRadius: 4, border: "1px solid #d1d5db", background: "#fff" }}>
          ＋ 添加根问题
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {/* 空态下用户已点击添加——展示引导文案 + 添加表单 */}
        {nodes.length === 0 && addDraft?.parentId === null && (
          <div style={{ padding: "16px 8px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>🌱</div>
            <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6, margin: "0 0 10px" }}>
              写下第一个根问题，让它成为问题树的起点。
            </p>
          </div>
        )}

        {/* 根节点添加表单（addDraft.parentId === null） */}
        {addDraft?.parentId === null && (
          <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "3px 0", marginBottom: 4 }}>
            <select value={addDraft.type} onChange={(e) => setAddDraft({ parentId: null, type: e.target.value as KnowledgeNodeType })} style={{ fontSize: 11, padding: "2px 4px", border: "1px solid #e5e7eb", borderRadius: 4 }}>
              {(Object.keys(nodeTypeLabel) as KnowledgeNodeType[]).map((t) => (
                <option key={t} value={t}>{nodeTypeLabel[t]}</option>
              ))}
            </select>
            <input data-testid="node-add-input" value={addText} onChange={(e) => setAddText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void confirmAdd(); }} placeholder="根问题…" style={{ flex: 1, fontSize: 12, padding: "3px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }} autoFocus />
            <button data-testid="node-add-confirm" onClick={() => void confirmAdd()} style={actionBtn}>✓</button>
            <button data-testid="node-add-cancel" onClick={() => setAddDraft(null)} style={actionBtn}>取消</button>
          </div>
        )}

        {roots.map((r) => renderNode(r))}
      </div>

      {status && <p style={{ padding: "6px 10px", fontSize: 12, color: "#dc2626" }}>{status}</p>}
    </div>
  );
}

/** 节点行内操作小按钮（统一样式） */
const actionBtn: React.CSSProperties = {
  fontSize: 12, cursor: "pointer", padding: "1px 6px", borderRadius: 4,
  border: "1px solid #e5e7eb", background: "#fff", color: "#4b5563", lineHeight: 1.4,
};
