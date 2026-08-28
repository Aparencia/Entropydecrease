/**
 * KnowledgeLinkSection — 知识引用列表 + 「挂引用」表单（v0.13.1 §五 右栏共用段；
 * v0.14 C3 聚合视图增强）。
 *
 * @ai-context: 体系「只引用、不收纳」（§一）——link 是内容进入体系的唯一通道。
 *              本段把引用列出，并可挂新引用 / 撤销引用。
 * @ai-context: v0.14 C3 痛点修复（挂接后体系页不显示）——原按选中实体过滤，
 *              挂载实体与查看实体不一致时引用"消失"（spec §3.3）。新增聚合
 *              视图（默认）：该体系全部引用按实体分组显示，实体名实时映射；
 *              「本实体」模式保留原过滤行为。挂引用表单仍按选中实体（entityId）。
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  KnowledgeLink, KnowledgeLinkTargetType, KnowledgeEntityType,
  KnowledgeNode, KnowledgeConcept, KnowledgeModel,
} from "../types/knowledge";
import { linkTargetTypeLabel } from "../types/knowledge";
import type { NoteGroup } from "../types/notes";

interface Props {
  systemId: number;
  entityType: KnowledgeEntityType;
  entityId: number;
  links: KnowledgeLink[];
  /** v0.14 C3：实体名映射（聚合分组头显示问题文本/概念名/模型名） */
  nodes: KnowledgeNode[];
  concepts: KnowledgeConcept[];
  models: KnowledgeModel[];
  onChanged: () => void;
}

/** 该实体的引用列表（按 entityType 过滤——「本实体」模式） */
function referencesFor(links: KnowledgeLink[], type: KnowledgeEntityType, id: number): KnowledgeLink[] {
  return links.filter((l) => {
    if (type === "node") return l.nodeId === id;
    if (type === "concept") return l.conceptId === id;
    return l.modelId === id;
  });
}

/** 引用按体系实体分组（聚合视图；v0.14 C3 纯函数——实体名实时映射） */
export interface LinkGroup {
  key: string;
  label: string;
  kindLabel: string;
  links: KnowledgeLink[];
}

export function groupLinksByEntity(
  links: KnowledgeLink[],
  nodes: KnowledgeConcept[] | KnowledgeNode[],
  concepts: KnowledgeConcept[],
  models: KnowledgeModel[],
): LinkGroup[] {
  const groups: LinkGroup[] = [];
  const byKey = new Map<string, LinkGroup>();
  const nameOf = (list: { id: number; text?: string; name?: string }[], id: number): string =>
    list.find((x) => x.id === id)?.text ?? list.find((x) => x.id === id)?.name ?? `#${id}`;
  for (const l of links) {
    let key: string;
    let kindLabel: string;
    let label: string;
    if (l.nodeId != null) {
      key = `node:${l.nodeId}`; kindLabel = "问题";
      label = nameOf(nodes, l.nodeId);
    } else if (l.conceptId != null) {
      key = `concept:${l.conceptId}`; kindLabel = "概念";
      label = nameOf(concepts, l.conceptId);
    } else {
      key = `model:${l.modelId}`; kindLabel = "模型";
      label = nameOf(models, l.modelId ?? 0);
    }
    let g = byKey.get(key);
    if (!g) {
      g = { key, label, kindLabel, links: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.links.push(l);
  }
  return groups;
}

/** 引用范围模式：all=聚合视图（默认，C3 痛点修复）/ entity=仅当前实体 */
type RefMode = "all" | "entity";

export default function KnowledgeLinkSection({ systemId, entityType, entityId, links, nodes, concepts, models, onChanged }: Props) {
  const [mode, setMode] = useState<RefMode>("all");
  const [targetType, setTargetType] = useState<KnowledgeLinkTargetType>("note_group");
  const [targetIdInput, setTargetIdInput] = useState("");
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [status, setStatus] = useState("");

  // 组名（note_group 下拉用）——组件常挂载，仅需一次读取
  useEffect(() => {
    invoke<NoteGroup[]>("list_note_groups", { terrain: null }).then(setGroups).catch((e) => setStatus(`笔记组加载失败: ${e}`));
  }, []);

  const refs = useMemo(() => referencesFor(links, entityType, entityId), [links, entityType, entityId]);
  const grouped = useMemo(() => groupLinksByEntity(links, nodes, concepts, models), [links, nodes, concepts, models]);

  const targetId = Number.parseInt(targetIdInput, 10);
  const validTarget = !Number.isNaN(targetId) && targetId > 0;
  const exists = refs.some((l) => l.targetType === targetType && l.targetId === targetId);

  const linkTarget = async () => {
    if (!validTarget || exists) return;
    try {
      // camelCase 参数自动映射 snake_case；按实体类型填充 nodeId/conceptId/modelId
      const payload: Record<string, unknown> = { systemId, targetType, targetId };
      payload[`${entityType}Id`] = entityId;
      await invoke("link_knowledge_target", payload);
      setTargetIdInput("");
      setStatus("");
      onChanged();
    } catch (e) {
      setStatus(`挂引用失败: ${e}`);
    }
  };

  const unlink = async (id: number) => {
    try {
      await invoke("delete_knowledge_link", { id });
      onChanged();
    } catch (e) {
      setStatus(`撤销引用失败: ${e}`);
    }
  };

  const groupValue = (g: NoteGroup | undefined) => { if (g) setTargetIdInput(String(g.id)); };

  // 聚合视图行（带分组头）与实体模式行共用渲染
  const renderRow = (l: KnowledgeLink) => (
    <div key={l.id} data-testid="link-row" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
      <span style={{ padding: "1px 6px", borderRadius: 8, background: "#f0fdfa", color: "#0f766e", fontSize: 11 }}>{linkTargetTypeLabel[l.targetType]}</span>
      <span style={{ color: "#6b7280", flex: 1 }}>#{l.targetId}</span>
      <button data-testid={`link-unlink-${l.id}`} onClick={() => void unlink(l.id)} style={{ fontSize: 11, cursor: "pointer", padding: "1px 6px", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#dc2626" }}>
        撤销
      </button>
    </div>
  );

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "#374151" }}>🔗 引用（{mode === "all" ? grouped.length : refs.length}）</span>
        {/* v0.14 C3：范围切换——默认聚合（挂载实体与查看实体不一致时引用不再消失） */}
        <div style={{ display: "flex", gap: 2, background: "#f3f4f6", borderRadius: 8, padding: 1 }}>
          <button
            data-testid="ref-mode-all"
            onClick={() => setMode("all")}
            style={{ fontSize: 10, cursor: "pointer", padding: "2px 8px", borderRadius: 6, border: "none", background: mode === "all" ? "#fff" : "transparent", color: mode === "all" ? "#0f766e" : "#9ca3af", fontWeight: mode === "all" ? 600 : 400 }}
          >
            全部
          </button>
          <button
            data-testid="ref-mode-entity"
            onClick={() => setMode("entity")}
            style={{ fontSize: 10, cursor: "pointer", padding: "2px 8px", borderRadius: 6, border: "none", background: mode === "entity" ? "#fff" : "transparent", color: mode === "entity" ? "#0f766e" : "#9ca3af", fontWeight: mode === "entity" ? 600 : 400 }}
          >
            本实体
          </button>
        </div>
      </div>

      {mode === "entity" ? (
        <>
          {refs.length === 0 && <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 6px" }}>暂无引用——把已有内容挂进来。</p>}
          {refs.map(renderRow)}
        </>
      ) : (
        <>
          {grouped.length === 0 && <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 6px" }}>暂无引用——把已有内容挂进来。</p>}
          {grouped.map((g) => (
            <div key={g.key} style={{ marginBottom: 4 }}>
              <div data-testid={`link-group-${g.key}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280", padding: "2px 0" }}>
                <span style={{ padding: "0 6px", borderRadius: 8, background: "#f9fafb", color: "#374151" }}>{g.kindLabel}</span>
                <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.label}</span>
                <span style={{ color: "#d1d5db" }}>{g.links.length}</span>
              </div>
              {g.links.map(renderRow)}
            </div>
          ))}
        </>
      )}

      {/* 挂引用表单（仍按选中实体挂——聚合视图只改变展示范围） */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <select
            data-testid="link-target-type"
            value={targetType}
            onChange={(e) => { setTargetType(e.target.value as KnowledgeLinkTargetType); setTargetIdInput(""); }}
            style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
          >
            {(Object.keys(linkTargetTypeLabel) as KnowledgeLinkTargetType[]).map((t) => (
              <option key={t} value={t}>{linkTargetTypeLabel[t]}</option>
            ))}
          </select>
          {targetType === "note_group" ? (
            <select data-testid="link-group-select" value={targetIdInput} onChange={(e) => groupValue(groups.find((g) => g.id === Number(e.target.value)))} style={{ flex: 1, fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }} disabled={groups.length === 0}>
              <option value="">选择笔记组…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          ) : (
            <input
              data-testid="link-target-id"
              value={targetIdInput}
              onChange={(e) => setTargetIdInput(e.target.value.replace(/\D/g, ""))}
              placeholder="目标 id"
              style={{ flex: 1, fontSize: 12, padding: "4px 6px", border: "1px solid #e5e7eb", borderRadius: 4 }}
            />
          )}
        </div>

        {exists && (
          <div data-testid="link-duplicate" style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, padding: "4px 6px" }}>
            ⚠ 该目标已存在引用——请撤销后再换目标。
          </div>
        )}

        <button data-testid="link-submit" onClick={() => void linkTarget()} disabled={!validTarget || exists} style={{ alignSelf: "flex-start", fontSize: 12, cursor: "pointer", padding: "4px 12px", borderRadius: 4, border: "1px solid #0f766e", background: !validTarget || exists ? "#f9fafb" : "#f0fdfa", color: !validTarget || exists ? "#9ca3af" : "#0f766e" }}>
          挂引用
        </button>
        {status && <p style={{ fontSize: 11, color: "#dc2626" }}>{status}</p>}
      </div>
    </div>
  );
}
