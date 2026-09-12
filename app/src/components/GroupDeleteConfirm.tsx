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
import { Modal, StatusLine } from "../ui/primitives";
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
  // 影响面读取失败文案（与删除失败分离——底部 status 仅承载删除错误，防重复展示）
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("");

  // ESC 关闭：原为自建 `window` 监听（`:45-50`），批 4 T5 交给 `Modal` 的 ESC 栈（ADR-033 §7）。
  // `load` 的 useEffect 仍在（数据读取，不是弹层语义）。

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await invoke<GroupDeleteImpact>("get_group_delete_impact", { id: group.id });
      setImpact(data);
      setStatus("");
    } catch (e) {
      // 审查修复：读取失败不进死胡同——loadError 分支提供重试按钮
      setLoadError(`影响面读取失败: ${e}`);
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
    /* 批 4 T5：自建遮罩 + 面板几何 + 手写标题/关闭（原 `:80-94`）交给 `Modal`。
       档位 `s`(380) 与原面板逐字同宽；旧遮罩锚点 `group-delete-confirm-backdrop` 由 `Modal` 的
       三段式取代 ⇒ 遮罩新锚点 = `group-delete-confirm-overlay`（全仓无测试引用旧锚点）。
       本组件**仍是自定义确认框**（`impacts`/`ack` 语义内建），不并入 `ConfirmDialog` —— 见计划 T5 表。 */
    <Modal
      open
      onClose={onClose}
      title={`🗑 删除「${group.name}」？`}
      size="s"
      testId="group-delete-confirm"
      footer={
        <>
          <button data-testid="group-delete-cancel" onClick={onClose} style={BTN}>取消</button>
          <button
            data-testid="group-delete-submit"
            onClick={() => void runDelete()}
            disabled={busy || impact == null || (hasCascade && !ack)}
            style={{ ...BTN, marginLeft: "auto", border: "1px solid #dc2626", background: "#dc2626", color: "#fff", opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "删除中…" : "确认删除"}
          </button>
        </>
      }
    >
      {!impact ? (
        <div data-testid="group-delete-loading" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.8 }}>
          {loadError ? (
            <StatusLine
              kind="error"
              action={
                <button
                  data-testid="group-delete-retry"
                  onClick={() => void load()}
                  style={{ ...BTN, marginLeft: 8 }}
                >
                  重试
                </button>
              }
            >
              {loadError}
            </StatusLine>
          ) : (
            "正在统计影响面…"
          )}
        </div>
      ) : (
        <div data-testid="group-delete-impact" style={{ fontSize: 12, color: "#374151", lineHeight: 1.9 }}>
          <div>📄 组内笔记：{impact.notes} 条 → 移入「全部笔记」不删除</div>
          <div>⚡ 组内碎片：{impact.fragments} 条 → 移出归组不删除</div>
          {impact.cards > 0 && <StatusLine kind="error">🎴 闪卡：{impact.cards} 张 → <b>将级联删除</b></StatusLine>}
          {impact.settlements > 0 && <StatusLine kind="error">🧹 结算历史：{impact.settlements} 条 → <b>将级联删除</b></StatusLine>}
          {impact.contracts > 0 && <StatusLine kind="error">📅 周契约：{impact.contracts} 份 → <b>将级联删除</b></StatusLine>}
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

      {status && impact && (
        <div style={{ marginTop: 8 }}>
          <StatusLine kind="error" testId="group-delete-status">{status}</StatusLine>
        </div>
      )}
    </Modal>
  );
}
