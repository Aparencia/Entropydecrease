/**
 * entityLabel — 实体语义标签（REQ-277 裸号治理：`#数字` 全站绝迹）。
 *
 * @ai-context Why：内部数字 id（note/session 主键）仅供引用通道使用；任何
 *              面向用户的实体提及一律用标题语义——标题不可得（来源已删除/
 *              未命名）时用占位文案，绝不回退裸 `#数字`（v0.12.7 治理延续至
 *              AI 任务与 toasts；配套数据库 uid 基建见 Rust db_uid.rs）。
 */

/** 实体类别（决定缺标题时的默认占位文案） */
export type RefKind = "session" | "note";

/** 实体语义标签：标题优先；缺标题 → 传入 fallback 或按类别默认占位 */
export function refLabel(
  kind: RefKind,
  title: string | null | undefined,
  fallback?: string,
): string {
  const t = title?.trim();
  if (t) return t;
  if (fallback) return fallback;
  return kind === "session" ? "会话（来源已删除）" : "笔记（来源已删除）";
}

/** 任务来源类别文案（列表/徽标行用——不带 id） */
export function kindWord(kind: RefKind): string {
  return kind === "session" ? "会话" : "笔记";
}
