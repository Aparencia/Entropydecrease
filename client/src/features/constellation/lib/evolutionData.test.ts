/**
 * evolutionData 单元测试 / Unit tests for the evolution tree derivation layer
 *
 * @ai-context: 覆盖 4.10 验收——五阶段判定（种子→萌芽→成长→开花→结果）、
 * parentId 先到先得与破环、grafts 跨分支嫁接、枯萎预警（长期未复习）、
 * 记忆宫殿房间分组与提示文案。BDD AAA 模式（Arrange/Act/Assert）。
 */
import { describe, it, expect } from 'vitest';
import { deriveEvolutionData, deriveMemoryRooms, stageOf, WILT_DAYS } from './evolutionData';
import type { KnowledgeGraph } from './knowledgeGraph';

// ─── 测试工厂 ───────────────────────────────────────────────

const DAY_MS = 86_400_000;
const NOW = new Date('2026-08-05T00:00:00Z').getTime();

function makeGraph(overrides: Partial<KnowledgeGraph> = {}): KnowledgeGraph {
  return {
    nodes: [
      { id: 'card:a', concept: '费曼技巧', tier: '牢固', glow: 1.0, dimmed: false },
      { id: 'card:b', concept: '记忆曲线', tier: '成长中', glow: 0.72, dimmed: false },
      { id: 'card:c', concept: '间隔重复', tier: '朦胧', glow: 0.45, dimmed: true },
      { id: 'feynman:f1', concept: '薄弱点', tier: '朦胧', glow: 0.45, dimmed: true },
    ],
    links: [
      { source: 'feynman:f1', target: 'card:a', kind: 'weakpoint' },
      { source: 'card:a', target: 'card:b', kind: 'review-chain' },
      { source: 'card:b', target: 'card:c', kind: 'shared-note' },
    ],
    coldStart: false,
    ...overrides,
  };
}

function review(cardId: string, daysAgo: number) {
  return { cardId, reviewedAt: new Date(NOW - daysAgo * DAY_MS) };
}

// ─── 阶段判定 ───────────────────────────────────────────────

describe('stageOf（五阶段生命周期）', () => {
  it('未复习 → 种子', () => {
    expect(stageOf(1.0, false, 0)).toBe('seed');
  });
  it('朦胧已复习 → 萌芽', () => {
    expect(stageOf(0.45, true, 10)).toBe('sprout');
  });
  it('成长中 → 成长', () => {
    expect(stageOf(0.72, true, 10)).toBe('growing');
  });
  it('牢固且一周内复习 → 结果', () => {
    expect(stageOf(1.0, true, 3)).toBe('fruit');
  });
  it('牢固但超过一周未复习 → 开花', () => {
    expect(stageOf(1.0, true, 20)).toBe('bloom');
  });
});

// ─── 树形派生 ───────────────────────────────────────────────

describe('deriveEvolutionData（树形与嫁接）', () => {
  it('parentId 先到先得：链 source 成为 target 的父节点', () => {
    // Arrange & Act
    const data = deriveEvolutionData(makeGraph(), [], new Map(), NOW);
    // Assert
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    expect(byId.get('card:a')!.parentId).toBe('feynman:f1');
    expect(byId.get('card:b')!.parentId).toBe('card:a');
    expect(byId.get('card:c')!.parentId).toBe('card:b');
  });

  it('shared-note 完全图成环时破环（不产生循环父子）', () => {
    // Arrange：三角环 a↔b↔c↔a（无向完全图）
    const graph = makeGraph({
      nodes: [
        { id: 'card:a', concept: 'A', tier: '牢固', glow: 1.0, dimmed: false },
        { id: 'card:b', concept: 'B', tier: '牢固', glow: 1.0, dimmed: false },
        { id: 'card:c', concept: 'C', tier: '牢固', glow: 1.0, dimmed: false },
      ],
      links: [
        { source: 'card:a', target: 'card:b', kind: 'shared-note' },
        { source: 'card:a', target: 'card:c', kind: 'shared-note' },
        { source: 'card:b', target: 'card:c', kind: 'shared-note' },
      ],
    });
    // Act
    const data = deriveEvolutionData(graph, [], new Map(), NOW);
    // Assert：沿 parent 链走一遍不回头（无环）
    const byId = new Map(data.nodes.map((n) => [n.id, n]));
    for (const node of data.nodes) {
      const seen = new Set<string>();
      let cur: string | null = node.id;
      while (cur) {
        expect(seen.has(cur)).toBe(false);
        seen.add(cur);
        cur = byId.get(cur)!.parentId;
      }
    }
  });

  it('grafts：非父子关系的链成为嫁接边', () => {
    // Arrange：card:b → card:c 是父子边；card:a → card:c 是跨分支
    const graph = makeGraph({
      links: [
        { source: 'card:a', target: 'card:b', kind: 'shared-note' },
        { source: 'card:b', target: 'card:c', kind: 'shared-note' },
        { source: 'card:a', target: 'card:c', kind: 'review-chain' },
      ],
    });
    // Act
    const data = deriveEvolutionData(graph, [], new Map(), NOW);
    // Assert
    expect(data.grafts).toContainEqual({ from: 'card:a', to: 'card:c' });
  });
});

// ─── 枯萎预警 ───────────────────────────────────────────────

describe('deriveEvolutionData（枯萎预警）', () => {
  it(`超过 ${WILT_DAYS} 天未复习 → wilted`, () => {
    // Arrange & Act
    const data = deriveEvolutionData(
      makeGraph(),
      [review('a', WILT_DAYS + 1)],
      new Map(),
      NOW,
    );
    // Assert
    expect(data.nodes.find((n) => n.id === 'card:a')!.wilted).toBe(true);
  });

  it('近期复习过 → 不枯萎；种子（未复习）也不枯萎', () => {
    // Arrange & Act
    const data = deriveEvolutionData(makeGraph(), [review('a', 3)], new Map(), NOW);
    // Assert
    expect(data.nodes.find((n) => n.id === 'card:a')!.wilted).toBe(false);
    expect(data.nodes.find((n) => n.id === 'card:c')!.wilted).toBe(false); // 未复习=种子
  });
});

// ─── 记忆宫殿 ───────────────────────────────────────────────

describe('deriveMemoryRooms（记忆宫殿）', () => {
  it('房间按来源模块分组，费曼薄弱点归入合成模块', () => {
    // Arrange
    const graph = makeGraph();
    const refs = new Map([['a', '认知科学'], ['b', '认知科学']]);
    // Act
    const rooms = deriveMemoryRooms(graph, [], refs);
    // Assert
    const names = rooms.map((r) => r.name);
    expect(names).toContain('认知科学');
    expect(names).toContain('费曼薄弱点');
    const cog = rooms.find((r) => r.name === '认知科学')!;
    expect(cog.items.map((i) => i.concept)).toEqual(['费曼技巧', '记忆曲线']); // 掌握度降序
  });

  it('hint 给出复习时距提示（不剧透答案）', () => {
    // Arrange & Act
    const rooms = deriveMemoryRooms(makeGraph(), [review('a', 3)], new Map(), NOW);
    // Assert
    const item = rooms
      .flatMap((r) => r.items)
      .find((i) => i.concept === '费曼技巧')!;
    expect(item.hint).toContain('3 天前复习过');
  });

  it('冷启动 → 空房间', () => {
    // Arrange & Act & Assert
    expect(deriveMemoryRooms({ nodes: [], links: [], coldStart: true }, [])).toEqual([]);
  });
});
