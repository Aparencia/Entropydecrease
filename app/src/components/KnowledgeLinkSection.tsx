/**
 * KnowledgeLinkSection — 知识引用列表 + 「挂引用」表单（v0.13.1 §五 右栏共用段）。
 *
 * @ai-context: 体系「只引用、不收纳」（§一）——link 是内容进入体系的唯一通道。
 *              本段把引用（按选中实体类型过滤）列出，并可挂新引用 / 撤销引用。
 * @ai-context: target_note_group 走 list_note_groups 下拉；其余（note/flashcard/
 *              fragment）手工输 targetId。重复目标在 UI 层拦截（目标已存在提示），
 *              避免对同一目标挂两条引用。
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KnowledgeLink, KnowledgeLinkTargetType, KnowledgeEntityType } from "../types/knowledge";
import { linkTargetTypeLabel } from "../types/knowledge";
import type { NoteGroup } from "../types/notes";

interface Props {
  systemId: number;
  entityType: KnowledgeEntityType;
  entityId: number;
  links: KnowledgeLink[];
  onChanged: () => void;
}

/** 该实体的引用列表（按 entityType 过滤） */
function referencesFor(links: KnowledgeLink[], type: KnowledgeEntityType, id: number): KnowledgeLink[] {
  return links.filter((l) => {
    if (type === "node") return l.nodeId === id;
    if (type === "concept") return l.conceptId === id;
    return l.modelId === id;
  });
}

export default function KnowledgeLinkSection({ systemId, entityType, entityId, links, onChanged }: Props) {
  const [targetType, setTargetType] = useState<KnowledgeLinkTargetType>("note_group");
  const [targetIdInput, setTargetIdInput] = useState("");
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  const [status, setStatus] = useState("");

  // 组名（note_group 下拉用）——组件常挂载，仅需一次读取
  useEffect(() => {
    invoke<NoteGroup[]>("list_note_groups", { terrain: null }).then(setGroups).catch((e) => setStatus(`笔记组加载失败: ${e}`));
  }, []);

  const refs = useMemo(() => referencesFor(links, entityType, entityId), [links, entityType, entityId]);

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

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 12, color: "#374151", marginBottom: 6 }}>🔗 引用（{refs.length}）</div>

      {refs.length === 0 && <p style={{ fontSize: 11, color: "#9ca3af", margin: "2px 0 6px" }}>暂无引用——把已有内容挂进来。</p>}

      {refs.map((l) => (
        <div key={l.id} data-testid="link-row" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>
          <span style={{ padding: "1px 6px", borderRadius: 8, background: "#f0fdfa", color: "#0f766e", fontSize: 11 }}>{linkTargetTypeLabel[l.targetType]}</span>
          <span style={{ color: "#6b7280", flex: 1 }}>#{l.targetId}</span>
          <button data-testid={`link-unlink-${l.id}`} onClick={() => void unlink(l.id)} style={{ fontSize: 11, cursor: "pointer", padding: "1px 6px", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#dc2626" }}>
            撤销
          </button>
        </div>
      ))}

      {/* 挂引用表单 */}
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
