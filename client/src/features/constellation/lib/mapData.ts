/**
 * 三维知识脑图 · 派生纯函数层（4.8）
 * 3D knowledge map · derivation layer (pure)
 *
 * @ai-context: 把知识图谱节点映射为三维脑图节点：position3D 以掌握度
 * （glow 口径）为 z 轴分层（牢固=顶层清冽明亮、朦胧=底层雾中，宪法
 * 第一条映射的 2.5D 化）；x/y 用 seeded 确定性打散（同一 id 永远同
 * 位置，与 knowledgeLayout 同算法）。connections 聚合三种链
 * （weakpoint/shared-note/review-chain），两端不在显示集合内的链
 * 被丢弃，不产生悬空线。sourceModule 取卡片 source_ref，无溯源卡
 * 归入 synthetic 模块，费曼薄弱点归入「费曼」模块。纯函数、无副作用。
 *
 * @ai-context: Projects knowledge graph nodes onto a 2.5D map where the
 * z-axis is mastery (solid concepts on top); x/y are seeded scatter.
 */
import type { KnowledgeGraph } from './knowledgeGraph';
import type { MapNode3D } from './mapTypes';

/** 无溯源卡片的合成模块 / Synthetic module for cards without a source ref */
export const UNKNOWN_MODULE = '未分类';

/** 费曼薄弱点合成模块 / Synthetic module for feynman weakpoints */
export const FEYNMAN_MODULE = '费曼薄弱点';

/** 模块色板（地铁图/三维脑图共用；8 色循环，饱和中调、深色可读） */
export const MODULE_COLORS = [
  '#6366f1', // 靛蓝
  '#0ea5e9', // 天蓝
  '#10b981', // 翠绿
  '#f59e0b', // 琥珀
  '#ec4899', // 粉
  '#8b5cf6', // 紫
  '#f43f5e', // 玫红
  '#14b8a6', // 青
] as const;

/** 三维地图世界半径 / World radius of the map disc */
const MAP_RADIUS = 4.2;

/** z 轴分层高度（掌握度 0-1 → 世界 z 0-3.2） / Layer height by mastery */
const LAYER_HEIGHT = 3.2;

/** 确定性伪随机（与 knowledgeLayout 同算法） */
function hashId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

/** 模块名 → 稳定颜色（hash 到色板） / Stable module color */
export function moduleColor(module: string): string {
  const seed = hashId(module);
  return MODULE_COLORS[seed % MODULE_COLORS.length];
}

/** 卡片节点 → 来源模块（source_ref 缺失归入合成模块） */
function sourceModuleOf(nodeId: string, sourceRefs: Map<string, string>): string {
  if (nodeId.startsWith('feynman:')) return FEYNMAN_MODULE;
  const cardId = nodeId.slice('card:'.length);
  return sourceRefs.get(cardId) ?? UNKNOWN_MODULE;
}

/**
 * 派生三维脑图节点 / Derive 3D map nodes
 * @param graph - 派生知识图谱（buildKnowledgeGraph 输出）
 * @param sourceRefs - 卡片 id → 溯源字符串（来自原始卡片数据 sourceRef）
 */
export function deriveMapNodes(
  graph: KnowledgeGraph,
  sourceRefs: Map<string, string> = new Map(),
): MapNode3D[] {
  if (graph.coldStart || graph.nodes.length === 0) return [];

  // 邻居索引：链两端互连（无向）
  const neighbors = new Map<string, Set<string>>();
  for (const link of graph.links) {
    if (!neighbors.has(link.source)) neighbors.set(link.source, new Set());
    if (!neighbors.has(link.target)) neighbors.set(link.target, new Set());
    neighbors.get(link.source)!.add(link.target);
    neighbors.get(link.target)!.add(link.source);
  }

  return graph.nodes.map((node) => {
    const seed = hashId(node.id);
    const angle = seeded(seed * 7 + 3) * Math.PI * 2;
    const r = Math.sqrt(seeded(seed * 31 + 9)) * MAP_RADIUS;
    const mastery = node.glow;
    const module = sourceModuleOf(node.id, sourceRefs);
    return {
      id: node.id,
      title: node.concept,
      mastery,
      connections: [...(neighbors.get(node.id) ?? [])],
      position3D: [
        Math.round(r * Math.cos(angle) * 100) / 100,
        Math.round(r * Math.sin(angle) * 100) / 100,
        Math.round(mastery * LAYER_HEIGHT * 100) / 100,
      ],
      sourceModule: module,
    };
  });
}
