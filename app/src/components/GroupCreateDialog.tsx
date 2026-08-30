/**
 * GroupCreateDialog — 「＋ 新建组」弹窗（v0.14.1 §3.3）。
 *
 * @ai-context: 手动新建走 create_topic_group（契约一：粒度对齐领域——领域标签
 *              必填，同领域同地形已有主题组时后端幂等复用返回既有组）；颜色
 *              可选（复用 NoteColorPicker 12 色板）——两步命令：建组 → 设色
 *              → onCreated(反馈文案) 通知父级刷新。领域常量自 utils/domainOptions
 *              共享（改判/档案下拉同源，防枚举漂移；审查修复：与 Rust 20 类对齐）。
 * @ai-context: 审查修复：① update_group_color 失败与建组失败分离——组已建成只
 *              提示色设置失败并仍通知刷新（原 catch 误归因"创建失败"且漏 onChanged
 *              ——组建成却 UI 不可见）；② 成功反馈经 onCreated 文案上抛父级承载
 *              （弹窗随即关闭，内部 setStatus 一帧即卸载——死代码）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DOMAIN_OPTIONS } from "../utils/domainOptions";
import NoteColorPicker from "./NoteColorPicker";
import type { NoteGroup } from "../types";

interface Props {
  /** 关闭弹窗（遮罩/✕/ESC） */
  onClose: () => void;
  /** 创建成功回调（父级刷新组列表/关闭）；text=成功反馈文案（父级 status 承载） */
  onCreated: (text: string) => void;
}

const label: React.CSSProperties = { display: "block", fontSize: 12, color: "#374151", margin: "8px 0 4px" };
const input: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontSize: 13, padding: "6px 8px",
  border: "1px solid #d1d5db", borderRadius: 6,
};
const submitBtn: React.CSSProperties = {
  marginTop: 14, width: "100%", fontSize: 13, cursor: "pointer", padding: "8px 0",
  borderRadius: 6, border: "1px solid #0f766e", background: "#0f766e", color: "#fff",
};

export default function GroupCreateDialog({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [domainTag, setDomainTag] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  // ESC 关闭（模态弹层键盘可达性——与 GroupDeleteConfirm 同款；审查补齐）
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setStatus({ text: "组名不能为空", error: true }); return; }
    if (!domainTag) { setStatus({ text: "请选择领域标签", error: true }); return; }
    setBusy(true); setStatus(null);
    let group: NoteGroup;
    try {
      group = await invoke<NoteGroup>("create_topic_group", { name: trimmed, domainTag });
    } catch (e) {
      setStatus({ text: `创建失败: ${e}`, error: true });
      setBusy(false);
      return;
    }
    // 同领域同地形已有主题组时后端幂等复用返回既有组（create_topic_group 无
    // created 标记——不区分新建/复用）；用户已选色则应用（可随时清除/改）
    if (color) {
      try {
        await invoke<boolean>("update_group_color", { id: group.id, color });
      } catch (e) {
        // 部分失败：组已建成——归因正确 + 仍通知刷新（组数据必须可见）
        onCreated(`主题组「${group.name}」已创建，但颜色设置失败: ${e}`);
        setBusy(false);
        return;
      }
    }
    onCreated(`主题组「${group.name}」就绪（同领域已有组则复用）`);
    setBusy(false);
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        data-testid="group-create-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 340, maxWidth: "92vw", background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>📁 新建笔记组</span>
          <button data-testid="group-create-cancel" onClick={onClose} style={{ marginLeft: "auto", cursor: "pointer", fontSize: 13 }}>✕ 关闭</button>
        </div>

        <label style={label}>组名 *</label>
        <input
          data-testid="group-create-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="如：化妆美妆、编程开发…"
          style={input}
        />
        <label style={label}>领域标签 *（主题组粒度对齐领域——契约一）</label>
        <select
          data-testid="group-create-domain"
          value={domainTag}
          onChange={(e) => setDomainTag(e.target.value)}
          style={input}
        >
          <option value="">选择领域…</option>
          {DOMAIN_OPTIONS.map(([v, labelText]) => <option key={v} value={v}>{labelText}</option>)}
        </select>
        <label style={label}>组颜色（可选）</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <NoteColorPicker value={color} onChange={setColor} />
          {color && (
            <span data-testid="group-create-color-set" style={{ fontSize: 11, color: "#6b7280" }}>
              已选（点击色板可清除）
            </span>
          )}
        </div>

        <button data-testid="group-create-submit" onClick={() => void submit()} disabled={busy} style={{ ...submitBtn, opacity: busy ? 0.6 : 1 }}>
          {busy ? "创建中…" : "创建"}
        </button>
        {status && (
          <p data-testid="group-create-status" style={{ marginTop: 8, fontSize: 12, color: status.error ? "#dc2626" : "#0f766e" }}>
            {status.text}
          </p>
        )}
      </div>
    </div>
  );
}
