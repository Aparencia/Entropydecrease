/**
 * metroData 单元测试 / Unit tests for the metro map derivation layer
 *
 * @ai-context: 覆盖 4.9 验收——课程分组（source_ref 溯源）、线路颜色稳定、
 * 跨课程换乘派生与去重、journey 最薄弱优先、冷启动与无卡片退化。
 * BDD AAA 模式（Arrange/Act/Assert）。
 */
import { describe, it, expect } from 'vitest';
import { deriveMetroData, layoutMetro } from './metroData';
import { moduleColor } from './mapData';
import type { KnowledgeGraph } from './knowledgeGraph';

// ─── 测试工厂 ───────────────────────────────────────────────

function makeGraph(overrides: Partial<KnowledgeGraph> = {}): KnowledgeGraph {
  return {
    nodes: [
      { id: 'card:a', concept: '费曼技巧', tier: '牢固', glow: 1.0, dimmed: false },
      { id: 'card:b', concept: '记忆曲线', tier: '成长中', glow: 0.72, dimmed: false },
      { id: 'card:c', concept: '间隔重复', tier: '朦胧', glow: 0.45, dimmed: true },
    ],
    links: [
      { source: 'card:a', target: 'card:b', kind: 'review-chain' },
      { source: 'card:b', target: 'card:c', kind: 'shared-note' },
    ],
    coldStart: false,
    ...overrides,
  };
}

// ─── 课程分组 ───────────────────────────────────────────────

describe('deriveMetroData（课程分组与线路）', () => {
  it('按 source_ref 溯源分组为线路，颜色取自模块色板且稳定', () => {
    // Arrange
    const graph = makeGraph();
    const refs = new Map([
      ['a', '认知科学'],
      ['b', '认知科学'],
      ['c', '学习法'],
    ]);
    // Act
    const metro = deriveMetroData(graph, refs);
    // Assert
    expect(metro.courses.map((c) => c.name)).toEqual(['认知科学', '学习法']);
    expect(metro.courses[0].concepts.map((s) => s.id)).toEqual(['card:a', 'card:b']);
    expect(metro.courses[0].color).toBe(moduleColor('认知科学'));
    expect(deriveMetroData(graph, refs).courses[0].color).toBe(metro.courses[0].color);
  });

  it('无溯源卡片归入「未分类」，费曼薄弱点不占站台', () => {
    // Arrange
    const graph = makeGraph({
      nodes: [
        { id: 'card:x', concept: '无溯源卡', tier: '朦胧', glow: 0.45, dimmed: true },
        { id: 'feynman:f1', concept: '薄弱点', tier: '朦胧', glow: 0.45, dimmed: true },
      ],
      links: [{ source: 'feynman:f1', target: 'card:x', kind: 'weakpoint' }],
    });
    // Act
    const metro = deriveMetroData(graph, new Map());
    // Assert
    expect(metro.courses).toHaveLength(1);
    expect(metro.courses[0].name).toBe('未分类');
    expect(metro.courses[0].concepts.map((s) => s.id)).toEqual(['card:x']);
  });

  it('冷启动或空图 → 空数据', () => {
    // Arrange & Act & Assert
    expect(deriveMetroData({ nodes: [], links: [], coldStart: true }, new Map()).courses).toEqual([]);
    expect(deriveMetroData({ nodes: [], links: [], coldStart: false }, new Map()).journey).toEqual([]);
  });
});

// ─── 换乘 ───────────────────────────────────────────────────

describe('deriveMetroData（换乘与推荐路径）', () => {
  it('跨课程互连的链成为换乘，同课程链不算', () => {
    // Arrange
    const graph = makeGraph({
      links: [
        { source: 'card:a', target: 'card:b', kind: 'shared-note' }, // 同课程
        { source: 'card:b', target: 'card:c', kind: 'review-chain' }, // 跨课程
      ],
    });
    const refs = new Map([['a', '甲'], ['b', '甲'], ['c', '乙']]);
    // Act
    const metro = deriveMetroData(graph, refs);
    // Assert
    expect(metro.transfers).toEqual([{ from: 'card:b', to: 'card:c' }]);
  });

  it('换乘去重（同端点正反方向只保留一条）', () => {
    // Arrange
    const graph = makeGraph({
      links: [
        { source: 'card:a', target: 'card:b', kind: 'review-chain' },
        { source: 'card:b', target: 'card:a', kind: 'shared-note' },
      ],
    });
    const refs = new Map([['a', '甲'], ['b', '乙']]);
    // Act
    const metro = deriveMetroData(graph, refs);
    // Assert
    expect(metro.transfers).toHaveLength(1);
  });

  it('journey 按掌握度升序（最薄弱优先），截断上限内', () => {
    // Arrange
    const graph = makeGraph();
    // Act
    const metro = deriveMetroData(graph, new Map());
    // Assert
    expect(metro.journey[0]).toBe('card:c'); // 朦胧 0.45 最薄弱
    expect(metro.journey[metro.journey.length - 1]).toBe('card:a'); // 牢固 1.0 最后
  });
});

// ─── 布局 ───────────────────────────────────────────────────

describe('layoutMetro', () => {
  it('线路纵向排布、站台横向铺开，坐标确定', () => {
    // Arrange
    const metro = deriveMetroData(
      makeGraph({
        nodes: [
          { id: 'card:a', concept: 'A', tier: '牢固', glow: 1.0, dimmed: false },
          { id: 'card:b', concept: 'B', tier: '成长中', glow: 0.72, dimmed: false },
          { id: 'card:c', concept: 'C', tier: '朦胧', glow: 0.45, dimmed: true },
        ],
      }),
      new Map([['a', '甲'], ['b', '甲'], ['c', '乙']]),
    );
    // Act
    const layout = layoutMetro(metro);
    // Assert
    const a = layout.positions.get('card:a')!;
    const b = layout.positions.get('card:b')!;
    const c = layout.positions.get('card:c')!;
    expect(a.y).toBe(b.y); // 同线路同行
    expect(c.y).toBeGreaterThan(a.y); // 不同线路不同行
    expect(b.x).toBeGreaterThan(a.x); // 站台横向铺开
    expect(layout.linePaths.get('course:甲')).toHaveLength(2);
  });
});
