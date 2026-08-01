/**
 * WikiLink 自动补全列表（suggestion 弹窗内容）
 * WikiLink autocomplete list (suggestion popup content)
 *
 * @ai-context: 阶段二双向链接。由 WikiLink 扩展的 suggestion render 经
 * ReactRenderer 挂载。键盘上下选择/回车插入（onKeyDown 经 ref 暴露给
 * suggestion 插件）；无匹配项时返回 null 隐藏弹窗。
 * @ai-context: Mounted via ReactRenderer from the WikiLink suggestion render.
 * Exposes onKeyDown through ref; returns null (hidden) when no matches.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WikiLinkItem {
  id: string;
  label: string;
}

interface WikiLinkSuggestionsProps {
  items: WikiLinkItem[];
  command: (item: { id: string; label: string }) => void;
}

export interface WikiLinkSuggestionsHandle {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const WikiLinkSuggestions = forwardRef<WikiLinkSuggestionsHandle, WikiLinkSuggestionsProps>(
  function WikiLinkSuggestions({ items, command }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useEffect(() => setSelectedIndex(0), [items]);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) command({ id: item.id, label: item.label });
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (items.length === 0) return false;
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) return null;

    return (
      <div className="w-60 max-h-64 overflow-y-auto rounded-kb-md border border-border/60 bg-bg-elevated shadow-kb-md py-1">
        <div className="px-3 py-1.5 text-c1 text-text-tertiary border-b border-border/40">链接到笔记</div>
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => selectItem(i)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-1.5 text-left text-b2 transition-colors',
              i === selectedIndex ? 'bg-brand-50 text-brand-700' : 'text-text-primary hover:bg-bg-tertiary',
            )}
          >
            <Link2 className="w-3.5 h-3.5 flex-shrink-0 opacity-60" strokeWidth={1.5} />
            <span className="truncate">{item.label || '未命名笔记'}</span>
          </button>
        ))}
      </div>
    );
  },
);
