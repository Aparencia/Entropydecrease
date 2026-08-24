/**
 * KnowledgeModelDialog — 新建模型独立弹窗（v0.13.x）。
 *
 * @ai-context: 从模型列表「＋ 添加模型」按钮打开，独立于右栏详情面板——与概念弹窗
 *              同理，新建操作走独立弹窗，右栏仅用于已存实体的查看/编辑。
 * @ai-context: 模型是跨学科的可验证断言（disciplines JSON 数组≥1 学科；claim/valid/
 *              invalid 三件套）——command 层校验 disciplines 非空与体系存在性。
 * @ai-context: 不预填内容（预填＝假燃料）——所有输入从空字符串开始。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  /** 所属体系 id */
  systemId: number;
  /** 创建成功回调（父页刷新模型列表） */
  onCreated: () => void;
  /** 关闭弹窗 */
  onClose: () => void;
}

export default function KnowledgeModelDialog({ systemId, onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [disciplines, setDisciplines] = useState("");
  const [claim, setClaim] = useState("");
  const [validWhen, setValidWhen] = useState("");
  const [invalidWhen, setInvalidWhen] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { setError("模型名不能为空"); return; }
    const dList = disciplines.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (dList.length === 0) { setError("至少填写一个学科"); return; }
    setSaving(true); setError("");
    try {
      await invoke("add_knowledge_model", {
        systemId,
        name: name.trim(),
        disciplines: dList,
        claim: claim.trim() || null,
        validWhen: validWhen.trim() || null,
        invalidWhen: invalidWhen.trim() || null,
      });
      onCreated();
    } catch (e) {
      setError(`模型创建失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const canClose = !saving && (!name.trim() && !disciplines.trim() && !claim.trim() && !validWhen.trim() && !invalidWhen.trim());

  const doClose = () => {
    if (canClose) { onClose(); return; }
    if (saving) return;
    onClose();
  };

  return (
    <div
      onClick={doClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
      }}
    >
      <div
        data-testid="model-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: "92vw", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 10px 40px rgba(0,0,0,0.15)", overflow: "hidden" }}
      >
        {/* 头部 */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#0f766e" }}>⚙ 新建模型</span>
          <button data-testid="model-dialog-close" onClick={() => void doClose()} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }} title="关闭">
            ✕
          </button>
        </div>

        {/* 表单 */}
        <div style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px", lineHeight: 1.6 }}>
            模型是跨学科的可验证断言——写下它的主张、成立条件和失效条件，让它经得起检验。
          </p>

          <label style={label}>名称 *</label>
          <input
            data-testid="model-dialog-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !saving) void save(); }}
            placeholder="模型名称"
            autoFocus
            style={input}
          />

          <label style={label}>学科 *（逗号分隔）</label>
          <input
            data-testid="model-dialog-disciplines"
            value={disciplines}
            onChange={(e) => setDisciplines(e.target.value)}
            placeholder="编程, 学习方法"
            style={input}
          />

          <label style={label}>主张（claim）</label>
          <textarea
            data-testid="model-dialog-claim"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            rows={2}
            placeholder="这个模型主张什么"
            style={textarea}
          />

          <label style={label}>成立条件</label>
          <textarea
            data-testid="model-dialog-valid"
            value={validWhen}
            onChange={(e) => setValidWhen(e.target.value)}
            rows={2}
            placeholder="在什么条件下成立"
            style={textarea}
          />

          <label style={label}>失效条件</label>
          <textarea
            data-testid="model-dialog-invalid"
            value={invalidWhen}
            onChange={(e) => setInvalidWhen(e.target.value)}
            rows={2}
            placeholder="在什么条件下失效"
            style={textarea}
          />

          <p style={{ fontSize: 11, color: "#9ca3af", margin: "10px 0 0" }}>
            新模型默认状态为「active」，创建后可在右栏详情面板修改。
          </p>

          {error && (
            <div data-testid="model-dialog-error" style={{ fontSize: 12, color: "#dc2626", marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px", lineHeight: 1.5 }}>
              {error}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderTop: "1px solid #e5e7eb", background: "#fafafa" }}>
          <span style={{ flex: 1 }} />
          <button onClick={() => void doClose()} style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}>
            取消
          </button>
          <button
            data-testid="model-dialog-save"
            onClick={() => void save()}
            disabled={saving}
            style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}
          >
            {saving ? "创建中…" : "✓ 创建模型"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 标签样式 */
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", margin: "10px 0 3px" };
/** 输入样式 */
const input: React.CSSProperties = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" };
/** 文本域样式 */
const textarea: React.CSSProperties = { ...input, resize: "vertical", fontFamily: "inherit" };
