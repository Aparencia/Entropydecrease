/**
 * ChatMessageList — AI 对话消息流（v0.16.0 REQ-225，DSH 交互范式；
 * v0.19.1 REQ-260 学习库问答双产物：命中引用卡片 + 生成回答）。
 *
 * @ai-context: 状态机对应——streaming.text 非空 = 流式生成中（打字光标 +
 *              停止由 Composer 控制）；失败占位（status=failed）渲染错误
 *              气泡 + 重发按钮（chat_regenerate）；aborted 渲染停止态。
 * @ai-context: assistant 消息 meta_json（{mode,hits}）→ 引用 chips：命中
 *              （hits-only 引导消息与真回答同款展示）→ 点笔记卡片跨页打开
 *              并注入首个命中词高亮（设计 §7.1 最小面——碎片仅展示）。
 */
import { useEffect, useRef } from "react";
import type { ChatMessage, KbHit } from "../types";
import ChatMessageMarkdown from "./ChatMessageMarkdown";
import CitationChips from "./CitationChips";
import { parseKbMeta } from "../utils/kbHits";

export interface StreamingState {
  /** 流式累积文本（非 null = 流式生成中） */
  text: string | null;
  /** v0.19.1：流内命中片段（kb_hits 事件——本地恒可用，非终态） */
  hits?: KbHit[];
}

interface Props {
  messages: ChatMessage[];
  streaming: StreamingState | null;
  onRegenerate: () => void;
  /** 编辑后重发入口（user 消息 ✎ → 预填 composer） */
  onEditUser?: (message: ChatMessage) => void;
  /** 当前正在编辑的消息 id（高亮） */
  editingId?: number | null;
  /** v0.16.1：AI 消息「存为笔记」入口（父层开保存对话框——至该条的完整上文） */
  onSaveMessage?: (message: ChatMessage) => void;
  /** v0.19.1：引用卡片点击（noteId + 命中词——笔记阅读态高亮搜索） */
  onOpenCitedNote?: (noteId: number, search: string) => void;
}

function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function parseUsage(usageJson: string | null): { tokens: number | null } {
  if (!usageJson) return { tokens: null };
  try {
    const u = JSON.parse(usageJson) as { total_tokens?: number; totalTokens?: number; prompt_tokens?: number; completion_tokens?: number };
    const total = u.total_tokens ?? u.totalTokens ?? ((u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0));
    return { tokens: total > 0 ? total : null };
  } catch {
    return { tokens: null };
  }
}

export default function ChatMessageList({ messages, streaming, onRegenerate, onEditUser, editingId, onSaveMessage, onOpenCitedNote }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streaming?.text]);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px" }}>
      {messages.length === 0 && !streaming && (
        <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 80, fontSize: 13 }}>
          开始你的第一句话——例如「用通俗的语言解释一下什么是梯度下降」
        </div>
      )}
      {messages.map((m) => {
        const isUser = m.role === "user";
        const meta = parseKbMeta(m.metaJson);
        return (
          <div key={m.id} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div style={{ maxWidth: "86%", ...(isUser ? { background: "#0d9488", color: "#fff", padding: "8px 12px", borderRadius: "10px 10px 2px 10px" } : { padding: "2px 0" }) }}>
              {isUser ? (
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 13.5 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 11, color: "#99f6e4" }}>{fmtTime(m.createdAt)}</span>
                    {onEditUser && m.status === "done" && (
                      <span
                        role="button"
                        title="编辑后重发"
                        onClick={() => onEditUser(m)}
                        style={{ fontSize: 11, cursor: "pointer", color: editingId === m.id ? "#fff" : "#99f6e4", textDecoration: editingId === m.id ? "underline" : "none" }}
                      >
                        ✎ {editingId === m.id ? "编辑中" : "编辑"}
                      </span>
                    )}
                  </div>
                  <div>{m.content}</div>
                </div>
              ) : m.status === "failed" ? (
                <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, color: "#991b1b" }}>
                  {/* v0.19.1：失败也保留引用（meta 命中照挂——回退命中列表 + 重试） */}
                  {meta && meta.hits.length > 0 && (
                    <CitationChips hits={meta.hits} onOpenNote={onOpenCitedNote} title="📚 本地命中（引用保留）" />
                  )}
                  生成失败：{m.content || "未知错误"}
                  <div>
                    <button onClick={onRegenerate} style={{ marginTop: 6, fontSize: 12, padding: "2px 10px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", color: "#b91c1c", cursor: "pointer" }}>
                      ↩ 重试
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ borderRadius: "10px 10px 10px 2px" }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 2, display: "flex", gap: 8 }}>
                    <span>🤖 {m.model ?? "AI"}</span>
                    <span>{fmtTime(m.createdAt)}</span>
                    {m.status === "aborted" && <span style={{ color: "#b45309" }}>已停止</span>}
                    {parseUsage(m.usageJson).tokens != null && (
                      <span>{parseUsage(m.usageJson).tokens} tokens</span>
                    )}
                  </div>
                  <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px" }}>
                    <ChatMessageMarkdown content={m.content} />
                    {/* v0.19.1：引用 chips（answer 与 hits-only 引导同款展示） */}
                    {meta && meta.hits.length > 0 && (
                      <CitationChips hits={meta.hits} onOpenNote={onOpenCitedNote} />
                    )}
                  </div>
                  {/* v0.16.1：AI 回答整段存为笔记（至该条的完整对话上下文） */}
                  {onSaveMessage && (m.status === "done" || m.status === "aborted") && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                      <button
                        data-testid={`save-message-${m.id}`}
                        onClick={() => onSaveMessage(m)}
                        style={{ fontSize: 11, cursor: "pointer", border: "none", background: "none", color: "#0d9488", padding: "1px 4px" }}
                        title="把这段对话（含提问）另存为笔记"
                      >
                        📄 存为笔记
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {/* 流式占位（进行中回答）——命中引用随 kb_hits 事件先达 */}
      {streaming?.text !== null && streaming?.text !== undefined && (
        <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", maxWidth: "86%" }}>
            <ChatMessageMarkdown content={streaming.text} />
            {(streaming.hits?.length ?? 0) > 0 && <CitationChips hits={streaming.hits ?? []} onOpenNote={onOpenCitedNote} />}
            <span style={{ display: "inline-block", width: 6, height: 14, background: "#0d9488", animation: "chatBlink 1s infinite", verticalAlign: "text-bottom", marginLeft: 2 }} />
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
