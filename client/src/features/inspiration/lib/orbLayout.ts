/**
 * 萤火海沟 — 萤火球群布局纯函数
 * @ai-context 将灵感条目按 content_nature 分组、计算球体尺寸/形状/发光色，
 * 驱动 InspirationCard 的球群渲染。纯逻辑模块，无副作用。
 */

import type { InspirationItem } from '../store/inspirationStore';
import { NATURE_MAP } from '../constants';

// ─────────────────────────────────────────────────────────────
// 分组
// ─────────────────────────────────────────────────────────────

/** 性质分组排序 @ai-context 球群按类别聚合渲染，顺序与 CONTENT_NATURE_OPTIONS 对齐 */
export function groupInspirationsByNature(
  items: InspirationItem[],
): Record<string, InspirationItem[]> {
  const groups: Record<string, InspirationItem[]> = {};
  for (const item of items) {
    const nature = item.tags.content_nature;
    if (!groups[nature]) groups[nature] = [];
    groups[nature].push(item);
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────
// 球体尺寸
// ─────────────────────────────────────────────────────────────

/** 认知深度 → 球体直径(px) @ai-context 越深的认知层级球越大，视觉权重越高 */
export function calcOrbSize(depth: string): number {
  switch (depth) {
    case 'understanding': return 72;
    case 'application':   return 80;
    case 'shallow':
    default:              return 64;
  }
}

// ─────────────────────────────────────────────────────────────
// 截断文本
// ─────────────────────────────────────────────────────────────

/** 截取前 4~6 字符 @ai-context 球体收缩态仅展示极简文字，保持视觉纯净 */
export function truncateContent(content: string, maxLen = 5): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + '…';
}

// ─────────────────────────────────────────────────────────────
// 形状 CSS 类名
// ─────────────────────────────────────────────────────────────

/**
 * 性质 → 球体形状 CSS 类
 * @ai-context 每种内容性质对应独特几何形状，用户一眼可辨类别
 * todo 使用 clip-path 实现六边形，其余使用 border-radius
 */
export function getOrbShape(nature: string): string {
  switch (nature) {
    case 'concept':
      return 'rounded-lg';
    case 'question':
      return 'rotate-45 rounded-lg';
    case 'inspiration':
      return 'rounded-full';
    case 'todo':
      /* clip-path 六边形 — Tailwind 不内置，用 inline style 注入 */
      return 'rounded-lg'; // fallback，实际 clip-path 在组件内联 style 注入
    default:
      return 'rounded-full';
  }
}

/** 判断是否为 todo 类型（需要 clip-path） @ai-context 组件内根据此值决定注入 clip-path style */
export function needsTodoClipPath(nature: string): boolean {
  return nature === 'todo';
}

/** todo 六边形 clip-path 值 @ai-context 正六边形近似 */
export const TODO_CLIP_PATH = 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)';

// ─────────────────────────────────────────────────────────────
// 发光色
// ─────────────────────────────────────────────────────────────

/** 性质 → 球体发光色(rgba) @ai-context boxShadow 颜色，复用 constants 配色体系 */
export function getOrbGlowColor(nature: string): string {
  switch (nature) {
    case 'concept':     return 'rgba(74, 155, 217, 0.5)';  // 磷光蓝
    case 'question':    return 'rgba(234, 88, 12, 0.5)';   // orange
    case 'inspiration': return 'rgba(232, 184, 75, 0.5)';  // 萤火暖黄
    case 'todo':        return 'rgba(22, 163, 74, 0.5)';   // green
    default:            return 'rgba(148, 163, 184, 0.4)'; // slate
  }
}

/** 性质 → 展开态边框色 @ai-context 球体展开为卡片后的 border accent */
export function getOrbAccentBorder(nature: string): string {
  const opt = NATURE_MAP[nature];
  return opt?.color ?? 'text-text-secondary';
}
