/**
 * 笔记 3D 空间投影类型与双主题材质配置
 * Reef 3D projection types & dual-theme material config
 *
 * @ai-context: 笔记页 3D 空间重构（沉降深渊 × 海底石窟）的数据层。ReefNote
 * 是 NotesPage 投影数据的切片（无 content 全文，与 P1-1 惰性加载兼容）。
 * 双主题色板：abyss（深色·磷光蓝系）与 grotto（浅色·晨光琥珀系），模板色
 * 决定节点发光色。hashId/seeded 复用 KnowledgeMap3D 确定性伪随机算法，
 * 保证布局稳定不随渲染抖动。
 * @ai-context: Data layer for the notes 3D space. ReefNote is a projection
 * slice without full content. Dual-theme palettes: abyss (dark bioluminescent
 * blue) and grotto (light morning amber). Deterministic PRNG keeps layout stable.
 */
import type { Note } from '@/types/models';

/** 3D 视图节点投影（无 content 全文） */
export interface ReefNote {
  id: string;
  title: string;
  template: Note['template'];
  wordCount: number;
  updatedAt: Date;
  folderId?: string;
  tags: string[];
  pinned: boolean;
}

/** 3D 形态：深色=沉降深渊（abyss），浅色=海底石窟（grotto） */
export type ReefMorph = 'abyss' | 'grotto';

/** 模板 → 发光色（双主题各自映射，深海生物发光叙事） */
export const TEMPLATE_COLORS: Record<ReefMorph, Record<string, string>> = {
  abyss: {
    outline: '#6FB4E8',   // 磷光蓝
    cornell: '#40AB92',   // 磷光青绿
    mindmap: '#E8B84B',   // 萤火暖黄
    todo: '#43C58B',      // 荧光翠绿
    free: '#F0E3C8',      // 晨光暖白
    blank: '#9FB8D8',     // 星光淡蓝
    qa: '#4A9BD9',        // 深海磷光蓝
    'qa-grid': '#B5D84E', // 苔藓荧光黄绿
    timeline: '#2FB8AC',  // 声呐青
    video: '#D18A2A',     // 认知琥珀金
  },
  grotto: {
    outline: '#3B689A',   // 晨空蓝
    cornell: '#4E8A77',   // 苔绿
    mindmap: '#C9761F',   // 晨光琥珀
    todo: '#2F8F6B',      // 翠绿深版
    free: '#8A6B4A',      // 暖棕
    blank: '#7C93AD',     // 雾蓝灰
    qa: '#2B5F9E',        // 磷光蓝深版
    'qa-grid': '#7A8F2E', // 橄榄黄绿
    timeline: '#2E7D75',  // 青绿深版
    video: '#B05E12',     // 晨光琥珀深版
  },
};

/** 模板色兜底（未知模板） */
export const TEMPLATE_FALLBACK: Record<ReefMorph, string> = {
  abyss: '#9FB8D8',
  grotto: '#7C93AD',
};

/** 深渊四层语义（海面→海沟，2D 视图深度指示与刻度用） */
export const ABYSS_LAYERS = [
  { name: '海面', y: 0 },
  { name: '浅海', y: -5 },
  { name: '深海', y: -10 },
  { name: '海沟', y: -15 },
] as const;

/** 确定性伪随机（复用 KnowledgeMap3D 算法） */
export function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** 确定性伪随机 0-1（复用 KnowledgeMap3D 算法） */
export function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/** WebGL 可用性探测（一次） */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** 亮度 0.35-1：编辑越近越亮（宪法：掌握度=发光体亮度，时间衰减代理） */
export function nodeBrightness(note: ReefNote): number {
  const ageDays = (Date.now() - new Date(note.updatedAt).getTime()) / 86400000;
  if (ageDays < 1) return 1;
  if (ageDays < 7) return 0.8;
  if (ageDays < 30) return 0.6;
  return Math.max(0.35, 0.55 - Math.log2(ageDays / 7) * 0.08);
}

/** 大小 0.10-0.30：wordCount 映射（聚类于小尺寸，大笔记显著放大） */
export function nodeSize(wordCount: number): number {
  return Math.min(0.3, 0.1 + wordCount / 3000);
}
