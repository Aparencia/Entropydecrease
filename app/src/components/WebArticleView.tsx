/**
 * WebArticleView — web 会话文章阅读视图（v0.20.4 / REQ-303 阶段 1）。
 *
 * @ai-context: kind=web 会话详情展示正文 MD（标题层级原样）+ 来源元数据 +
 *              URL 回链（点段落跳原文——标题锚点语义）；转笔记走
 *              session_to_note（commands_session_note kind=web 分支直落，
 *              不经口语过滤链）；正文抽取失败显示 raw_html 附件降级提示。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface WebPageView {
  session_id: number;
  url: string;
  site: string | null;
  author: string | null;
  published: string | null;
  markdown: string;
  raw_html: string | null;
  extracted_ok: boolean;
  fetched_at: number;
}

interface Props {
  sessionId: number;
  onToNote: (id: number) => void;
  onRemove: (id: number) => void;
}

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6 };

export default function WebArticleView({ sessionId, onToNote, onRemove }: Props) {
  const [page, setPage] = useState<WebPageView | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void invoke<WebPageView | null>("web_page_get", { sessionId })
      .then(setPage)
      .catch((e) => setErr(String(e)));
  }, [sessionId]);

  if (err) return <p style={{ fontSize: 12, color: "#dc2626" }}>{err}</p>;
  if (!page) return <p style={{ fontSize: 12, color: "#9ca3af" }}>文章加载中…</p>;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          来源 {page.site ?? "网页"}
          {page.author ? ` · ${page.author}` : ""}
          {page.published ? ` · ${page.published.slice(0, 10)}` : ""}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            style={{ ...btn, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }}
            onClick={() => onToNote(sessionId)}
          >
            📝 转为笔记
          </button>
          <button style={btn} onClick={() => onRemove(sessionId)}>
            删除
          </button>
        </span>
      </div>
      <div style={{ fontSize: 11, marginBottom: 8 }}>
        🔗 <a href={page.url} target="_blank" rel="noreferrer" style={{ color: "#2563eb", wordBreak: "break-all" }}>{page.url}</a>
      </div>
      {!page.extracted_ok && (
        <div style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
          ⚠ 正文抽取失败——已保留原始 HTML 附件（raw_html），可等待扩展/快照路径再处理；本页暂不能转笔记。
        </div>
      )}
      {page.extracted_ok && (
        <div style={{ fontSize: 14, lineHeight: 1.8, color: "#111827", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {page.markdown}
        </div>
      )}
      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
        抓取于 {new Date(page.fetched_at * 1000).toLocaleString()} · 正文为整篇初稿（原子化拆解留给核心处理/提炼动线）
      </div>
    </div>
  );
}
