/**
 * EditorToolbar 回归测试（内测反馈缺陷）
 * Regression tests for EditorToolbar fixes
 *
 * @ai-context: 覆盖两个内测 bug 的修复：
 * 1) 切换标题（字号）会重置 textAlign——修复后对齐方式保留；
 * 2) 光标在表格内点击"插入表格"会无限嵌套——修复后拦截。
 * 使用真实 TipTap 无头实例（与 useNoteEditor 相同的关键扩展），
 * 通过 RTL 点击工具栏按钮驱动，断言文档状态。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import type { Editor as ReactEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { EditorToolbar } from './EditorToolbar';

/** 统计文档中 table 节点数量（含嵌套） */
function countTables(json: Record<string, unknown>): number {
  let count = 0;
  if (json.type === 'table') count += 1;
  const content = json.content as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(content)) {
    for (const child of content) count += countTables(child);
  }
  return count;
}

describe('EditorToolbar 内测缺陷回归', () => {
  let editor: Editor;
  let el: HTMLDivElement;

  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    editor = new Editor({
      element: el,
      extensions: [
        StarterKit,
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ],
      content: '<p>一段文字</p>',
    });
  });

  afterEach(() => {
    editor.destroy();
    el.remove();
    cleanup();
  });

  function renderToolbar() {
    // 无头 core Editor 运行时与 react Editor 等价，类型层面强制转换
    return render(
      <EditorToolbar editor={editor as unknown as ReactEditor} onPickImage={() => {}} />,
    );
  }

  it('切换标题（字号）后保留原有对齐方式', () => {
    editor.chain().focus('all').setTextAlign('center').run();
    renderToolbar();

    fireEvent.click(screen.getByTitle('标题 1'));

    const json = editor.getJSON() as Record<string, unknown>;
    const firstBlock = (json.content as Array<Record<string, unknown>>)[0];
    expect(firstBlock.type).toBe('heading');
    expect((firstBlock.attrs as Record<string, unknown>).textAlign).toBe('center');
  });

  it('降级标题（H1→正文）同样保留对齐方式', () => {
    // 直接以 heading 内容创建编辑器（与 useNoteEditor 加载已有笔记等价），
    // 先 setContent 再 toggle 的时序与真实加载路径不一致，故单独构造
    editor.destroy();
    editor = new Editor({
      element: el,
      extensions: [
        StarterKit,
        Table.configure({ resizable: true }),
        TableRow,
        TableCell,
        TableHeader,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ],
      content: '<h2 style="text-align: right">标题</h2>',
    });
    editor.chain().focus('all').run();
    renderToolbar();

    // 再次点击当前激活级别 → 降级为段落
    fireEvent.click(screen.getByTitle('标题 2'));

    const json = editor.getJSON() as Record<string, unknown>;
    const firstBlock = (json.content as Array<Record<string, unknown>>)[0];
    expect(firstBlock.type).toBe('paragraph');
    expect((firstBlock.attrs as Record<string, unknown>).textAlign).toBe('right');
  });

  it('光标在表格内时点击插入表格不再嵌套', () => {
    editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run();
    // 光标移入首个单元格
    editor.chain().focus('start').run();
    expect(editor.isActive('table')).toBe(true);
    renderToolbar();

    fireEvent.click(screen.getByTitle('插入表格'));
    fireEvent.click(screen.getByTitle('插入表格'));

    expect(countTables(editor.getJSON() as Record<string, unknown>)).toBe(1);
  });

  it('光标不在表格内时插入表格正常生效', () => {
    renderToolbar();

    fireEvent.click(screen.getByTitle('插入表格'));

    expect(editor.isActive('table')).toBe(true);
    expect(countTables(editor.getJSON() as Record<string, unknown>)).toBe(1);
  });
});
