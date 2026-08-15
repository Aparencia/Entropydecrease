/**
 * @ai-context: notes 模块卡片视觉工具：模板标签映射、纯文本截断、动画 variants、
 * 卡片倾斜/不对称圆角/折纸折叠类型/模板色的确定性分配（全部基于 id hash）。
 * 自 NotesPage.tsx L1-118 原样拆出，逻辑与引用完全不变。
 * @ai-context: Card visual FX utilities & animation variants extracted verbatim
 * from NotesPage.tsx module scope: template labels, stripHtml, motion variants,
 * deterministic per-id tilt/radius/origami-fold/color.
 */
import type { FoldType } from '@/components/OrigamiView';
import { stringHash } from '@/lib/utils/stringHash';
import { extractNoteText } from './extractNoteText';
import type { NoteTemplate } from '../components/TemplateSelector';

export const templateLabels: Record<NoteTemplate | 'qa' | 'video' | 'todo', string> = {
  outline: '大纲式', cornell: '康奈尔', mindmap: '思维导图', free: '自由笔记', blank: '空白', qa: '问答', video: '视频笔记', todo: '待办',
};

/** 列表预览用：截断至 120 字符（使用 extractNoteText 提取纯文本）；有搜索词时返回匹配上下文片段 */
export function stripHtml(html: string): string {
  return extractNoteText(html).slice(0, 120);
}

/* ── 动画 variants ── */
export const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
export const noteCardVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
};

/** 为每张卡片生成稳定的随机倾斜角度（基于 id hash，D12 收敛至 lib/utils/stringHash） */
export function cardTilt(id: string): number {
  return ((stringHash(id) % 10) - 5) * 0.1; // ±0.5deg
}

/** 不对称圆角样式（基于 id hash，D12 收敛至 lib/utils/stringHash） */
export function asymmetricRadius(id: string): string {
  const h = stringHash(id);
  const base = 12;
  const tl = base + (Math.abs(h % 7));
  const tr = base + (Math.abs((h >> 4) % 6));
  const br = base + (Math.abs((h >> 8) % 8));
  const bl = base + (Math.abs((h >> 12) % 5));
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

/** 折纸视图五种折叠类型（与 OrigamiView 的 FoldType 枚举对齐） */
const ORIGAMI_FOLD_TYPES: FoldType[] = ['fold', 'triangle', 'pinwheel', 'box', 'flower'];

/** 为每篇笔记确定性分配折叠类型（基于 id hash 轮转五种折法，D12 收敛） */
export function origamiFoldType(id: string): FoldType {
  return ORIGAMI_FOLD_TYPES[Math.abs(stringHash(id)) % ORIGAMI_FOLD_TYPES.length];
}

/** 笔记内容 → 折纸面板细节（纯文本按行拆分，截断防面板溢出） */
export function origamiDetails(content: string): string[] {
  return extractNoteText(content)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 24);
}

/** 模板类型 → 卡片主题色 */
export function colorForType(template: string): string {
  switch (template) {
    case 'cornell': return 'rgb(91,138,114)';   // brand-500
    case 'outline': return 'rgb(96,165,250)';   // accent-400
    case 'mindmap': return 'rgb(251,191,36)';   // note
    case 'todo':    return 'rgb(16,185,129)';   // emerald-500
    default:        return 'rgb(156,163,175)';  // border
  }
}
