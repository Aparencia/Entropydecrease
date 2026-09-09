/**
 * entityLabel — 实体语义标签（REQ-277 裸号治理：`#数字` 全站绝迹）。
 *
 * @ai-context Why：内部数字 id（note/session 主键）仅供引用通道使用；任何
 *              面向用户的实体提及一律用标题语义——标题不可得（未载入/已删除/
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
  // 审查修复（0.19.4/5）：占位改中性——缺标题时"未载入"（标题映射未拉到）与
  // "来源已删除"无法本地区分，旧文案「来源已删除」会误判仍在的实体；诚实中性。
  return kind === "session" ? "会话（标题不可用）" : "笔记（标题不可用）";
}

/** 任务来源类别文案（列表/徽标行用——不带 id） */
export function kindWord(kind: RefKind): string {
  return kind === "session" ? "会话" : "笔记";
}

/** AI 任务标题解析所需的最小字段（不依赖 AiTaskRecord——纯函数防循环引用） */
export interface TaskRefTitleInput {
  opType: string;
  /** v0.17.0 起落库（session|note）；NULL=旧数据 */
  targetKind?: string | null;
  refId: number;
}

/** AI 任务来源类别解析（标题查表前置——统一口径单一来源）。
 *
 * @ai-context Why（2026-09-09 批 1 修复）：精修双入口下 ref_id 语义不同——
 *              会话级精修 ref_id=会话 id、笔记级精修 ref_id=笔记 id；只按
 *              opType 分发会让笔记级精修错查会话标题表（错名/「会话（标题
 *              不可用）」）。分发规则：enrich 恒为笔记级（后端入参即 note_id，
 *              含 v0.17.0 前 target_kind=NULL 旧数据——不猜 session）；refine
 *              按 target_kind 分流，NULL=旧数据（v0.17.0 前只有会话级精修）
 *              → session 兜底（与 TaskConversationView 跳转分发同口径）。
 */
export function taskRefKind(t: TaskRefTitleInput): RefKind {
  return t.opType === "enrich" || t.targetKind === "note" ? "note" : "session";
}

/** AI 任务目标语义标签：按类别查对应标题表；缺标题 → 类别中性占位（不裸号） */
export function taskRefLabel(
  t: TaskRefTitleInput,
  sessionTitles?: ReadonlyMap<number, string>,
  noteTitles?: ReadonlyMap<number, string>,
): string {
  const kind = taskRefKind(t);
  const titles = kind === "note" ? noteTitles : sessionTitles;
  return refLabel(kind, titles?.get(t.refId));
}
