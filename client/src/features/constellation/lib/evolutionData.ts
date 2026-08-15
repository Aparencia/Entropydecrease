/**
 * 知识进化树 + 记忆宫殿 · 派生纯函数层（4.10）
 * Knowledge evolution tree + memory palace · derivation layer (pure)
 *
 * @ai-context: 把知识图谱映射为概念生命周期的树：stage 由「是否复习过」
 * 与掌握度共同决定（未复习=种子，朦胧已复习=萌芽，成长中=成长，
 * 牢固=开花，牢固且一周内复习=结果）；parentId 取链的 source（先
 * 到先得），配 ancestor 检查破环（shared-note 完全图会产生环）；
 * grafts=非父子关系的跨分支链（嫁接：虚线边）。wilted=非种子且
 * 30 天以上未复习（或从未复习）→ 枯萎预警。记忆宫殿：房间=来源
 * 模块，记忆项=概念 + 复习提示（hint 不剧透答案，只给复习时距）。
 * 纯函数、无副作用，可安全单元测试。
 *
 * @ai-context: Maps the knowledge graph onto a concept lifecycle tree
 * (stage from review history + mastery, cycle-safe parent assignment,
 * graft links for cross-branch connections, wilt warnings for stale
 * nodes) and groups concepts into memory palace rooms by module.
 */
import type { KnowledgeGraph } from './knowledgeGraph';
import type { EvolutionData, EvolutionNode, EvolutionStage, MemoryRoom } from './mapTypes';
import { FEYNMAN_MODULE, UNKNOWN_MODULE } from './mapData';

/** 枯萎阈值：超过此天数未复习 → 枯萎预警 */
export const WILT_DAYS = 30;

/** 结果阶段阈值：牢固且最近复习天数不超过此值 */
export const FRUIT_RECENT_DAYS = 7;

/** 每房间记忆项上限（房间过大时按掌握度降序截断） */
const ROOM_ITEMS_MAX = 8;

/** 卡片节点 → 来源模块（费曼薄弱点归入合成模块） */
function moduleOf(nodeId: string, sourceRefs: Map<string, string>): string {
  if (nodeId.startsWith('feynman:')) return FEYNMAN_MODULE;
  const cardId = nodeId.slice('card:'.length);
  return sourceRefs.get(cardId) ?? UNKNOWN_MODULE;
}

/** 节点最后复习时间（卡片经 cardId 匹配复习记录） */
function lastReviewAt(
  nodeId: string,
  reviews: Array<{ cardId: string; reviewedAt: Date | string }>,
): Date | null {
  if (!nodeId.startsWith('card:')) return null;
  const cardId = nodeId.slice('card:'.length);
  let latest: Date | null = null;
  for (const r of reviews) {
    if (r.cardId !== cardId) continue;
    const t = r.reviewedAt instanceof Date ? r.reviewedAt : new Date(r.reviewedAt);
    if (!Number.isNaN(t.getTime()) && (!latest || t > latest)) latest = t;
  }
  return latest;
}

/**
 * 阶段判定：种子（未复习）→ 萌芽（朦胧已复习）→ 成长（成长中）→
 * 开花（牢固）→ 结果（牢固且最近一周复习）
 */
export function stageOf(mastery: number, reviewed: boolean, lastReviewAgeDays: number): EvolutionStage {
  if (!reviewed) return 'seed';
  if (mastery < 0.6) return 'sprout';
  if (mastery < 1.0) return 'growing';
  return lastReviewAgeDays <= FRUIT_RECENT_DAYS ? 'fruit' : 'bloom';
}

/** 卡片 id → 最后复习时间（供 wilt 判定） */
interface ReviewIndex {
  has: (nodeId: string) => boolean;
  last: (nodeId: string) => Date | null;
}

/**
 * 派生进化树数据 / Derive evolution tree data
 * @param graph - 派生知识图谱
 * @param reviews - 原始复习记录（FlashcardReview 形状的子集）
 * @param sourceRefs - 卡片 id → 溯源字符串
 * @param now - 当前时间戳（默认 Date.now()，测试可注入）
 */
export function deriveEvolutionData(
  graph: KnowledgeGraph,
  reviews: Array<{ cardId: string; reviewedAt: Date | string }> = [],
  // 兼容历史调用签名：本函数不使用 sourceRefs（映射在 buildEvolutionData 中消费），
  // 下划线前缀避免 noUnusedParameters 报错，保持公共 API 不变
  _sourceRefs: Map<string, string> = new Map(),
  now: number = Date.now(),
): EvolutionData {
  if (graph.coldStart || graph.nodes.length === 0) {
    return { nodes: [], grafts: [] };
  }

  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  // 1. 节点：stage / wilted / lastReviewedAt / parentId
  const reviewIndex: ReviewIndex = {
    has: (nodeId) =>
      nodeId.startsWith('card:') &&
      reviews.some((r) => r.cardId === nodeId.slice('card:'.length)),
    last: (nodeId) => lastReviewAt(nodeId, reviews),
  };

  const nodes: EvolutionNode[] = graph.nodes.map((n) => {
    const last = reviewIndex.last(n.id);
    const ageDays = last ? Math.max(0, (now - last.getTime()) / 86_400_000) : Infinity;
    return {
      id: n.id,
      title: n.concept,
      mastery: n.glow,
      parentId: null,
      lastReviewedAt: last,
      stage: stageOf(n.glow, reviewIndex.has(n.id), ageDays),
      // 枯萎预警：只对已开始生长（复习过）的节点生效，种子刚种下不算枯萎
      wilted: reviewIndex.has(n.id) && ageDays > WILT_DAYS,
    };
  });

  // 2. parentId：先到先得 + ancestor 破环（shared-note 完全图会产生环）
  const parentOf = new Map<string, string>();
  const isAncestor = (candidate: string, nodeId: string): boolean => {
    let cur = candidate;
    const guard = new Set<string>();
    while (cur) {
      if (cur === nodeId) return true; // candidate 是 nodeId 的后代 → 环
      if (guard.has(cur)) return false;
      guard.add(cur);
      cur = parentOf.get(cur) ?? '';
    }
    return false;
  };
  for (const link of graph.links) {
    if (parentOf.has(link.target)) continue; // 先到先得
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) continue;
    if (isAncestor(link.source, link.target)) continue; // 破环
    parentOf.set(link.target, link.source);
  }
  for (const node of nodes) node.parentId = parentOf.get(node.id) ?? null;

  // 3. grafts：非父子关系的跨分支链（去重；父子的反向边不算嫁接）
  const graftSeen = new Set<string>();
  const grafts: Array<{ from: string; to: string }> = [];
  for (const link of graph.links) {
    if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) continue;
    const isParentEdge =
      parentOf.get(link.target) === link.source || parentOf.get(link.source) === link.target;
    if (isParentEdge) continue;
    const key = [link.source, link.target].sort().join('|');
    if (graftSeen.has(key)) continue;
    graftSeen.add(key);
    grafts.push({ from: link.source, to: link.target });
  }

  return { nodes, grafts };
}

/** 复习提示文案（hint 不剧透答案） / Review hint copy */
function hintOf(last: Date | null, hasReviewed: boolean, now: number): string {
  if (!hasReviewed || !last) return '尚未复习过，先回忆再翻卡';
  const days = Math.max(0, Math.round((now - last.getTime()) / 86_400_000));
  return days === 0 ? '今天复习过，趁热回忆' : `${days} 天前复习过，回忆后翻卡确认`;
}

/**
 * 派生记忆宫殿房间 / Derive memory palace rooms
 * 房间 = 来源模块；记忆项 = 概念 + 复习提示（每房间按掌握度降序截断）
 * @param now - 当前时间戳（默认 Date.now()，测试可注入）
 */
export function deriveMemoryRooms(
  graph: KnowledgeGraph,
  reviews: Array<{ cardId: string; reviewedAt: Date | string }> = [],
  sourceRefs: Map<string, string> = new Map(),
  now: number = Date.now(),
): MemoryRoom[] {
  if (graph.coldStart || graph.nodes.length === 0) return [];

  const byModule = new Map<string, MemoryRoom>();
  // 携带掌握度的临时项，用于排序后截断（MemoryItem 不暴露掌握度）
  const pending = new Map<string, Array<{ concept: string; hint: string; mastery: number }>>();
  for (const node of graph.nodes) {
    const module = moduleOf(node.id, sourceRefs);
    let room = byModule.get(module);
    if (!room) {
      room = { id: `room:${module}`, name: module, items: [] };
      byModule.set(module, room);
    }
    const last = lastReviewAt(node.id, reviews);
    const list = pending.get(module) ?? [];
    list.push({
      concept: node.concept,
      hint: hintOf(last, last !== null, now),
      mastery: node.glow,
    });
    pending.set(module, list);
  }

  // 每房间按掌握度降序截断（房间过大时只留最值得复习的）
  const rooms = [...byModule.values()];
  for (const room of rooms) {
    const list = pending.get(room.name) ?? [];
    list.sort((a, b) => b.mastery - a.mastery || a.concept.localeCompare(b.concept));
    room.items = list.slice(0, ROOM_ITEMS_MAX).map(({ concept, hint }) => ({ concept, hint }));
  }
  return rooms;
}

