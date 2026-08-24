/**
 * KnowledgeDecisionLog — 决策/应用日志（v0.13.3 §五 UI 层）。
 *
 * @ai-context: 一表两面（§一）——list_decisions 合并返回 decision（思辨面🧭）与
 *              application（学习面🛠），前端按 kind 分 tab（徽标计数）。每条记录
 *              展示 kind 徽标 + content 摘要 + decidedAt + 引用摘要（parseUsedRefs
 *              → 计数标签），并提供 🗑 删除（二次确认→delete_decision→刷新）。
 * @ai-context: concept 关联（§五）——本区置于概念详情面板，若传 conceptId 则在
 *              list_decisions(systemId) 结果上按 used_refs.concept_ids 客户端过滤，
 *              只展示与当前概念相关的记录（command 层不支持按概念过滤）。
 * @ai-context: 引用必填防膨胀（红线）——列表只展示已入库记录（command 层已拒绝
 *              空引用）；本组件不产生记录，只读 + 删除（用户记账允许删）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { DecisionKind, KnowledgeDecision } from "../types/knowledge";
import { countUsedRefs, parseUsedRefs } from "../types/knowledge";

interface Props {
  systemId: number;
  /** 当前概念 id（null=体系维度不按概念过滤） */
  conceptId?: number | null;
  /** 删除后回调（父层刷新详情/计数） */
  onChanged?: () => void;
}

const TABS: { key: DecisionKind; label: string; badge: string; empty: string }[] = [
  { key: "decision", label: "决策", badge: "🧭", empty: "暂无决策记录——从「记一个决策」开始。" },
  { key: "application", label: "应用", badge: "🛠", empty: "暂无应用记录——点「记一次使用」。" },
];

export default function KnowledgeDecisionLog({ systemId, conceptId, onChanged }: Props) {
  const [decisions, setDecisions] = useState<KnowledgeDecision[]>([]);
  const [tab, setTab] = useState<DecisionKind>("decision");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await invoke<KnowledgeDecision[]>("list_decisions", { systemId });
      setDecisions(list);
    } catch (e) { setStatus(`加载失败: ${e}`); }
  }, [systemId]);

  useEffect(() => { void load(); }, [load]);

  /** concept 关联：传 conceptId 时按 used_refs.concept_ids 过滤（客户端） */
  const visible = useMemo(() => {
    if (conceptId == null) return decisions;
    return decisions.filter((d) => parseUsedRefs(d.usedRefs).conceptIds.includes(conceptId));
  }, [decisions, conceptId]);

  const activeList = tab === "decision" ? visible.filter((d) => d.kind === "decision") : visible.filter((d) => d.kind === "application");
  const countFor = (k: DecisionKind) => visible.filter((d) => d.kind === k).length;

  const remove = async (id: number) => {
    const ok = await confirm("确定删除这条记录？删除后不可恢复。", { title: "熵减", kind: "warning" });
    if (!ok) return;
    try {
      await invoke<boolean>("delete_decision", { id });
      await load();
      onChanged?.();
    } catch (e) { setStatus(`删除失败: ${e}`); }
  };

  const tabMeta = TABS.find((t) => t.key === tab)!;

  return (
    <div data-testid="decision-log">
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t.key} data-testid={`decision-tab-${t.key}`} onClick={() => setTab(t.key)} style={{ fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 6, border: "1px solid transparent", background: tab === t.key ? "#f0fdfa" : "transparent", color: tab === t.key ? "#0f766e" : "#6b7280", fontWeight: tab === t.key ? 600 : 400 }}>
            {t.badge} {t.label} <span data-testid={`decision-count-${t.key}`} style={{ opacity: 0.75 }}>({countFor(t.key)})</span>
          </button>
        ))}
      </div>

      {status && <p data-testid="decision-log-status" style={{ fontSize: 11, color: "#dc2626", margin: "0 0 4px" }}>{status}</p>}

      {activeList.length === 0 ? (
        <div data-testid="decision-log-empty" style={{ fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>{tabMeta.empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {activeList.map((d) => {
            const refCount = countUsedRefs(parseUsedRefs(d.usedRefs));
            return (
              <div key={d.id} data-testid={`decision-row-${d.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                <span data-testid={`decision-kind-${d.id}`} style={{ fontSize: 12 } as const}>{d.kind === "decision" ? "🧭" : "🛠"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div data-testid={`decision-content-${d.id}`} style={{ fontSize: 12, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.content}</div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>{formatDecisionTime(d.decidedAt)} · {refCount} 个引用</div>
                </div>
                <button data-testid={`decision-delete-${d.id}`} onClick={() => void remove(d.id)} title="删除记录" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 13, color: "#9ca3af" }}>🗑</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 毫秒 → "Y-M-D H:m"（决定记录时刻；与概念 lastAppliedAt 同为毫秒契约） */
function formatDecisionTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
