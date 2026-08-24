/**
 * KnowledgeConceptDialog — 新建概念独立弹窗（v0.13.x）。
 *
 * @ai-context: 从概念列表「＋ 添加概念」按钮打开，独立于右栏详情面板——新建操作
 *              不再占用右栏编辑器，右栏仅用于已存实体的查看/编辑（用户反馈：
 *              新建窗口应该独立，而不是在右侧）。
 * @ai-context: 概念名全局唯一（§二 UNIQUE）——保存时依赖 command 层唯一校验报错，
 *              前端仅做非空拦截；三问（本质/边界/联系）为概念记忆面的提问骨架。
 * @ai-context: 不预填内容（预填＝假燃料）——所有输入从空字符串开始。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  /** 所属体系 id */
  systemId: number;
  /** 创建成功回调（父页刷新概念列表） */
  onCreated: () => void;
  /** 关闭弹窗 */
  onClose: () => void;
}

export default function KnowledgeConceptDialog({ systemId, onCreated, onClose }: Props) {
  const [name, setName] = useState("");
  const [essence, setEssence] = useState("");
  const [boundary, setBoundary] = useState("");
  const [relation, setRelation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { setError("概念名不能为空"); return; }
    setSaving(true); setError("");
    try {
      await invoke("add_knowledge_concept", {
        systemId,
        name: name.trim(),
        essence: essence.trim() || null,
        boundary: boundary.trim() || null,
        relation: relation.trim() || null,
      });
      onCreated();
    } catch (e) {
      setError(`概念创建失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const canClose = !saving && (!name.trim() && !essence.trim() && !boundary.trim() && !relation.trim());

  const doClose = () => {
    if (canClose) { onClose(); return; }
    if (saving) return;
    // 有未保存内容时由用户自行决定——不弹系统级确认，直接关闭更轻量
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
        data-testid="concept-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480, maxWidth: "92vw", background: "#fff", borderRadius: 10, border: "1px solid #e5e7eb", boxShadow: "0 10px 40px rgba(0,0,0,0.15)", overflow: "hidden" }}
      >
        {/* 头部 */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#0f766e" }}>🧬 新建概念</span>
          <button data-testid="concept-dialog-close" onClick={() => void doClose()} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#9ca3af" }} title="关闭">
            ✕
          </button>
        </div>

        {/* 表单 */}
        <div style={{ padding: "16px 18px" }}>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px", lineHeight: 1.6 }}>
            概念是全库唯一身份的知识单元。用三问——本质、边界、联系——给它一个可复用的骨架。
          </p>

          <label style={label}>名称 *</label>
          <input
            data-testid="concept-dialog-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !saving) void save(); }}
            placeholder="概念名（全局唯一）"
            autoFocus
            style={input}
          />

          <label style={label}>本质（它"是"什么）</label>
          <textarea
            data-testid="concept-dialog-essence"
            value={essence}
            onChange={(e) => setEssence(e.target.value)}
            rows={2}
            placeholder="用一句话描述它的本质"
            style={textarea}
          />

          <label style={label}>边界（它"不是"什么）</label>
          <textarea
            data-testid="concept-dialog-boundary"
            value={boundary}
            onChange={(e) => setBoundary(e.target.value)}
            rows={2}
            placeholder="它和容易混淆的东西区别在哪"
            style={textarea}
          />

          <label style={label}>联系（它和什么相关）</label>
          <textarea
            data-testid="concept-dialog-relation"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            rows={2}
            placeholder="它关联哪些概念或领域"
            style={textarea}
          />

          <p style={{ fontSize: 11, color: "#9ca3af", margin: "10px 0 0" }}>
            新概念默认状态为「核心」，创建后可在右栏详情面板修改。
          </p>

          {error && (
            <div data-testid="concept-dialog-error" style={{ fontSize: 12, color: "#dc2626", marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px", lineHeight: 1.5 }}>
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
            data-testid="concept-dialog-save"
            onClick={() => void save()}
            disabled={saving}
            style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #0f766e", background: "#f0fdfa", color: "#0f766e" }}
          >
            {saving ? "创建中…" : "✓ 创建概念"}
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
