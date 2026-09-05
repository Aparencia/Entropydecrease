/**
 * ModelCardFromNoteDialog — 笔记段 → 模型卡草稿（v0.20.3 / REQ-302）。
 *
 * @ai-context: 接线唯一生成链（commands_knowledge_cards::create_model_card_inner，
 *              防双轨）：组内 kind=model 卡，front=归一化概念名，定义行=可选
 *              笔记摘录草稿（应用案例留空——复习面/卡编辑完善）；笔记未归组
 *              → 后端引导先归组（组=唯一容器）。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  noteId: number;
  noteTitle: string;
  onClose: () => void;
  onCreated?: () => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.45)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  width: 460,
  padding: 16,
  fontSize: 13,
};
const btn: React.CSSProperties = { padding: "5px 12px", cursor: "pointer", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", color: "#374151" };

export default function ModelCardFromNoteDialog({ noteId, noteTitle, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setErr("");
    try {
      await invoke("model_card_from_note", { noteId, name, excerpt: excerpt.trim() || null });
      setMsg("✓ 已建模型卡草稿（组内 model 卡；复习面/卡编辑可继续完善定义与应用案例）");
      onCreated?.();
      setTimeout(onClose, 900);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>🧠 提炼模型卡草稿</h3>
          <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>来源：{noteTitle.slice(0, 24)}</span>
          <button style={{ ...btn, marginLeft: "auto" }} onClick={onClose}>取消</button>
        </div>
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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button style={btn} disabled={busy} onClick={() => void create()}>创建草稿</button>
          </div>
        </div>
      </div>
    </div>
  );
}
