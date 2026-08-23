/**
 * PromoteCardButton — 模型卡「纳入体系」按钮（v0.13.2 §五）。
 *
 * @ai-context: 双面体单向升格（§一）——组内 model 卡（记忆面）→ 体系概念
 *              （思辨面）单向，且只引用不收纳（knowledge_links 唯一通道）。本按钮
 *              仅对 kind==='model' 卡出现（fact/action 不出现——§八 回归验收）。
 * @ai-context: 升格流（§四）——先选目标体系（默认全局置顶，可切换领域体系），
 *              调 promote_card_to_concept，按返回 action 四态渲染结果文案：
 *              created 新建概念 / merged 关联既有 / hinted 跨体系不落库 /
 *              already 已纳入免重复。前端只读 action，不解释 decision 内部结构。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Flashcard } from "../types";
import type { KnowledgeSystem, PromoteResult, PromoteAction } from "../types/knowledge";

interface Props {
  /** 待升格的卡（仅 kind==='model' 传入；front=概念名，back=三问） */
  card: Flashcard;
}

/** 四态结果文案（§四分派口径） */
const ACTION_MESSAGES: Record<PromoteAction, string> = {
  created: "已纳入·创建概念",
  merged: "已关联既有概念",
  hinted: "该概念属其他体系，暂不落库",
  already: "已纳入（免重复）",
};

export default function PromoteCardButton({ card }: Props) {
  const [open, setOpen] = useState(false);
  const [systems, setSystems] = useState<KnowledgeSystem[]>([]);
  const [targetSystemId, setTargetSystemId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  // 目标体系：显式选择优先，缺省回退全局体系（默认全局置顶）
  const globalSystem = systems.find((s) => s.kind === "global") ?? null;
  const domainSystems = systems.filter((s) => s.kind === "domain");
  const effectiveTarget = targetSystemId ?? globalSystem?.id ?? null;

  const toggle = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setStatus(null);
    try {
      const list = await invoke<KnowledgeSystem[]>("list_knowledge_systems");
      setSystems(list);
    } catch (e) {
      setStatus({ text: `体系加载失败: ${e}`, error: true });
    }
  };

  const confirm = async () => {
    if (effectiveTarget == null) { setStatus({ text: "请先创建全局体系", error: true }); return; }
    setBusy(true); setStatus(null);
    try {
      const res = await invoke<PromoteResult>("promote_card_to_concept", {
        cardId: card.id,
        targetSystemId: effectiveTarget,
      });
      setStatus({ text: ACTION_MESSAGES[res.action], error: false });
    } catch (e) {
      setStatus({ text: `纳入失败: ${e}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="promote-card">
      <button
        data-testid="promote-open"
        onClick={() => void toggle()}
        style={{ fontSize: 12, cursor: "pointer", padding: "3px 12px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}
      >
        🧠 纳入体系
      </button>

      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          <select
            data-testid="promote-target"
            value={effectiveTarget ?? ""}
            onChange={(e) => setTargetSystemId(Number(e.target.value))}
            style={{ width: "100%", fontSize: 12, padding: "5px 6px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" }}
          >
            {globalSystem && <option value={globalSystem.id}>🌐 {globalSystem.name}（默认）</option>}
            {domainSystems.map((s) => <option key={s.id} value={s.id}>📂 {s.name}</option>)}
          </select>
          <button
            data-testid="promote-confirm"
            onClick={() => void confirm()}
            disabled={busy}
            style={{ fontSize: 12, cursor: "pointer", padding: "4px 0", borderRadius: 6, border: "1px solid #0f766e", background: "#0f766e", color: "#fff", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "纳入中…" : "确认纳入"}
          </button>
        </div>
      )}

      {status && <p data-testid="promote-status" style={{ marginTop: 6, fontSize: 12, color: status.error ? "#dc2626" : "#0f766e" }}>{status.text}</p>}
    </div>
  );
}
