/**
 * knowledgeGraph 单元测试 / Unit tests for the knowledge graph layer
 *
 * @ai-context: 覆盖阶段 B 验收——tier 边界值（牢固/成长中/朦胧）、
 * weakpoint 薄弱点链、shared-note 同源链、review-chain 复习先后链、
 * 冷启动、链去重与超量防爆。BDD AAA 模式（Arrange/Act/Assert）。
 * @ai-context: Covers tier boundaries, the three link kinds, cold start,
 * dedupe, and link-count guards.
 */
import { describe, it, expect } from 'vitest';
import { buildKnowledgeGraph, hazeTier, type GraphInput } from './knowledgeGraph';

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
    front: '费曼技巧',
    easeFactor: 2.5,
    interval: 20,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...partial,
  };
}

// ─── tier 口径 ──────────────────────────────────────────────

describe('hazeTier（口径对齐 memoryQueries.hazeTier）', () => {
  it('easeFactor≥2.4 且 interval≥14 → 牢固', () => {
    // Arrange & Act & Assert
    expect(hazeTier(2.4, 14)).toBe('牢固');
    expect(hazeTier(2.5, 20)).toBe('牢固');
  });

  it('easeFactor≥2.4 但 interval<14 → 成长中', () => {
    // Arrange & Act & Assert
    expect(hazeTier(2.4, 13)).toBe('成长中');
  });

  it('easeFactor≥2.0 或 interval≥3 → 成长中', () => {
    // Arrange & Act & Assert
    expect(hazeTier(2.0, 2)).toBe('成长中');
    expect(hazeTier(1.9, 3)).toBe('成长中');
  });

  it('easeFactor<2.0 且 interval<3 → 朦胧', () => {
    // Arrange & Act & Assert
    expect(hazeTier(1.9, 2)).toBe('朦胧');
    expect(hazeTier(1.5, 0)).toBe('朦胧');
  });
});

// ─── 冷启动 ─────────────────────────────────────────────────

describe('buildKnowledgeGraph', () => {
  it('空输入应返回 coldStart:true 且无节点无链', () => {
    // Arrange
    const input = makeInput();

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.coldStart).toBe(true);
    expect(graph.nodes).toEqual([]);
    expect(graph.links).toEqual([]);
  });

  it('有卡片但无费曼/复习 → coldStart:false', () => {
    // Arrange
    const input = makeInput({ cards: [card()] });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.coldStart).toBe(false);
    expect(graph.nodes).toHaveLength(1);
  });

  // ─── 节点与 glow 映射 ────────────────────────────────────

  it('卡片节点 tier 与 glow 按宪法映射表输出，朦胧节点带 dimmed', () => {
    // Arrange：三档卡片
    const input = makeInput({
      cards: [
        card({ id: 'solid', front: '牢固概念', easeFactor: 2.5, interval: 30 }),
        card({ id: 'growing', front: '成长概念', easeFactor: 2.1, interval: 1 }),
        card({ id: 'hazy', front: '朦胧概念', easeFactor: 1.8, interval: 0 }),
      ],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.nodes).toEqual([
      expect.objectContaining({ id: 'card:solid', tier: '牢固', glow: 1.0, dimmed: false }),
      expect.objectContaining({ id: 'card:growing', tier: '成长中', glow: 0.72, dimmed: false }),
      expect.objectContaining({ id: 'card:hazy', tier: '朦胧', glow: 0.45, dimmed: true }),
    ]);
  });

  it('卡片正面应剥离 HTML 并截断到 40 字', () => {
    // Arrange
    const long = '<p>这是<b>一段</b>非常长的概念名称，用来验证截断逻辑是否生效的边界测试文本</p>';
    const input = makeInput({ cards: [card({ front: long })] });

    // Act
    const [node] = buildKnowledgeGraph(input).nodes;

    // Assert
    expect(node.concept).not.toContain('<');
    expect(node.concept.length).toBeLessThanOrEqual(40);
  });

  // ─── weakpoint 链 ─────────────────────────────────────────

  it('in_progress 费曼应生成朦胧薄弱点节点，并与同名卡片连 weakpoint 链', () => {
    // Arrange
    const input = makeInput({
      cards: [card({ id: 'c-feynman', front: '费曼技巧' })],
      feynman: [{ id: 'f1', concept: '费曼技巧', status: 'in_progress' }],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert：薄弱点节点存在且朦胧
    const weakNode = graph.nodes.find((n) => n.id === 'feynman:f1');
    expect(weakNode).toMatchObject({ concept: '费曼技巧', tier: '朦胧', dimmed: true });
    // weakpoint 链：薄弱点 → 卡片
    expect(graph.links).toContainEqual({ source: 'feynman:f1', target: 'card:c-feynman', kind: 'weakpoint' });
  });

  it('completed 费曼不应产生薄弱点节点', () => {
    // Arrange
    const input = makeInput({
      feynman: [{ id: 'f1', concept: '已掌握', status: 'completed' }],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.nodes.find((n) => n.id === 'feynman:f1')).toBeUndefined();
  });

  it('费曼无同名卡片时不应产生孤儿 weakpoint 链', () => {
    // Arrange
    const input = makeInput({
      cards: [card({ id: 'c-other', front: '完全不同的概念' })],
      feynman: [{ id: 'f1', concept: '无卡概念', status: 'in_progress' }],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert：节点照常生成，但无链
    expect(graph.nodes).toHaveLength(2);
    expect(graph.links.filter((l) => l.kind === 'weakpoint')).toHaveLength(0);
  });

  // ─── shared-note 链 ───────────────────────────────────────

  it('同 source_ref 的两张卡应连 1 条 shared-note 链', () => {
    // Arrange
    const input = makeInput({
      cards: [
        card({ id: 'a', sourceRef: 'pdf1.pdf' }),
        card({ id: 'b', sourceRef: 'pdf1.pdf' }),
      ],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.links).toEqual([
      { source: 'card:a', target: 'card:b', kind: 'shared-note' },
    ]);
  });

  it('不同 source_ref 或空 source_ref 不应连链', () => {
    // Arrange
    const input = makeInput({
      cards: [
        card({ id: 'a', sourceRef: 'pdf1.pdf' }),
        card({ id: 'b', sourceRef: 'pdf2.pdf' }),
        card({ id: 'c', sourceRef: undefined }),
      ],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.links.filter((l) => l.kind === 'shared-note')).toHaveLength(0);
  });

  it('同源 ≤6 张完全图互连，超过 6 张退化为链式防止连线爆炸', () => {
    // Arrange：6 张 → C(6,2)=15 条；7 张 → 链式 6 条
    const small = makeInput({
      cards: Array.from({ length: 6 }, (_, i) => card({ id: `s${i}`, sourceRef: 'same.pdf' })),
    });
    const large = makeInput({
      cards: Array.from({ length: 7 }, (_, i) => card({ id: `l${i}`, sourceRef: 'same.pdf' })),
    });

    // Act
    const smallLinks = buildKnowledgeGraph(small).links.filter((l) => l.kind === 'shared-note');
    const largeLinks = buildKnowledgeGraph(large).links.filter((l) => l.kind === 'shared-note');

    // Assert
    expect(smallLinks).toHaveLength(15);
    expect(largeLinks).toHaveLength(6);
  });

  // ─── review-chain 链 ──────────────────────────────────────

  it('复习先后相邻的不同卡片应连 review-chain 链', () => {
    // Arrange：t1 复习 a，t2 复习 b → 一条链
    const input = makeInput({
      cards: [card({ id: 'a' }), card({ id: 'b' })],
      reviews: [
        { cardId: 'a', reviewedAt: new Date('2026-08-01T10:00:00Z') },
        { cardId: 'b', reviewedAt: new Date('2026-08-01T10:05:00Z') },
      ],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.links).toContainEqual({ source: 'card:a', target: 'card:b', kind: 'review-chain' });
  });

  it('同一卡连续复习不应连自环链', () => {
    // Arrange
    const input = makeInput({
      cards: [card({ id: 'a' })],
      reviews: [
        { cardId: 'a', reviewedAt: new Date('2026-08-01T10:00:00Z') },
        { cardId: 'a', reviewedAt: new Date('2026-08-01T10:05:00Z') },
      ],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.links.filter((l) => l.kind === 'review-chain')).toHaveLength(0);
  });

  it('已删除卡片的复习记录应被跳过而非产生悬空链', () => {
    // Arrange：b 卡片已删除，a→b 与 b→c 的链都应跳过
    const input = makeInput({
      cards: [card({ id: 'a' }), card({ id: 'c' })],
      reviews: [
        { cardId: 'a', reviewedAt: new Date('2026-08-01T10:00:00Z') },
        { cardId: 'b', reviewedAt: new Date('2026-08-01T10:05:00Z') },
        { cardId: 'c', reviewedAt: new Date('2026-08-01T10:10:00Z') },
      ],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert：只留下 a→c 一条有效链
    expect(graph.links.filter((l) => l.kind === 'review-chain')).toEqual([
      { source: 'card:a', target: 'card:c', kind: 'review-chain' },
    ]);
  });

  it('复习记录支持 ISO 字符串时间', () => {
    // Arrange
    const input = makeInput({
      cards: [card({ id: 'a' }), card({ id: 'b' })],
      reviews: [
        { cardId: 'a', reviewedAt: '2026-08-01T10:00:00Z' },
        { cardId: 'b', reviewedAt: '2026-08-01T10:05:00Z' },
      ],
    });

    // Act
    const graph = buildKnowledgeGraph(input);

    // Assert
    expect(graph.links.filter((l) => l.kind === 'review-chain')).toHaveLength(1);
  });
});
