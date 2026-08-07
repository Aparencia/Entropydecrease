/**
 * 章节速览导航组件（P2-2）
 * 从 Markdown 笔记中提取标题层级，生成可点击的章节导航条。
 * 点击跳转到对应章节位置，支持多级标题展开/折叠。
 *
 * @ai-context: P2-2 章节速览——纯客户端实现，从分析结果 Markdown 中
 * 提取 ## 和 ### 标题构建章节树。离线可用，无需云端依赖。
 */
import { useMemo, useState } from 'react';
import { ListTree, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Chapter {
  level: number;
  title: string;
  index: number;
}

interface ChapterNavProps {
  /** Markdown 笔记内容 */
  content: string;
  /** 点击章节时回调（可滚动到对应位置） */
  onChapterClick?: (index: number) => void;
  className?: string;
}

export function ChapterNav({ content, onChapterClick, className }: ChapterNavProps) {
  const [collapsed, setCollapsed] = useState(false);

  const chapters = useMemo(() => {
    if (!content) return [];
    const lines = content.split('\n');
    const result: Chapter[] = [];
    let idx = 0;
    for (const line of lines) {
      const match = line.match(/^(#{2,3})\s+(.+)/);
      if (match) {
        result.push({ level: match[1].length, title: match[2].trim(), index: idx });
      }
      idx++;
    }
    return result;
  }, [content]);

  if (chapters.length === 0) return null;

  return (
    <div className={cn('border-t border-border/20', className)}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-b3 text-text-secondary transition-colors hover:text-brand-400 hover:bg-brand-500/5"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" strokeWidth={1.5} /> : <ChevronDown className="w-4 h-4" strokeWidth={1.5} />}
        <ListTree className="w-4 h-4" strokeWidth={1.5} />
        <span className="font-medium">章节速览</span>
        <span className="ml-auto text-c1 text-text-tertiary">{chapters.length} 节</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-0.5">
          {chapters.map((ch, i) => (
            <button
              key={i}
              onClick={() => onChapterClick?.(ch.index)}
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1 rounded-kb-md text-left transition-colors',
                ch.level === 2
                  ? 'text-b3 text-text-primary hover:bg-bg-secondary font-medium'
                  : 'text-c1 text-text-tertiary hover:bg-bg-secondary ml-4',
              )}
            >
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-brand-400/60" />
              <span className="truncate">{ch.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}