/**
 * ModelCardCreateDialog — 组侧「＋ 概念卡」创建弹窗（v0.13.2 §五）。
 *
 * @ai-context: 双面体单向升格（§一）——model 卡（记忆面）只在组内创建，概念
 *              （思辨面）在体系；本弹窗只在选定组内建卡，不建体系侧入口
 *              （体系只引用、不收纳）。create_model_card 幂等：同组同名已有卡
 *              返回既有卡——成功提示明确说明"已存在则返回既有卡"，不误导重复记账。
 * @ai-context: 不预填内容（预填＝假燃料）——name 必填，三问（本质/边界/联系）
 *              全部可空；card 背面由后端按卡面契约 compose（§三），前端只提交字段。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Flashcard } from "../types";

interface Props {
  /** 目标组 id（组仍是唯一容器——卡只在组内创建） */
  groupId: number;
  /** 组名（标题呈现用） */
  groupName: string;
  /** 关闭弹窗（遮罩/✕） */
  onClose: () => void;
  /** 创建成功后回调（父级可刷新/关闭；无组卡列表时可为空） */
  onCreated?: () => void;
}

export default function ModelCardCreateDialog({ groupId, groupName, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [essence, setEssence] = useState("");
  const [boundary, setBoundary] = useState("");
  const [relation, setRelation] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    // 前端仅做非空拦截；name 归一化/≤2000 由 command 层校验
    if (!trimmed) { setStatus({ text: "概念名不能为空", error: true }); return; }
    setBusy(true); setStatus(null);
    try {
      await invoke<Flashcard>("create_model_card", {
        groupId,
        name: trimmed,
        essence: essence.trim() || null,
        boundary: boundary.trim() || null,
        relation: relation.trim() || null,
      });
      setStatus({ text: `已创建概念卡「${trimmed}」（已存在则返回既有卡）`, error: false });
      onCreated?.();
    } catch (e) {
      setStatus({ text: `创建失败: ${e}`, error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        data-testid="model-card-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 380, maxWidth: "92vw", background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>🧠 概念卡 · {groupName}</span>
          <button data-testid="model-card-cancel" onClick={onClose} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 13 }}>✕ 关闭</button>
        </div>

        <label style={label}>概念名 *</label>
        <input data-testid="model-card-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="卡住你的词/概念" style={input} />
        <label style={label}>本质（它"是"什么）</label>
        <textarea data-testid="model-card-essence" value={essence} onChange={(e) => setEssence(e.target.value)} rows={2} style={textarea} />
        <label style={label}>边界（它"不是"什么）</label>
        <textarea data-testid="model-card-boundary" value={boundary} onChange={(e) => setBoundary(e.target.value)} rows={2} style={textarea} />
        <label style={label}>联系（它和什么相关）</label>
        <textarea data-testid="model-card-relation" value={relation} onChange={(e) => setRelation(e.target.value)} rows={2} style={textarea} />

        <button data-testid="model-card-submit" onClick={() => void submit()} disabled={busy} style={{ ...submitBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "创建中…" : "创建概念卡"}
        </button>
        {status && <p data-testid="model-card-status" style={{ marginTop: 8, fontSize: 12, color: status.error ? "#dc2626" : "#0f766e" }}>{status.text}</p>}
      </div>
    </div>
  );
}

/** 标签样式 */
const label: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", margin: "8px 0 3px" };
/** 输入样式 */
const input: React.CSSProperties = { width: "100%", fontSize: 13, padding: "6px 8px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" };
/** 文本域样式 */
const textarea: React.CSSProperties = { ...input, resize: "vertical", fontFamily: "inherit" };
/** 提交按钮样式 */
const submitBtn: React.CSSProperties = { marginTop: 12, width: "100%", fontSize: 13, cursor: "pointer", padding: "8px 0", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e", fontWeight: 600 };
