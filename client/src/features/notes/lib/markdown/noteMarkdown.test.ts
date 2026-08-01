/**
 * noteMarkdown 单测：Markdown 往返一致性
 * Unit tests for Markdown round-trip
 */
import { describe, it, expect } from 'vitest';
import { noteToMarkdown, markdownToNoteContent } from './noteMarkdown';

/** 构造 TipTap doc JSON 字符串 */
function tiptapDoc(...content: unknown[]): string {
  return JSON.stringify({ type: 'doc', content });
}

describe('noteMarkdown', () => {
  it('标题与段落转 Markdown', () => {
    const md = noteToMarkdown(tiptapDoc(
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '标题' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
    ));
    expect(md).toContain('# 标题');
    expect(md).toContain('正文');
  });

  it('粗体/斜体/行内代码', () => {
    const md = noteToMarkdown(tiptapDoc({
      type: 'paragraph',
      content: [
        { type: 'text', text: '粗', marks: [{ type: 'bold' }] },
        { type: 'text', text: '斜', marks: [{ type: 'italic' }] },
        { type: 'text', text: '码', marks: [{ type: 'code' }] },
      ],
    }));
    expect(md).toContain('**粗**');
    expect(md).toContain('*斜*');
    expect(md).toContain('`码`');
  });

  it('无序列表', () => {
    const md = noteToMarkdown(tiptapDoc({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '项一' }] }] },
      ],
    }));
    expect(md).toMatch(/[-*] 项一/);
  });

  it('wikiLink 降级为 [[label]] 文本（方括号被 markdown 转义）', () => {
    const md = noteToMarkdown(tiptapDoc({
      type: 'paragraph',
      content: [{ type: 'wikiLink', attrs: { id: 'n1', label: '目标笔记' } }],
    }));
    // 标签保留；方括号可能被 markdown 转义为 \[\[
    expect(md).toContain('目标笔记');
    expect(md.replace(/\\/g, '')).toContain('[[目标笔记]]');
  });

  it('Markdown 转 TipTap JSON（标题+粗体）', () => {
    const json = markdownToNoteContent('# 标题\n\n**粗体** 正文');
    const doc = JSON.parse(json) as { type: string };
    expect(doc.type).toBe('doc');
    const str = JSON.stringify(doc);
    expect(str).toContain('标题');
    expect(str).toContain('heading');
    expect(str).toContain('bold');
  });

  it('导图笔记降级为大纲纯文本', () => {
    const mindmap = JSON.stringify({
      type: 'mindmap',
      version: 1,
      root: { id: 'r', text: '中心', children: [{ id: 'a', text: '分支', children: [] }] },
    });
    const md = noteToMarkdown(mindmap);
    expect(md).toContain('中心');
    expect(md).toContain('分支');
  });

  it('损坏内容返回空字符串', () => {
    expect(noteToMarkdown('not json')).toBe('');
  });
});
