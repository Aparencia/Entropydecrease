/**
 * GroupDeleteConfirm — 组删除影响面确认弹窗（v0.14.1 §3.3）。
 *
 * @ai-context: 两步删除（先 get_group_delete_impact 只读计数，再勾选确认后
 *              delete_note_group 执行——单事务级联）——影响面如实呈现：
 *              笔记/碎片 → 移入「全部」；闪卡/结算/周契约 → 级联删除；
 *              体系引用 → 解除。有级联项时须勾选「我了解后果」才能执行
 *              （数据不可恢复后果透明可见）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteGroup } from "../types";

/** 影响面契约（Rust GroupDeleteImpact camelCase） */
interface GroupDeleteImpact {
  notes: number;
  fragments: number;
  cards: number;
  settlements: number;
  contracts: number;
  systemRefs: number;
}

interface Props {
  group: NoteGroup;
  /** 关闭弹窗（遮罩/✕/ESC） */
  onClose: () => void;
  /** 删除成功回调（父级刷新组列表并关闭弹层） */
  onDeleted: () => void;
}

const BTN: React.CSSProperties = {
  fontSize: 12, cursor: "pointer", padding: "5px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151",
};

export default function GroupDeleteConfirm({ group, onClose, onDeleted }: Props) {
  const [impact, setImpact] = useState<GroupDeleteImpact | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  // ESC 关闭（模态弹层键盘可达性）
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const load = useCallback(async () => {
    try {
      const data = await invoke<GroupDeleteImpact>("get_group_delete_impact", { id: group.id });
      setImpact(data);
      setStatus("");
    } catch (e) {
      setStatus(`影响面读取失败: ${e}`);
    }
  }, [group.id]);

  useEffect(() => { void load(); }, [load]);

  const runDelete = async () => {
    setBusy(true);
    try {
      await invoke<boolean>("delete_note_group", { id: group.id });
      onDeleted();
    } catch (e) {
      setStatus(`删除失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  const hasCascade = impact != null && (impact.cards > 0 || impact.settlements > 0 || impact.contracts > 0);

  return (
    <div
      data-testid="group-delete-confirm-backdrop"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        data-testid="group-delete-confirm"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 380, maxWidth: "92vw", background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: "#b91c1c" }}>🗑 删除「{group.name}」？</span>
          <button onClick={onClose} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 13, color: "#9ca3af" }}>✕</button>
        </div>

        {!impact ? (
          <p data-testid="group-delete-loading" style={{ fontSize: 12, color: "#6b7280" }}>
            {status || "正在统计影响面…"}
          </p>
        ) : (
          <div data-testid="group-delete-impact" style={{ fontSize: 12, color: "#374151", lineHeight: 1.9 }}>
            <div>📄 组内笔记：{impact.notes} 条 → 移入「全部笔记」不删除</div>
            <div>⚡ 组内碎片：{impact.fragments} 条 → 移出归组不删除</div>
            {impact.cards > 0 && <div style={{ color: "#b91c1c" }}>🎴 闪卡：{impact.cards} 张 → <b>将级联删除</b></div>}
            {impact.settlements > 0 && <div style={{ color: "#b91c1c" }}>🧹 结算历史：{impact.settlements} 条 → <b>将级联删除</b></div>}
            {impact.contracts > 0 && <div style={{ color: "#b91c1c" }}>📅 周契约：{impact.contracts} 份 → <b>将级联删除</b></div>}
            {impact.systemRefs > 0 && <div style={{ color: "#b45309" }}>🕸 体系引用：{impact.systemRefs} 处 → 引用解除</div>}
            {!hasCascade && <div style={{ color: "#0f766e" }}>无级联删除项——内容均保留，安全删除</div>}

            {hasCascade && (
              <label data-testid="group-delete-ack" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 10px", background: "#fef2f2", borderRadius: 6, cursor: "pointer", color: "#b91c1c" }}>
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                我了解后果：闪卡/结算/周契约将不可恢复地删除
              </label>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button data-testid="group-delete-cancel" onClick={onClose} style={BTN}>取消</button>
          <button
            data-testid="group-delete-submit"
            onClick={() => void runDelete()}
            disabled={busy || impact == null || (hasCascade && !ack)}
            style={{ ...BTN, marginLeft: "auto", border: "1px solid #dc2626", background: "#dc2626", color: "#fff", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "删除中…" : "确认删除"}
          </button>
        </div>
        {status && <p data-testid="group-delete-status" style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}
      </div>
    </div>
  );
}
