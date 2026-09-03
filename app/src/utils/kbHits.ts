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
    return { mode: v.mode, hits: v.hits as KbHit[] };
  } catch {
    return null;
  }
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
