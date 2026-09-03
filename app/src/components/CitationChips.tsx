/**
 * CitationChips — 学习库问答引用卡片（v0.19.1 REQ-260）。
 *
 * @ai-context: assistant 消息下的引用区：逐条命中 = 卡片（📄 笔记·节标题 /
 *              📎 碎片·组）+ snippet 一行；点击笔记卡片跨页打开笔记并把首个
 *              ==命中词== 注入笔记阅读态搜索（高亮+定位——设计 §7.1 最小面）；
 *              碎片无跳转目标——title 提示素材仅展示。
 */
import type { KbHit } from "../types";
import { firstMarkedTerm, hitLabel, isNoteHit } from "../utils/kbHits";

interface Props {
  hits: KbHit[];
  /** 点笔记引用（search=首个命中词——可为空串不注入搜索） */
  onOpenNote?: (noteId: number, search: string) => void;
  /** 命中区标题（上下文语境——hits-only 与 answer 同款展示） */
  title?: string;
}

export default function CitationChips({ hits, onOpenNote, title = "📚 本地命中" }: Props) {
  if (hits.length === 0) return null;
  return (
    <div data-testid="citation-chips" style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{title}（{hits.length}）</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {hits.map((h) => {
          const label = hitLabel(h);
          const note = isNoteHit(h);
          const clickable = note && !!onOpenNote;
          return (
            <button
              key={h.chunkId}
              data-testid={`citation-${h.chunkId}`}
              data-note={note ? String(h.noteId) : undefined}
              onClick={
                clickable
                  ? () => onOpenNote!(h.noteId, firstMarkedTerm(h.snippet) ?? "")
                  : undefined
              }
              disabled={!clickable}
              title={`${label}\n${h.snippet.replace(/==/g, "")}${note ? "\n点击打开笔记并高亮命中" : ""}`}
              style={{
                maxWidth: "100%",
                textAlign: "left",
                cursor: clickable ? "pointer" : "default",
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                border: clickable ? "1px solid #99f6e4" : "1px solid #e5e7eb",
                background: clickable ? "#f0fdfa" : "#fafafa",
                color: clickable ? "#0f766e" : "#6b7280",
                display: "flex",
                gap: 6,
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
              <span style={{ color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                {h.snippet.replace(/==/g, "")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
