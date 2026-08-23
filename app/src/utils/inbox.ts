/**
 * inbox.ts — 收件箱动线纯函数（v0.12.2 碎片→笔记）。
 *
 * @ai-context: 二元论裁决（用户 2026-08-23）——碎片=灵感/待处理原料，不是短
 *               笔记；升笔记轻确认：标题预填首句可改 + 归组下拉（默认未归组）。
 *               预填规则独立成纯函数可单测（空值/超长/无标点边界）。
 */

/** 升笔记标题预填（预填首句；超长截断防标题溢出——TITLE_MAX_CHARS=100 前端上限 50 保守） */
export function promoteTitleFor(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "未命名笔记";
  // 首句：按中文句末标点换行切分，取第一个非空段
  const first = trimmed
    .split(/[。！？!?；;\n]+/)
    .map((s) => s.trim())
    .find((s) => s.length > 0);
  const base = first ?? trimmed;
  // 去掉句首装饰（前缀符号/列表标记）保标题干净
  const clean = base.replace(/^[\s#*\-•·]+/, "");
  return (clean || "未命名笔记").slice(0, 50);
}

/** 碎片正文预览（收件箱卡内截断显示；超限补省略号） */
export function fragmentPreview(text: string, max = 300): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}
