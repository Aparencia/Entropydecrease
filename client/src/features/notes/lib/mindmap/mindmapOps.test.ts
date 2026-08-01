/**
 * mindmapOps 单测：树操作不可变性 + 边界 + 判别函数
 * Unit tests for mindmap tree ops (immutability, boundaries, guards)
 */
import { describe, it, expect } from 'vitest';
import {
  findNode, addChild, addSibling, deleteNode, updateText,
  toggleCollapse, isMindmapData, parseMindmapData, createDefaultMindmap,
} from './mindmapOps';
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

describe('mindmapOps', () => {
  it('findNode 深度优先查找', () => {
    const root = sampleTree();
    expect(findNode(root, 'a1')?.text).toBe('子A1');
    expect(findNode(root, 'x')).toBeNull();
  });

  it('addChild 追加子节点并展开该节点', () => {
    const next = addChild(sampleTree(), 'b', '新', 'newId');
    expect(findNode(next, 'b')?.children).toHaveLength(1);
    expect(findNode(next, 'newId')?.text).toBe('新');
    expect(findNode(next, 'b')?.collapsed).toBe(false);
  });

  it('addChild 不可变（原树不变）', () => {
    const root = sampleTree();
    addChild(root, 'b', '新');
    expect(root.children[1].children).toHaveLength(0);
  });

  it('addSibling 在节点后插入同级', () => {
    const next = addSibling(sampleTree(), 'a', '同级', 'sibId');
    expect(next.children.map((c) => c.id)).toEqual(['a', 'sibId', 'b']);
  });

  it('addSibling 对根节点退化为加子节点', () => {
    const next = addSibling(sampleTree(), 'root', '子', 'cId');
    expect(next.children.map((c) => c.id)).toContain('cId');
  });

  it('deleteNode 删除子树', () => {
    const next = deleteNode(sampleTree(), 'a');
    expect(findNode(next, 'a')).toBeNull();
    expect(findNode(next, 'a1')).toBeNull();
    expect(next.children).toHaveLength(1);
  });

  it('deleteNode 禁止删根', () => {
    const next = deleteNode(sampleTree(), 'root');
    expect(next.id).toBe('root');
    expect(next.children).toHaveLength(2);
  });

  it('updateText 更新文本且不可变', () => {
    const root = sampleTree();
    const next = updateText(root, 'a1', '改后');
    expect(findNode(next, 'a1')?.text).toBe('改后');
    expect(findNode(root, 'a1')?.text).toBe('子A1');
  });

  it('toggleCollapse 切换折叠', () => {
    const once = toggleCollapse(sampleTree(), 'a');
    expect(findNode(once, 'a')?.collapsed).toBe(true);
    const twice = toggleCollapse(once, 'a');
    expect(findNode(twice, 'a')?.collapsed).toBe(false);
  });

  it('isMindmapData / parseMindmapData 判别', () => {
    const json = JSON.stringify(createDefaultMindmap());
    expect(isMindmapData(json)).toBe(true);
    expect(parseMindmapData(json)?.root).toBeTruthy();
    expect(isMindmapData('{"type":"doc"}')).toBe(false);
    expect(isMindmapData('not json')).toBe(false);
    expect(parseMindmapData('bad')).toBeNull();
  });

  it('createDefaultMindmap 结构合法', () => {
    const data = createDefaultMindmap();
    expect(data.type).toBe('mindmap');
    expect(data.version).toBe(1);
    expect(data.root.children).toHaveLength(3);
  });
});
