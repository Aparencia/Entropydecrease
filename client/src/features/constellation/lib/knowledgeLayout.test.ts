/**
 * knowledgeLayout 单元测试 / Unit tests for the layout layer
 *
 * @ai-context: 覆盖阶段 B 验收的 DOM 轨约束——L1 每档 ≤15 节点、
 * 三档同心环不重叠、坐标确定性、悬空链过滤、冷启动空态。
 * BDD AAA 模式（Arrange/Act/Assert）。
 * @ai-context: Covers L1 per-tier caps, ring determinism, dangling-link
 * filtering, and cold-start empty layout.
 */
import { describe, it, expect } from 'vitest';
import { buildKnowledgeGraph, type GraphInput } from './knowledgeGraph';
import { layoutKnowledgeGraph, MAX_PER_TIER } from './knowledgeLayout';

// ─── 测试工厂 ───────────────────────────────────────────────

function makeInput(overrides: Partial<GraphInput> = {}): GraphInput {
  return {
    cards: [],
    feynman: [],
    reviews: [],
    ...overrides,
  };
}

function card(partial: Partial<GraphInput['cards'][number]> = {}): GraphInput['cards'][number] {
  return {
    id: 'c1',
    front: '概念',
    easeFactor: 2.5,
    interval: 20,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...partial,
  };
}

function graphOf(input: GraphInput) {
  return buildKnowledgeGraph(input);
}

// ─── 空态与截断 ─────────────────────────────────────────────

describe('layoutKnowledgeGraph', () => {
  it('冷启动图谱应返回空布局', () => {
    // Arrange
    const graph = graphOf(makeInput());

    // Act
    const layout = layoutKnowledgeGraph(graph);

    // Assert
    expect(layout.nodes).toEqual([]);
    expect(layout.links).toEqual([]);
  });

  it('每档节点数应被截断到 L1 上限（≤15）', () => {
    // Arrange：一档 20 个牢固卡
    const input = makeInput({
      cards: Array.from({ length: 20 }, (_, i) => card({ id: `s${i}` })),
    });

    // Act
    const layout = layoutKnowledgeGraph(graphOf(input));

    // Assert
    expect(layout.nodes).toHaveLength(MAX_PER_TIER);
  });

  it('三档并存时总数 ≤ 3×L1 且各档独立截断', () => {
    // Arrange：牢固 20 + 成长中 20 + 朦胧 20
    const input = makeInput({
      cards: [
        ...Array.from({ length: 20 }, (_, i) => card({ id: `solid${i}`, easeFactor: 2.5, interval: 30 })),
        ...Array.from({ length: 20 }, (_, i) => card({ id: `grow${i}`, easeFactor: 2.1, interval: 1 })),
        ...Array.from({ length: 20 }, (_, i) => card({ id: `hazy${i}`, easeFactor: 1.5, interval: 0 })),
      ],
    });

    // Act
    const layout = layoutKnowledgeGraph(graphOf(input));

    // Assert
    expect(layout.nodes).toHaveLength(MAX_PER_TIER * 3);
    const byTier = { 牢固: 0, 成长中: 0, 朦胧: 0 } as Record<string, number>;
    for (const n of layout.nodes) byTier[n.tier]++;
    expect(byTier).toEqual({ 牢固: MAX_PER_TIER, 成长中: MAX_PER_TIER, 朦胧: MAX_PER_TIER });
  });

  // ─── 坐标确定性 ─────────────────────────────────────────

  it('同一输入两次布局坐标完全一致（确定性）', () => {
    // Arrange
    const input = makeInput({
      cards: [
        card({ id: 'a', front: '甲', easeFactor: 2.5, interval: 30 }),
        card({ id: 'b', front: '乙', easeFactor: 2.1, interval: 1 }),
        card({ id: 'c', front: '丙', easeFactor: 1.5, interval: 0 }),
      ],
    });

    // Act
    const first = layoutKnowledgeGraph(graphOf(input));
    const second = layoutKnowledgeGraph(graphOf(input));

    // Assert
    expect(first.nodes).toEqual(second.nodes);
  });

  it('坐标应落在 0-100 百分比范围内', () => {
    // Arrange
    const input = makeInput({
      cards: Array.from({ length: 30 }, (_, i) => card({ id: `p${i}` })),
    });

    // Act
    const layout = layoutKnowledgeGraph(graphOf(input));

    // Assert
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(100);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(100);
    }
  });

  it('三档同心环不应重叠（牢固半径 < 成长中 < 朦胧）', () => {
    // Arrange：三档各若干节点
    const input = makeInput({
      cards: [
        card({ id: 'a', easeFactor: 2.5, interval: 30 }),
        card({ id: 'b', easeFactor: 2.1, interval: 1 }),
        card({ id: 'c', easeFactor: 1.5, interval: 0 }),
      ],
    });

    // Act
    const layout = layoutKnowledgeGraph(graphOf(input));

    // Assert：按 id 取半径（圆心 50,50）
    const radiusOf = (id: string) => {
      const n = layout.nodes.find((x) => x.id === id)!;
      return Math.hypot(n.x - 50, n.y - 50);
    };
    expect(radiusOf('card:a')).toBeLessThan(radiusOf('card:b'));
    expect(radiusOf('card:b')).toBeLessThan(radiusOf('card:c'));
  });

  // ─── 悬空链过滤 ─────────────────────────────────────────

  it('截断后两端不可见的链应被过滤（无悬空线）', () => {
    // Arrange：20 张牢固卡同源（链全在组内），再加 1 张孤卡连费曼薄弱点
    const input = makeInput({
      cards: [
        ...Array.from({ length: 20 }, (_, i) => card({ id: `s${i}`, sourceRef: 'same.pdf' })),
        card({ id: 'orphan', front: '孤独概念', sourceRef: 'other.pdf' }),
      ],
      feynman: [{ id: 'f1', concept: '孤独概念', status: 'in_progress' }],
    });

    // Act
    const layout = layoutKnowledgeGraph(graphOf(input));

    // Assert：孤儿卡被截断后，其 weakpoint 链不应出现
    expect(layout.nodes.some((n) => n.id === 'card:orphan')).toBe(false);
    expect(layout.links.some((l) => l.kind === 'weakpoint')).toBe(false);
    // 同源链只连接可见节点
    for (const l of layout.links) {
      const ids = new Set(layout.nodes.map((n) => n.id));
      expect(ids.has(l.source)).toBe(true);
      expect(ids.has(l.target)).toBe(true);
    }
  });
});
