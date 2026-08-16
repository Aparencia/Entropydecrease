/**
 * 三维知识脑图派生层单元测试
 * Unit tests for the 3D knowledge map derivation layer
 *
 * @ai-context: 覆盖 moduleColor 的确定性色板映射与 deriveMapNodes 的
 * 冷启动短路、节点投影（z 轴随掌握度分层）、邻居连接聚合、费曼薄弱点/
 * 无溯源卡片的合成模块归属与位置确定性。纯函数、无副作用。
 * @ai-context: Covers deterministic module colors and deriveMapNodes:
 * cold-start short circuit, mastery-based z layering, neighbor link
 * aggregation, synthetic module assignment and positional determinism.
 */
import { describe, it, expect } from 'vitest';
import { deriveMapNodes, moduleColor, MODULE_COLORS, UNKNOWN_MODULE, FEYNMAN_MODULE } from './mapData';
import type { KnowledgeGraph } from './knowledgeGraph';

const graph = (overrides: Partial<KnowledgeGraph>): KnowledgeGraph => ({
  coldStart: false,
  nodes: [
    { id: 'card:1', concept: '微积分', tier: '牢固', glow: 1, dimmed: false },
    { id: 'card:2', concept: '导数', tier: '成长中', glow: 0.6, dimmed: false },
    { id: 'feynman:wp1', concept: '极限', tier: '朦胧', glow: 0.3, dimmed: true },
  ],
  links: [
    { source: 'card:1', target: 'feynman:wp1', kind: 'weakpoint' },
    { source: 'card:1', target: 'card:2', kind: 'shared-note' },
  ],
  ...overrides,
});

describe('moduleColor', () => {
  it('should map any module to one of the palette colors', () => {
    expect(MODULE_COLORS).toHaveLength(8);
    for (const m of ['数学', '英语', '未分类', '费曼薄弱点', '']) {
      expect(MODULE_COLORS).toContain(moduleColor(m));
    }
  });

  it('should be deterministic for the same module', () => {
    expect(moduleColor('线性代数')).toBe(moduleColor('线性代数'));
  });
});

describe('deriveMapNodes', () => {
  it('should return empty for cold start or empty graph', () => {
    expect(deriveMapNodes(graph({ coldStart: true }))).toEqual([]);
    expect(deriveMapNodes(graph({ nodes: [], links: [] }))).toEqual([]);
  });

  it('should project every node with mastery-based z layering', () => {
    // Act
    const nodes = deriveMapNodes(graph({}));
    // Assert
    expect(nodes).toHaveLength(3);
    // 牢固节点 z=3.2 顶层，朦胧节点 z≈0.96
    const solid = nodes.find((n) => n.id === 'card:1');
    const hazy = nodes.find((n) => n.id === 'feynman:wp1');
    expect(solid?.position3D[2]).toBe(3.2);
    expect(hazy?.position3D[2]).toBe(0.96);
    expect(solid?.mastery).toBe(1);
  });

  it('should aggregate bidirectional connections from links', () => {
    // Act
    const nodes = deriveMapNodes(graph({}));
    // Assert：无向连接——两端都收录
    const c1 = nodes.find((n) => n.id === 'card:1');
    const wp1 = nodes.find((n) => n.id === 'feynman:wp1');
    expect(c1?.connections).toContain('feynman:wp1');
    expect(c1?.connections).toContain('card:2');
    expect(wp1?.connections).toContain('card:1');
  });

  it('should assign source modules including synthetic fallbacks', () => {
    // Arrange：仅 card:1 有溯源
    const sourceRefs = new Map([['1', '数学']]);
    // Act
    const nodes = deriveMapNodes(graph({}), sourceRefs);
    // Assert
    expect(nodes.find((n) => n.id === 'card:1')?.sourceModule).toBe('数学');
    expect(nodes.find((n) => n.id === 'card:2')?.sourceModule).toBe(UNKNOWN_MODULE);
    expect(nodes.find((n) => n.id === 'feynman:wp1')?.sourceModule).toBe(FEYNMAN_MODULE);
  });

  it('should produce identical positions for identical input', () => {
    // Act
    const first = deriveMapNodes(graph({}));
    const second = deriveMapNodes(graph({}));
    // Assert：确定性打散
    expect(first).toEqual(second);
  });

  it('should keep x/y inside the world disc', () => {
    // Act
    const nodes = deriveMapNodes(graph({}));
    // Assert：半径 4.2 内
    for (const n of nodes) {
      const [x, y] = n.position3D;
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(4.2);
    }
  });
});
