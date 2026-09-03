/**
 * 学习库命中/引用解析工具（v0.19.1 REQ-260——纯函数，可单测）。
 *
 * @ai-context: meta_json 契约 {mode,hits}（Rust kb_meta_json 同构）；
 *              snippet 内 `==命中==` 标记 = 全站 remark 高亮协议产物——
 *              引用跳笔记时取首个标记词作为笔记内搜索词（复用笔记阅读态
 *              搜索高亮，实现"点引用跳笔记高亮命中词"的最小面）。
 */
import type { KbHit, KbMessageMeta } from "../types";

/** meta_json → 结构（畸形/缺失 → null——诚实降级不崩渲染） */
export function parseKbMeta(metaJson: string | null): KbMessageMeta | null {
  if (!metaJson) return null;
  try {
    const v = JSON.parse(metaJson) as Partial<KbMessageMeta>;
    if (v?.mode !== "answer" && v?.mode !== "hits-only") return null;
    if (!Array.isArray(v.hits)) return null;
    // 审查 L3：元素级最小校验——单条畸形（历史/手工/跨版本字段漂移）丢弃而非
    // 整包拒绝或让渲染层对 undefined 字段崩（渲染契约依赖 snippet/chunkId）
    const hits = (v.hits as unknown[]).filter(isKbHit);
    return { mode: v.mode, hits };
  } catch {
    return null;
  }
}

/** 元素级契约校验（渲染所需字段齐备才算合法命中） */
function isKbHit(x: unknown): x is KbHit {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.chunkId === "number" &&
    (o.sourceKind === "note" || o.sourceKind === "fragment") &&
    typeof o.snippet === "string" &&
    (o.noteId === null || typeof o.noteId === "number") &&
    (o.noteTitle === null || typeof o.noteTitle === "string")
  );
}

/** snippet 首个 `==词==` 标记（命中词高亮跳转搜索词；无标记 → null） */
export function firstMarkedTerm(snippet: string): string | null {
  const m = snippet.match(/==([^=]+)==/);
  return m ? m[1] : null;
}

/** 引用卡片主标签（📄 笔记 · 节标题 / 📎 碎片——与提示词出处标签同口径） */
export function hitLabel(hit: KbHit): string {
  if (hit.sourceKind === "note") {
    const title = hit.noteTitle || "未命名笔记";
    return hit.heading ? `📄 ${title} · ${hit.heading}` : `📄 ${title}`;
  }
  return hit.groupName ? `📎 碎片（${hit.groupName}）` : "📎 碎片素材";
}

/** 该命中是否可跳转（笔记 → 打开阅读并搜索；碎片 → 仅展示） */
export function isNoteHit(hit: KbHit): hit is KbHit & { noteId: number } {
  return hit.sourceKind === "note" && hit.noteId != null;
}
