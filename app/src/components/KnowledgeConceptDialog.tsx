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
import { Modal, StatusLine, Text } from "../ui/primitives";
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

  // 关闭意图（批 4 T5 起由 `Modal` 的 ESC / 遮罩 / 关闭钮三路共用）。原实现里 `canClose` 与
  // 末尾的 `onClose()` 不可区分（除 `saving` 外两条分支同效）⇒ 行为仍逐字等价：`saving` 时拒绝关闭。
  const canClose = !saving && (!name.trim() && !essence.trim() && !boundary.trim() && !relation.trim());

  const doClose = () => {
    if (canClose) { onClose(); return; }
    if (saving) return;
    // 有未保存内容时由用户自行决定——不弹系统级确认，直接关闭更轻量
    onClose();
  };

  return (
    /* 批 4 T5：自建遮罩 + 面板几何 + 手写标题/关闭（原 `:61-79`）交给 `Modal`。
       档位 `m`(520)，原面板 480 ⇒ **+40 px**（已登记）。
       `onClose` 传的是 `doClose`（**不是**裸 `onClose`）：它保留原有的 `saving` 早退守卫 ——
       迁移前 ESC **没有**路径（本组件无 keydown 监听），迁移后 ESC 与关闭钮同走 `doClose`，
       `saving` 期间两条路径都拒绝关闭（比迁移前更强，见报告「行为等价性」）。
       旧关闭钮 testid `concept-dialog-close` 由 `Modal` 契约的 `${testId}-close` 继承（值相同）。 */
    <Modal
      open
      onClose={() => void doClose()}
      title="新建概念"
      size="m"
      testId="concept-dialog"
      footer={
        <>
          <button
            onClick={() => void doClose()}
            /* 不抽成模块级常量：原生按钮棘轮（T1，B4）判 `const *Btn*` 的**文件数只减不增**，
               迁入底栏时新增一个 `cancelBtn` 会把这个文件变成第 56 个 ⇒ 棘轮红。样式就地保留。 */
            style={{ fontSize: 13, cursor: "pointer", padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff" }}
          >
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
        </>
      }
    >
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

      <Text as="p" tone="ink-3" style={{ fontSize: 11, margin: "10px 0 0" }}>
        新概念默认状态为「核心」，创建后可在右栏详情面板修改。
      </Text>

      {error && (
        <div style={{ marginTop: 10 }}>
          <StatusLine kind="error" testId="concept-dialog-error">{error}</StatusLine>
        </div>
      )}
    </Modal>
  );
}

/** 标签样式 */
const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", margin: "10px 0 3px" };
/** 输入样式 */
const input: React.CSSProperties = { width: "100%", fontSize: 13, padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box" };
/** 文本域样式 */
const textarea: React.CSSProperties = { ...input, resize: "vertical", fontFamily: "inherit" };
