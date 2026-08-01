/**
 * linkExtractor 单测：wiki-link 目标提取
 * Unit tests for wiki-link target extraction
 */
import { describe, it, expect } from 'vitest';
import { extractLinkTargets } from './linkExtractor';

/** 构造含若干 wikiLink 节点的 TipTap JSON */
function contentWithLinks(...ids: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', content: ids.map((id) => ({ type: 'wikiLink', attrs: { id, label: 'x' } })) },
    ],
  });
}

describe('extractLinkTargets', () => {
  it('提取 wikiLink 节点的目标 id', () => {
    expect(extractLinkTargets(contentWithLinks('n1', 'n2')).sort()).toEqual(['n1', 'n2']);
  });

  it('去重', () => {
    expect(extractLinkTargets(contentWithLinks('n1', 'n1', 'n2')).sort()).toEqual(['n1', 'n2']);
  });

  it('嵌套 content 递归提取', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'bulletList', content: [
          { type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'wikiLink', attrs: { id: 'deep', label: 'd' } }] },
          ] },
        ] },
      ],
    });
    expect(extractLinkTargets(json)).toEqual(['deep']);
  });

  it('无链接返回空数组', () => {
    const json = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] });
    expect(extractLinkTargets(json)).toEqual([]);
  });

  it('忽略无 id 的 wikiLink', () => {
    const json = JSON.stringify({ type: 'doc', content: [{ type: 'wikiLink', attrs: { label: 'no-id' } }] });
    expect(extractLinkTargets(json)).toEqual([]);
  });

  it('损坏 JSON 返回空数组', () => {
    expect(extractLinkTargets('not json')).toEqual([]);
    expect(extractLinkTargets('')).toEqual([]);
  });
});
