/**
 * 笔记 Markdown 往返（阶段四）
 * Note Markdown round-trip (Phase 4)
 *
 * @ai-context: 用无头 TipTap Editor + tiptap-markdown 实现 TipTap JSON ↔ Markdown。
 * 导出（noteToMarkdown）：先把 wikiLink 节点降级为 `[[label]]` 文本（转换 schema
 * 不含 wikiLink，避免无序列化器报错），导图笔记降级为大纲纯文本。
 * 导入（markdownToNoteContent）：tiptap-markdown 解析 md 字符串为 TipTap JSON。
 * 每次转换创建并销毁一个 detached Editor（用户触发，频率低）。
 * @ai-context: Headless TipTap Editor + tiptap-markdown for JSON<->Markdown.
 * wikiLink nodes are downgraded to `[[label]]` text before serialization.
 */
import { Editor, type Content } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Image } from '@tiptap/extension-image';
import { TextAlign } from '@tiptap/extension-text-align';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Markdown } from 'tiptap-markdown';
import { isMindmapData, parseMindmapData } from '../mindmap/mindmapOps';
import { mindmapToPlainText } from '../mindmap/mindmapText';

/** 转换用扩展集（镜像笔记编辑器，去掉仅 UI 的 Placeholder 与 wikiLink） */
function conversionExtensions() {
  return [
    StarterKit,
    Highlight.configure({ multicolor: false }),
    Underline,
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ inline: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Color,
    TextStyle,
    Markdown.configure({ html: false, transformPastedText: false }),
  ];
}

/** 将 wikiLink 节点递归替换为 `[[label]]` 文本节点（schema 无 wikiLink 时避免报错） */
function wikiLinksToText(node: unknown): unknown {
  if (!node || typeof node !== 'object') return node;
  const n = node as { type?: string; attrs?: { label?: string }; content?: unknown[] };
  if (n.type === 'wikiLink') {
    return { type: 'text', text: `[[${n.attrs?.label ?? ''}]]` };
  }
  if (Array.isArray(n.content)) {
    return { ...n, content: n.content.map(wikiLinksToText) };
  }
  return node;
}

/**
 * 笔记内容（TipTap JSON）→ Markdown。导图笔记降级为大纲纯文本。
 * Convert note content (TipTap JSON) to Markdown.
 */
export function noteToMarkdown(content: string): string {
  if (isMindmapData(content)) {
    const data = parseMindmapData(content);
    if (data) return mindmapToPlainText(data.root);
  }

  let json: unknown;
  try {
    json = wikiLinksToText(JSON.parse(content));
  } catch {
    return '';
  }

  const editor = new Editor({
    element: document.createElement('div'),
    extensions: conversionExtensions(),
    content: json as Content,
  });
  const md = (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
  editor.destroy();
  return md;
}

/**
 * Markdown → 笔记内容（TipTap JSON 字符串）。
 * Convert Markdown to note content (TipTap JSON string).
 */
export function markdownToNoteContent(md: string): string {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: conversionExtensions(),
  });
  editor.commands.setContent(md);
  const json = editor.getJSON();
  editor.destroy();
  return JSON.stringify(json);
}
