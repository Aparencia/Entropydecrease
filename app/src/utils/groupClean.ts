/**
 * groupClean — 空组自动清理留痕纯工具（REQ-316 v0.20.12 批 7）。
 *
 * @ai-context: 后端写命令在使路由组变空时自动删除空组，并在结果契约回传
 *              autoCleanedGroups（组标题）。本模块只负责把标题列表拼成统一
 *              toast 文案——拼接规则单点可测，组件消费零重复逻辑。
 *              Why 用 null：无清理时调用方需要"零变化"语义（不弹 toast、
 *              不改状态），null 比空串更明确表达"无事发生"。
 */

/** toast 前缀（前后端口径同一句话——用户可搜索对齐） */
export const AUTO_CLEAN_TOAST_PREFIX = "已自动清理空组：";

/** 组标题列表 → 留痕文案；无清理（空/null 列表）→ null（调用方零变化） */
export function autoCleanNotice(groupNames: string[] | null | undefined): string | null {
  if (!groupNames || groupNames.length === 0) return null;
  return `${AUTO_CLEAN_TOAST_PREFIX}${groupNames.join("、")}`;
}
