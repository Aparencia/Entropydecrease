/**
 * chatTranscript — 对话 → 笔记转写纯函数（v0.16.1 用户决定② 完整对话含问答）。
 *
 * @ai-context: 用户提问以引用块（>）呈现、AI 回答以正文呈现，轮次间空行分隔；
 *              形如：`> **🧑 你**：问题` + 回答段落。failed 消息（占位错误）
 *              跳过不写入（失败内容无知识价值）；aborted 保留已生成部分并标注。
 *              upToId 截断（消息级"存为笔记"= 自会话首条至该消息的完整上下文）——
 *              纯函数，可单测；渲染由 NoteMarkdown 承担（复用荧光笔/图片/表格）。
 */
import type { ChatMessage } from "../types";

function fmtTime(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 多行内容 → 引用块（每行加 > 前缀） */
function quoteLines(content: string): string {
  return content
    .split("\n")
    .map((l) => (l.trim() === "" ? ">" : `> ${l}`))
    .join("\n");
}

/**
 * 构造对话转笔记的 Markdown 正文。
 *
 * @param messages 会话消息（按时间正序）
 * @param upToId 截断边界（含该条；undefined=全部）
 */
export function buildConversationMarkdown(messages: ChatMessage[], upToId?: number): string {
  const parts: string[] = [];
  // v0.16.1 审查修复：upToId 未命中（消息已删除/跨会话错位）→ 回退全量，
  // 防"另存为笔记"落一个空正文（静默损坏比多存内容更伤）
  const idx = upToId == null ? -1 : messages.findIndex((m) => m.id === upToId);
  const scope = upToId == null || idx < 0 ? messages : messages.slice(0, idx + 1);
  for (const m of scope) {
    if (m.status === "failed" || m.content.trim() === "") continue;
    if (m.role === "user") {
      parts.push(`> **🧑 你（${fmtTime(m.createdAt)}）**\n\n${quoteLines(m.content)}`);
    } else {
      const label = m.status === "aborted" ? "🤖 AI（已停止）" : "🤖 AI";
      parts.push(`**${label}（${m.model ?? "—"} · ${fmtTime(m.createdAt)}）**\n\n${m.content}`);
    }
  }
  return parts.join("\n\n");
}
