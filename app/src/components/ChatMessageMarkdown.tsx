/**
 * ChatMessageMarkdown — AI 对话消息 Markdown 渲染（v0.16.0）。
 *
 * @ai-context: 聊天渲染专用轻量栈（GFM + 数学 + 换行），不复用 NoteMarkdown
 *              （那是笔记域——任务勾选回写/时间戳回链/图片组件耦合笔记上下文）；
 *              聊天消息无这些语义，保持渲染器单一职责。
 */
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Props {
  content: string;
}

/** 深度预览截断（轨迹/结果展开用——长文不撑爆 DOM） */
export const PREVIEW_MAX_CHARS = 2000;

export function truncatePreview(text: string, max: number = PREVIEW_MAX_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…（内容过长已截断，仅展示前 ${max} 字符）`;
}

export default function ChatMessageMarkdown({ content }: Props) {
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.7, wordBreak: "break-word" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            const text = String(children).replace(/\n$/, "");
            if (isBlock) {
              return (
                <pre style={{ background: "#f6f8fa", padding: 10, borderRadius: 6, overflowX: "auto" }}>
                  <code className={className}>{text}</code>
                </pre>
              );
            }
            return <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 4 }}>{text}</code>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
