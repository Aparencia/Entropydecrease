/**
 * 知识星座 · 布局纯函数层（DOM/SVG 轨 L1）
 * Knowledge constellation · layout layer (pure)
 *
 * @ai-context: 阶段 B 视觉轨的原子层。把图谱节点映射为 SVG 百分比
 * 坐标：按 tier 分三档同心环（牢固=内环清冽明亮、朦胧=外环雾中），
 * 每档 L1 ≤15 节点（宪法第四条知识星座 medium/low 预算）；同层
 * 角度均匀打底 + seeded 确定性抖动（同一 id 布局永远稳定）。
 * 链只保留两端都在显示集合内的（截断后不产生悬空线）。
 * 纯函数、无副作用，可安全单元测试。
 *
 * @ai-context: Maps graph nodes onto concentric tier rings with
 * deterministic seeded jitter; caps each tier at 15 nodes (L1).
 */
import type { KnowledgeGraph, KnowledgeLink, KnowledgeNode, KnowledgeTier } from './knowledgeGraph';

/** 布局输出：带坐标的节点 + 过滤后的链 / Layout result */
export interface LayoutNode extends KnowledgeNode {
  /** 百分比坐标 0-100 / Percent coords */
  x: number;
  y: number;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  links: KnowledgeLink[];
}

/** L1 每档节点上限（宪法第四条知识星座 medium/low 预算） */
export const MAX_PER_TIER = 15;

/** 档位 → 同心环半径（百分比，圆心 50,50）/ Tier rings */
const TIER_RING: Record<KnowledgeTier, { rMin: number; rMax: number }> = {
  牢固: { rMin: 12, rMax: 26 },
  成长中: { rMin: 30, rMax: 44 },
  朦胧: { rMin: 48, rMax: 62 },
};

const TIER_ORDER: KnowledgeTier[] = ['牢固', '成长中', '朦胧'];

/** 基于字符串 id 的确定性伪随机（与 inspiration/constellationLayout 同算法） */
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** 确定性伪随机 [0, 1) / Deterministic pseudo-random */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/**
 * 布局图谱：三档同心环 + 每档截断 + 悬空链过滤
 * Layout the graph onto tier rings (L1 caps and dangling-link filtering).
 */
export function layoutKnowledgeGraph(graph: KnowledgeGraph): LayoutResult {
  if (graph.coldStart || graph.nodes.length === 0) {
    return { nodes: [], links: [] };
  }

  // 1. 按 tier 分组并截断（保持输入顺序 = 最近更新优先）
  const perTier: Record<KnowledgeTier, LayoutNode[]> = { 牢固: [], 成长中: [], 朦胧: [] };
  for (const n of graph.nodes) {
    const group = perTier[n.tier];
    if (group.length >= MAX_PER_TIER) continue;
    group.push({ ...n, x: 0, y: 0 });
  }

  // 2. 每档同心环分布（角度均匀打底 + seeded 抖动）
  const nodes: LayoutNode[] = [];
  for (const tier of TIER_ORDER) {
    const group = perTier[tier];
    const ring = TIER_RING[tier];
    group.forEach((node, i) => {
      const seed = hashId(node.id);
      const angle = (i / group.length) * Math.PI * 2 + seeded(seed) * 0.6;
      const r = ring.rMin + seeded(seed * 31 + 7) * (ring.rMax - ring.rMin);
      node.x = Math.round((50 + r * Math.cos(angle)) * 100) / 100;
      node.y = Math.round((50 + r * Math.sin(angle)) * 100) / 100;
    });
    nodes.push(...group);
  }

  // 3. 只保留两端都在显示集合内的链（截断后无悬空线）
  const visible = new Set(nodes.map((n) => n.id));
  const links = graph.links.filter((l) => visible.has(l.source) && visible.has(l.target));

  return { nodes, links };
}
