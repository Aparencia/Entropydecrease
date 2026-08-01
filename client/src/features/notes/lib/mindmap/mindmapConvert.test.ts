/**
 * mindmapConvert 单测：树↔React Flow 投影 + dagre 布局
 * Unit tests for tree -> React Flow projection + dagre layout
 */
import { describe, it, expect } from 'vitest';
import { treeToFlow } from './mindmapConvert';
import type { MindmapNode } from '@/types/models';

function sampleTree(): MindmapNode {
  return {
    id: 'root',
    text: '中心',
    children: [
      { id: 'a', text: '分支A', children: [{ id: 'a1', text: '子A1', children: [] }] },
      { id: 'b', text: '分支B', children: [] },
    ],
  };
}

describe('treeToFlow', () => {
  it('节点/边数量与树一致', () => {
    const { nodes, edges } = treeToFlow(sampleTree());
    expect(nodes).toHaveLength(4); // root, a, a1, b
    expect(edges).toHaveLength(3); // root->a, a->a1, root->b
  });

  it('父子边正确', () => {
    const { edges } = treeToFlow(sampleTree());
    const pairs = edges.map((e) => `${e.source}->${e.target}`).sort();
    expect(pairs).toEqual(['a->a1', 'root->a', 'root->b'].sort());
  });

  it('折叠子树不展开', () => {
    const root = sampleTree();
    root.children[0].collapsed = true; // 折叠 'a'
    const { nodes, edges } = treeToFlow(root);
    expect(nodes.map((n) => n.id)).not.toContain('a1');
    expect(edges.map((e) => e.id)).not.toContain('a->a1');
    expect(nodes).toHaveLength(3); // root, a, b
  });

  it('dagre 生成坐标非 NaN', () => {
    const { nodes } = treeToFlow(sampleTree());
    for (const n of nodes) {
      expect(Number.isNaN(n.position.x)).toBe(false);
      expect(Number.isNaN(n.position.y)).toBe(false);
    }
  });

  it('根节点 isRoot，叶节点 hasChildren=false', () => {
    const { nodes } = treeToFlow(sampleTree());
    expect(nodes.find((n) => n.id === 'root')?.data.isRoot).toBe(true);
    expect(nodes.find((n) => n.id === 'a1')?.data.hasChildren).toBe(false);
    expect(nodes.find((n) => n.id === 'a')?.data.hasChildren).toBe(true);
  });

  it('节点类型标记为 mindmapNode', () => {
    const { nodes } = treeToFlow(sampleTree());
    expect(nodes.every((n) => n.type === 'mindmapNode')).toBe(true);
  });
});
