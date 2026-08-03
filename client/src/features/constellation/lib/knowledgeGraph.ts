/**
 * 知识星座 · 概念图谱派生纯函数层
 * Knowledge constellation · graph derivation layer (pure)
 *
 * @ai-context: 阶段 B（深度问题）原子层。输入闪卡/费曼/复习三路数据，
 * 派生知识图谱：节点（卡片概念 + 费曼薄弱点）与三种链（薄弱点→卡片、
 * 同 source_ref 溯源链、复习先后链）。tier 口径与主进程
 * electron/mcp/memoryQueries.ts 的 hazeTier 完全一致（单一数据口径，
 * 渲染/主进程两侧同规则）；glow 按《熵可视化设计宪法》第一条映射表
 * （概念掌握度→发光体亮度：牢固=清冽明亮、薄弱=朦胧），朦胧节点以
 * dimmed 标记，渲染层施加 ≤40% 雾色滤镜（第二条 §1：雾永远可拨开）。
 * 纯函数、无副作用，可安全单元测试与并发调用。
 *
 * @ai-context: Pure derivation of the knowledge graph from flashcards,
 * feynman notes and review history. tier matches memoryQueries.hazeTier;
 * glow follows the design constitution's mapping table (solid=bright,
 * hazy=dimmed ≤40% visual strength).
 */
import type { Flashcard, FlashcardReview } from '@/types/flashcard';
import type { FeynmanNote } from '@/types/feynman';

// ─── 类型定义 ───────────────────────────────────────────────

/** 知识档位（口径对齐 memoryQueries.hazeTier） / Knowledge tier */
export type KnowledgeTier = '牢固' | '成长中' | '朦胧';

/** 知识图谱节点 / Graph node */
export interface KnowledgeNode {
  id: string;
  /** 概念名（卡片正面/费曼概念，HTML 剥离后截断） / Concept label */
  concept: string;
  tier: KnowledgeTier;
  /** 亮度乘数 0-1（宪法映射：牢固=1.0 清冽明亮） / Glow multiplier */
  glow: number;
  /** 朦胧节点标记（渲染层施加 ≤40% 雾色滤镜） / Haze node flag */
  dimmed: boolean;
}

/** 链类型：费曼薄弱点→卡片 / 同源溯源 / 复习先后 */
export type KnowledgeLinkKind = 'weakpoint' | 'shared-note' | 'review-chain';

/** 知识图谱链（source/target 均为节点 id） / Graph link */
export interface KnowledgeLink {
  source: string;
  target: string;
  kind: KnowledgeLinkKind;
}

/** 派生输入：三路数据的最小接口 / Minimal graph inputs */
export interface GraphInput {
  cards: Array<Pick<Flashcard, 'id' | 'front' | 'easeFactor' | 'interval' | 'sourceRef'> & {
    /** 创建时间（兼容 Date 与 ISO 字符串，toTime 统一为毫秒） */
    createdAt: Date | string;
  }>;
  feynman: Array<Pick<FeynmanNote, 'id' | 'concept' | 'status'>>;
  reviews: Array<Pick<FlashcardReview, 'cardId'> & {
    /** 复习时间（兼容 Date 与 ISO 字符串） */
    reviewedAt: Date | string;
  }>;
}

/** 图谱输出：节点 + 链 + 冷启动标记 / Graph output */
export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  links: KnowledgeLink[];
  /** 冷启动：无任何卡片/费曼数据 → 世界未点亮（宪法第七条） */
  coldStart: boolean;
}

// ─── 常量与口径 ─────────────────────────────────────────────

/** 概念名截断长度 / Concept label cap */
const CONCEPT_MAX = 40;

/** tier → 亮度乘数（宪法第一条：牢固=清冽明亮，薄弱=朦胧） */
const TIER_GLOW: Record<KnowledgeTier, number> = {
  牢固: 1.0,
  成长中: 0.72,
  朦胧: 0.45,
};

/** 同源卡片超过此数时退化为链式连接，避免 O(n²) 连线爆炸 */
const SHARED_SOURCE_FULL_GRAPH_MAX = 6;

/** review-chain 只取最近 N 条复习记录参与连链 */
const REVIEW_CHAIN_WINDOW = 100;

// ─── 纯函数 ─────────────────────────────────────────────────

/** 时间统一为毫秒（兼容 Date 与 ISO 字符串） / Normalize to epoch ms */
function toTime(v: Date | string): number {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** 剥离 HTML 标签并截断 / Strip HTML tags and cap length */
function cleanLabel(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, CONCEPT_MAX);
}

/** 概念名规范化（weakpoint 同名匹配用） / Normalize for name matching */
function normalizeConcept(s: string): string {
  return s.replace(/<[^>]*>/g, '').trim().toLowerCase();
}

/**
 * 朦胧度档位——口径与主进程 memoryQueries.hazeTier 完全一致
 * (FSRS easeFactor + interval 双因子；只给档位不给倒计时，焦虑防线 §2)
 */
export function hazeTier(easeFactor: number, intervalDays: number): KnowledgeTier {
  if (easeFactor >= 2.4 && intervalDays >= 14) return '牢固';
  if (easeFactor >= 2.0 || intervalDays >= 3) return '成长中';
  return '朦胧';
}

/** 卡 → 节点 / Card to node */
function cardToNode(card: GraphInput['cards'][number]): KnowledgeNode {
  const tier = hazeTier(card.easeFactor, card.interval);
  return {
    id: `card:${card.id}`,
    concept: cleanLabel(card.front),
    tier,
    glow: TIER_GLOW[tier],
    dimmed: tier === '朦胧',
  };
}

/** 费曼薄弱点 → 节点（仅 in_progress：过程态才存在薄弱点） */
function feynmanToNode(f: GraphInput['feynman'][number]): KnowledgeNode {
  return {
    id: `feynman:${f.id}`,
    concept: f.concept.trim().slice(0, CONCEPT_MAX),
    tier: '朦胧',
    glow: TIER_GLOW['朦胧'],
    dimmed: true,
  };
}

/** 链去重（同一 source/target/kind 只保留一条） / Dedupe links */
function pushUnique(links: KnowledgeLink[], link: KnowledgeLink): void {
  if (link.source === link.target) return;
  const dup = links.some(
    (l) => l.source === link.source && l.target === link.target && l.kind === link.kind,
  );
  if (!dup) links.push(link);
}

/**
 * 派生知识图谱 / Derive the knowledge graph
 *
 * @ai-context 三种链：
 * 1) weakpoint：in_progress 费曼的薄弱点 → 同名概念卡（规范化匹配，
 *    无同名卡则不强连，避免孤儿链）；
 * 2) shared-note：同 source_ref 溯源卡互连（≤6 张完全图，超出退化
 *    为按创建时间链式连接，守住连线预算）；
 * 3) review-chain：最近 REVIEW_CHAIN_WINDOW 条复习按时间升序，
 *    依次连链——上一张有效卡与当前卡若不同则连链；已删除卡片
 *    被跳过，不阻断后续卡片的关联（复习先后形成的关联）。
 * 所有链的 source/target 均以节点 id 为锚，节点不存在的链被跳过。
 */
export function buildKnowledgeGraph(input: GraphInput): KnowledgeGraph {
  if (input.cards.length === 0 && input.feynman.length === 0) {
    return { nodes: [], links: [], coldStart: true };
  }

  const nodes: KnowledgeNode[] = [];
  const links: KnowledgeLink[] = [];

  // ── 节点：卡片 + in_progress 费曼薄弱点 ──
  const cardNodes = input.cards.map(cardToNode);
  nodes.push(...cardNodes);

  const feynmanNodes = input.feynman
    .filter((f) => f.status === 'in_progress')
    .map(feynmanToNode);
  nodes.push(...feynmanNodes);

  // ── weakpoint 链：薄弱点 → 同名概念卡 ──
  if (feynmanNodes.length > 0 && cardNodes.length > 0) {
    // 卡片按规范化概念名索引（同名多卡 → 全连）
    const byConcept = new Map<string, KnowledgeNode[]>();
    for (const node of cardNodes) {
      const key = normalizeConcept(node.concept);
      const list = byConcept.get(key) ?? [];
      list.push(node);
      byConcept.set(key, list);
    }
    for (const fn of feynmanNodes) {
      const targets = byConcept.get(normalizeConcept(fn.concept));
      if (!targets) continue;
      for (const t of targets) pushUnique(links, { source: fn.id, target: t.id, kind: 'weakpoint' });
    }
  }

  // ── shared-note 链：同 source_ref 溯源互连 ──
  const bySource = new Map<string, KnowledgeNode[]>();
  for (let i = 0; i < input.cards.length; i++) {
    const ref = input.cards[i].sourceRef?.trim();
    if (!ref) continue;
    const list = bySource.get(ref) ?? [];
    list.push(cardNodes[i]);
    bySource.set(ref, list);
  }
  for (const group of bySource.values()) {
    if (group.length < 2) continue;
    // 按创建时间排序，保证链式连接的确定性
    const byTime = (a: KnowledgeNode, b: KnowledgeNode): number => {
      const ia = input.cards.findIndex((c) => `card:${c.id}` === a.id);
      const ib = input.cards.findIndex((c) => `card:${c.id}` === b.id);
      return toTime(input.cards[ia]?.createdAt ?? '') - toTime(input.cards[ib]?.createdAt ?? '');
    };
    group.sort(byTime);
    if (group.length <= SHARED_SOURCE_FULL_GRAPH_MAX) {
      // 完全图：两两互连（小规模，连线预算内）
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          pushUnique(links, { source: group[i].id, target: group[j].id, kind: 'shared-note' });
        }
      }
    } else {
      // 链式：相邻连接，防止 O(n²) 连线爆炸
      for (let i = 0; i < group.length - 1; i++) {
        pushUnique(links, { source: group[i].id, target: group[i + 1].id, kind: 'shared-note' });
      }
    }
  }

  // ── review-chain 链：复习先后相邻卡互连 ──
  if (input.reviews.length > 1 && cardNodes.length > 0) {
    const nodeById = new Map(cardNodes.map((n) => [n.id, n]));
    const recent = [...input.reviews]
      .sort((a, b) => toTime(a.reviewedAt) - toTime(b.reviewedAt))
      .slice(-REVIEW_CHAIN_WINDOW);
    let prev: KnowledgeNode | undefined;
    for (const r of recent) {
      const node = nodeById.get(`card:${r.cardId}`);
      if (!node) continue; // 卡片已删除 → 跳过，不阻断后续
      if (prev && prev.id !== node.id) {
        pushUnique(links, { source: prev.id, target: node.id, kind: 'review-chain' });
      }
      prev = node;
    }
  }

  return { nodes, links, coldStart: false };
}
