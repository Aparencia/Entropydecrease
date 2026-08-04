/**
 * 统一收件箱类型 — 与 schema v9 inbox_items 表一一对应
 * Unified inbox types — mirror schema v9 inbox_items 1:1
 *
 * @ai-context: 三路来源（clipboard 剪贴板收藏 / inspiration 灵感 /
 * import 知识入籍）统一汇聚；status 三态（new 待沉淀 / settled 已沉淀 /
 * archived 已归档）受 schema CHECK 约束，状态迁移可逆。
 * @ai-context: Sources are CHECK-constrained in schema; status transitions
 * are reversible (archive never deletes).
 */

/** 收件箱条目行结构（snake_case 直通 db IPC） */
export interface InboxItem {
  id: string;
  source: 'clipboard' | 'inspiration' | 'import';
  title: string;
  content: string;
  status: 'new' | 'settled' | 'archived';
  created_at: string;
}

/** 来源元信息（UI 徽章与筛选共用） */
export const SOURCE_META: Record<InboxItem['source'], { label: string; badge: string }> = {
  clipboard: { label: '剪贴板', badge: 'bg-cyan-500/15 text-cyan-400' },
  inspiration: { label: '灵感', badge: 'bg-amber-500/15 text-amber-400' },
  import: { label: '导入', badge: 'bg-violet-500/15 text-violet-400' },
};

/** 状态元信息 */
export const STATUS_META: Record<InboxItem['status'], { label: string; badge: string }> = {
  new: { label: '待沉淀', badge: 'bg-emerald-500/15 text-emerald-400' },
  settled: { label: '已沉淀', badge: 'bg-blue-500/15 text-blue-400' },
  archived: { label: '已归档', badge: 'bg-bg-tertiary text-text-tertiary' },
};
