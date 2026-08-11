/**
 * WikiLink TipTap 扩展（双向链接的编辑侧）——AI 语义推荐增强
 * WikiLink TipTap extension — enhanced with AI semantic matching
 *
 * @ai-context: 阶段二双向链接。基于 Mention.extend（name:'wikiLink'），输入
 * `[[` 触发笔记标题自动补全。增强：当标题匹配无结果时，按标签匹配、最近编辑
 * 时间等维度推荐相关笔记。选中后以 wikiLink 节点（attrs id/label）替换 `[[xxx`，
 * 渲染为可识别 chip。
 * @ai-context: Mention-based wiki-link; `[[` triggers note-title autocomplete.
 * Enhanced: falls back to tag matching and recent-edit sorting when no title
 * match found. Selected note becomes a wikiLink node rendered as a chip.
 */
import Mention from '@tiptap/extension-mention';
import { mergeAttributes } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { useNoteStore } from '../../store/useNoteStore';
import { WikiLinkSuggestions, type WikiLinkSuggestionsHandle, type WikiLinkItem } from './WikiLinkSuggestions';

type RectGetter = (() => DOMRect | null) | null | undefined;

/** suggestion 弹窗渲染器（ReactRenderer + 手动 fixed 定位，无 tippy 依赖） */
function suggestionRender() {
  let component: ReactRenderer<WikiLinkSuggestionsHandle, { items: WikiLinkItem[]; command: (item: { id: string; label: string }) => void }> | null = null;
  let container: HTMLDivElement | null = null;

  const updatePosition = (clientRect: RectGetter) => {
    if (!container || !clientRect) return;
    const rect = clientRect();
    if (!rect) return;
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.bottom + 4}px`;
  };

  const cleanup = () => {
    component?.destroy();
    container?.remove();
    component = null;
    container = null;
  };

  return {
    onStart: (props: SuggestionProps) => {
      component = new ReactRenderer(WikiLinkSuggestions, { props, editor: props.editor });
      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.zIndex = '9999';
      container.appendChild(component.element);
      document.body.appendChild(container);
      updatePosition(props.clientRect);
    },
    onUpdate: (props: SuggestionProps) => {
      component?.updateProps(props);
      updatePosition(props.clientRect);
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === 'Escape') { cleanup(); return true; }
      return component?.ref?.onKeyDown(props) ?? false;
    },
    onExit: cleanup,
  };
}

export const WikiLink = Mention.extend({
  name: 'wikiLink',

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'wiki-link', 'data-id': node.attrs.id }),
      `${node.attrs.label ?? ''}`,
    ];
  },

  renderText({ node }) {
    return `[[${node.attrs.label ?? ''}]]`;
  },
}).configure({
  HTMLAttributes: { class: 'wiki-link' },
  suggestion: {
    char: '[',
    // 仅当输入了 `[[`（range 文本以 '[[' 开头）时才弹出 / only after `[[`
    allow: ({ editor, range }) => {
      const text = editor.state.doc.textBetween(range.from, range.to);
      return text.startsWith('[[');
    },
    // query 含前导 '['（第二个括号），去掉后按标题过滤 / strip leading '[' then filter by title
    items: ({ query }): WikiLinkItem[] => {
      const realQuery = query.startsWith('[') ? query.slice(1) : query;
      const q = realQuery.trim().toLowerCase();
      const notes = useNoteStore.getState().notes;

      // 优先按标题精确匹配 / prefer exact title match
      const titleMatches = notes
        .filter((n) => (n.title || '').toLowerCase().includes(q))
        .slice(0, 8)
        .map((n) => ({ id: n.id, label: n.title }));

      if (titleMatches.length > 0) return titleMatches;

      // 无标题匹配时，按标签匹配 + 最近编辑时间排序
      // fallback: tag matching + recent edit sorting
      const tagMatches = notes
        .filter((n) => n.tags.some((t) => t.toLowerCase().includes(q)))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8)
        .map((n) => ({ id: n.id, label: n.title }));

      if (tagMatches.length > 0) return tagMatches;

      // 终极兜底：返回最近编辑的笔记 / ultimate fallback: recent notes
      return notes
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)
        .map((n) => ({ id: n.id, label: n.title }));
    },
    command: ({ editor, range, props }) => {
      const attrs = props as { id?: string | null; label?: string | null };
      if (!attrs.id) return;
      editor.chain().focus()
        .deleteRange(range)
        .insertContent({ type: 'wikiLink', attrs: { id: attrs.id, label: attrs.label ?? '' } })
        .insertContent(' ')
        .run();
    },
    render: suggestionRender,
  },
});
