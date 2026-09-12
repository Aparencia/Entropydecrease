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
import { Modal, StatusLine } from "../ui/primitives";
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
    /* 批 4 T5：自建遮罩 + 面板几何 + 手写关闭（原 `:67-84`）整段交给 `Modal`。
       外观与键盘语义（遮罩点关 / ESC / 焦点陷阱 / 滚动锁）由原语持有，本组件只留业务。
       `closeOnEsc` 默认 true：原实现**没有** ESC 路径（无 keydown 监听），迁移后新增了一条
       "ESC 即关闭"，与遮罩点击同义（两条路径本已都不看 `busy`）—— 见报告「行为等价性」表。 */
    <Modal open onClose={onClose} title="另存为笔记" size="s" testId="chat-note-dialog">
      {savedId != null ? (
        <>
          <div data-testid="chat-note-saved" style={{ color: "#047857", marginBottom: 10 }}>
            {/* 信息9（审查裸号）：去 `#id`——成功态以标题语义回显（REQ-277）；
                title 恒非空（保存前置校验 + 默认值）——空时仅兜底不带书名号 */}
            ✓ 已保存为笔记{title.trim() ? `《${title.trim()}》` : ""}
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
            <div style={{ marginBottom: 8 }}>
              <StatusLine kind="error" testId="chat-note-error">{status}</StatusLine>
            </div>
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
    </Modal>
  );
}
