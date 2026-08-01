/**
 * mindmapText 单测：导图纯文本提取 + 统一提取器
 * Unit tests for mindmap plain-text extraction + unified extractor
 */
import { describe, it, expect } from 'vitest';
import { mindmapToPlainText, noteContentToPlainText } from './mindmapText';
import { createDefaultMindmap } from './mindmapOps';
import type { MindmapNode } from '@/types/models';

describe('mindmapText', () => {
  it('mindmapToPlainText 深度优先拼接节点文本', () => {
    const root: MindmapNode = {
      id: 'r',
      text: '中心',
      children: [
        { id: 'a', text: 'A', children: [{ id: 'a1', text: 'A1', children: [] }] },
        { id: 'b', text: 'B', children: [] },
      ],
    };
    const text = mindmapToPlainText(root);
    expect(text).toContain('中心');
    expect(text).toContain('A1');
    expect(text).toContain('B');
  });

  it('mindmapToPlainText 忽略空文本节点', () => {
    const root: MindmapNode = { id: 'r', text: '  ', children: [{ id: 'a', text: 'A', children: [] }] };
    expect(mindmapToPlainText(root)).toBe('A');
  });

  it('noteContentToPlainText 导图走 mindmap 提取（无 JSON 噪声）', () => {
    const json = JSON.stringify(createDefaultMindmap());
    const text = noteContentToPlainText(json);
    expect(text).toContain('中心主题');
    expect(text).not.toContain('"type"');
    expect(text).not.toContain('"children"');
  });

  it('noteContentToPlainText TipTap 走 extractPlainText', () => {
    const tiptap = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '你好' }] }],
    });
    expect(noteContentToPlainText(tiptap)).toContain('你好');
  });

  it('noteContentToPlainText 非 JSON 回退原文', () => {
    expect(noteContentToPlainText('plain text')).toBe('plain text');
  });
});
