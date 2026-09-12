/**
 * ModelCardFromNoteDialog — 笔记段 → 模型卡草稿（v0.20.3 / REQ-302）。
 *
 * @ai-context: 接线唯一生成链（commands_knowledge_cards::create_model_card_inner，
 *              防双轨）：组内 kind=model 卡，front=归一化概念名，定义行=可选
 *              笔记摘录草稿（应用案例留空——复习面/卡编辑完善）；笔记未归组
 *              → 后端引导先归组（组=唯一容器）。
 * @ai-context: 批 4 T6 迁移：遮罩/居中/面板几何交给 `Modal`（barrel 导入，B5）；
 *              开合态仍由父层持有（`ModelCardDialogSlot` 的 `dialog == null → null`
 *              门控）⇒ `open` 恒为 `true`，本组件每次由父层条件挂载。
 */
import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/primitives";
import { invoke } from "@tauri-apps/api/core";
import type { CSSProperties } from "react";

interface Props {
  noteId: number;
  noteTitle: string;
  onClose: () => void;
  onCreated?: () => void;
  /** 批 8（REQ-317）：初始定义草稿预填（选区右键「模型卡预填」通道——
   *  挂载时一次性读入；对话框每次由父层条件挂载，无需 key 重触发） */
  initialExcerpt?: string;
}

const btn: CSSProperties = { padding: "5px 12px", cursor: "pointer", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#374151" };

export default function ModelCardFromNoteDialog({ noteId, noteTitle, onClose, onCreated, initialExcerpt = "" }: Props) {
  const [name, setName] = useState("");
  const [excerpt, setExcerpt] = useState(initialExcerpt);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  // 成功后延迟关闭的 timer（unmount 清理——防已关闭后二次回调/泄漏）
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      await invoke("model_card_from_note", { noteId, name, excerpt: excerpt.trim() || null });
      setMsg("✓ 已建模型卡草稿（组内 model 卡；复习面/卡编辑可继续完善定义与应用案例）");
      setCreated(true);
      onCreated?.();
      // 成功后禁用按钮（含取消）防二次提交/先关后关；900ms 后自动关闭
      closeTimerRef.current = window.setTimeout(onClose, 900);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  /** 页脚行动区：原「取消」在面板头右侧、「创建草稿」在内容右下角 —— 两枚都搬进 `Modal` 的 footer 槽 */
  const footer = (
    <>
      <button style={btn} onClick={onClose} disabled={created}>取消</button>
      <button style={btn} disabled={busy || created} onClick={() => void create()}>
        {created ? "已创建，即将关闭…" : "创建草稿"}
      </button>
    </>
  );

  return (
    <Modal open onClose={onClose} title="提炼模型卡草稿" size="m" testId="model-card-from-note" footer={footer}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>来源：{noteTitle.slice(0, 24)}</div>
      {msg && <div style={{ fontSize: 12, color: "#047857", marginBottom: 8 }}>{msg}</div>}
      {err && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 2 }}>概念名（front）</div>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="如：安全边际" style={{ width: "100%", boxSizing: "border-box", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 4, padding: "4px 6px" }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 2 }}>
            定义草稿（可空——应用案例留空，后续完善）
          </div>
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={4} placeholder="粘贴笔记中的模型表述（≤200 字）…" style={{ width: "100%", boxSizing: "border-box", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 4, padding: "4px 6px", resize: "vertical" }} />
        </div>
      </div>
    </Modal>
  );
}
