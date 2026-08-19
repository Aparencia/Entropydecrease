/**
 * NotesPage — 笔记独立页面（列表 + 详情双列布局）。
 *
 * @ai-context: 左栏搜索与笔记列表（来源标记 manual/classroom），右栏选中笔记详情与删除。
 * @ai-context: v0.7.1（会话体验）：focusNoteId 跨页直达（会话页"查看笔记 →"自动选中并滚动）；
 *              session_id 非空的笔记行显示「来源会话 →」反向跳转（会话↔笔记双向闭环）。
 * @ai-context: 第一阶段为纯文本/Markdown 源码预览；正式编辑器（TipTap 等）为后续阶段。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note } from "../types";

interface Props {
  /** 跨页直达目标笔记 id（App 层注入；变化时自动选中） */
  focusNoteId?: number | null;
  /** 笔记 → 来源会话反向跳转（App 层切页 + focusSessionId） */
  onOpenSessions?: (sessionId: number) => void;
}

export default function NotesPage({ focusNoteId, onOpenSessions }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<Note | null>(null);
  const [status, setStatus] = useState("");
  // TD-003：请求序号防竞态——慢响应返回时不覆盖新结果
  const seqRef = useRef(0);

  const load = useCallback(async (kw: string) => {
    const seq = ++seqRef.current;
    try {
      const list = kw
        ? await invoke<Note[]>("search_notes", { keyword: kw })
        : await invoke<Note[]>("list_notes");
      if (seqRef.current === seq) setNotes(list);
    } catch (e) {
      if (seqRef.current === seq) setStatus(`加载失败: ${e}`);
    }
  }, []);

  // TD-003：搜索防抖（300ms）——避免每次按键都发起 invoke 造成请求风暴
  useEffect(() => {
    const timer = setTimeout(() => void load(keyword), 300);
    return () => clearTimeout(timer);
  }, [keyword, load]);

  // v0.7.1：跨页直达——会话页"查看笔记"跳转后自动选中并滚动可见
  // （忽略当前搜索词保证目标可见：显式导航优先于既有过滤上下文）
  useEffect(() => {
    if (focusNoteId == null) return;
    let disposed = false;
    (async () => {
      setKeyword("");
      const seq = ++seqRef.current;
      try {
        const list = await invoke<Note[]>("list_notes");
        if (disposed || seqRef.current !== seq) return;
        setNotes(list);
        const target = list.find((n) => n.id === focusNoteId);
        if (target) {
          setSelected(target);
          // 等待列表渲染后滚动行到可视区（与会话页段定位同模式）
          setTimeout(() => {
            document.getElementById(`note-row-${target.id}`)?.scrollIntoView({ block: "center" });
          }, 50);
        }
      } catch (e) {
        if (!disposed) setStatus(`加载失败: ${e}`);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [focusNoteId]);

  const runDelete = async (id: number) => {
    try {
      await invoke<boolean>("delete_note", { id });
      if (selected?.id === id) setSelected(null);
      void load(keyword);
    } catch (e) {
      setStatus(`删除失败: ${e}`);
    }
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左栏：搜索 + 列表 ── */}
      <div style={{ width: 320, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>📝 笔记</div>
        <div style={{ padding: 10, borderBottom: "1px solid #f3f4f6", display: "flex", gap: 6 }}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索标题/正文…"
            style={{ flex: 1, padding: "6px 8px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6 }}
          />
          <button onClick={() => void load(keyword)} style={{ fontSize: 13, cursor: "pointer" }}>⟳</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {notes.length === 0 && <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginTop: 24 }}>暂无笔记</p>}
          {notes.map((n) => (
            <div
              key={n.id}
              id={`note-row-${n.id}`}
              onClick={() => setSelected(n)}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #f3f4f6",
                cursor: "pointer",
                background: selected?.id === n.id ? "#f0fdfa" : "transparent",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {n.title}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                <span>{n.source === "classroom" ? "📡 课堂助手" : "✍ 手动"} · {new Date(n.updated_at * 1000).toLocaleString()}</span>
                {/* v0.7.1：会话↔笔记反向跳转（来源会话存在时显示） */}
                {n.session_id != null && (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSessions?.(n.session_id as number);
                    }}
                    style={{ fontSize: 11, color: "#0f766e", cursor: "pointer", fontWeight: 600 }}
                    title="跳转到来源会话"
                  >
                    来源会话 →
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        {status && <p style={{ padding: 8, fontSize: 12, color: "#dc2626" }}>{status}</p>}
      </div>

      {/* ── 右栏：详情 ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selected ? (
          <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selected.title}
              </h2>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>
                #{selected.id} · 创建于 {new Date(selected.created_at * 1000).toLocaleString()}
              </span>
              <button
                onClick={() => runDelete(selected.id)}
                style={{ fontSize: 12, color: "#dc2626", cursor: "pointer", padding: "4px 10px" }}
              >
                删除
              </button>
            </div>
            <pre
              style={{
                flex: 1,
                margin: 0,
                padding: 16,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                fontSize: 13,
                lineHeight: 1.8,
                background: "#fff",
              }}
            >
              {selected.content}
            </pre>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13 }}>
            从左侧选择一条笔记查看
          </div>
        )}
      </div>
    </div>
  );
}
