/**
 * ChatSaveNoteDialog — 对话「另存为笔记」对话框（v0.16.1 用户决定② 双入口）。
 *
 * @ai-context: 入口两处共用本对话框——会话顶栏（整段对话）与 AI 消息悬浮
 *              （至该条的完整上文）。字段：标题（默认由调用方给定）+ 目标组
 *              （可选下拉，默认不归组）→ create_note（source=manual；组 id 经
 *              group_id 直入——NewNote 契约已支持）。成功后内嵌"在笔记页打开"
 *              （onOpenNote 已由 ChatPage 透传）+ 关闭；失败红字不关窗（改后再试）。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteGroup } from "../types";

interface Props {
  /** 默认标题（会话标题或首条提问） */
  initialTitle: string;
  /** 转写后的 Markdown 正文（utils/chatTranscript.buildConversationMarkdown） */
  content: string;
  groups: NoteGroup[];
  /** 在笔记页打开（成功态按钮；ChatPage 透传） */
  onOpenNote: (noteId: number) => void;
  onClose: () => void;
}

const BTN_BASE: React.CSSProperties = {
  fontSize: 12.5,
  cursor: "pointer",
  padding: "5px 14px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#374151",
};

export default function ChatSaveNoteDialog({ initialTitle, content, groups, onOpenNote, onClose }: Props) {
  const [title, setTitle] = useState(initialTitle || "AI 对话记录");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  const save = async () => {
    if (busy || !title.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const note = await invoke<Note>("create_note", {
        new: {
          title: title.trim(),
          content,
          source: "manual",
          ...(groupId != null ? { group_id: groupId } : {}),
        },
      });
      setSavedId(note.id);
      setStatus("");
    } catch (e) {
      setStatus(`保存失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        data-testid="chat-note-backdrop"
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.18)" }}
      />
      <div
        data-testid="chat-note-dialog"
        style={{
          position: "fixed", zIndex: 51, top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 380, background: "#fff", borderRadius: 10,
          border: "1px solid #e5e7eb", boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
          padding: 14, fontSize: 12.5,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 10 }}>
          📄 另存为笔记
        </div>

        {savedId != null ? (
          <>
            <div data-testid="chat-note-saved" style={{ color: "#047857", marginBottom: 10 }}>
              ✓ 已保存为笔记 #{savedId}（{title}）
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                data-testid="chat-note-open"
                style={{ ...BTN_BASE, background: "#0d9488", color: "#fff", border: "none", fontWeight: 600 }}
                onClick={() => onOpenNote(savedId)}
              >
                在笔记页打开 →
              </button>
              <button style={BTN_BASE} onClick={onClose}>关闭</button>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: "block", color: "#6b7280", marginBottom: 4 }}>笔记标题</label>
            <input
              data-testid="chat-note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box", marginBottom: 8 }}
            />
            <label style={{ display: "block", color: "#6b7280", marginBottom: 4 }}>目标组（可选）</label>
            <select
              data-testid="chat-note-group"
              value={groupId ?? ""}
              onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: "100%", padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, boxSizing: "border-box", marginBottom: 8, background: "#fff" }}
            >
              <option value="">不归组（全部笔记）</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 11.5, color: "#6b7280", marginBottom: 10 }}>
              共 {content.length} 字符 · 对话以提问引用 + AI 回答全文的完整形式保存
            </div>
            {status && (
              <div data-testid="chat-note-error" style={{ color: "#dc2626", marginBottom: 8 }}>{status}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button data-testid="chat-note-cancel" style={BTN_BASE} onClick={onClose} disabled={busy}>取消</button>
              <button
                data-testid="chat-note-save"
                style={{ ...BTN_BASE, background: "#0d9488", color: "#fff", border: "none", fontWeight: 600 }}
                onClick={() => void save()}
                disabled={busy || !title.trim()}
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
