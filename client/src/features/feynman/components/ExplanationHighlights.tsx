/**
 * 讲解文本薄弱点高亮渲染
 *
 * @ai-context: 从 FeynmanSessionPage 拆出。将讲解文本按薄弱点位置切分为
 * 普通/高亮片段渲染；已掌握薄弱点显示绿色删除线，未掌握显示琥珀色。
 * 薄弱点按 position.start 排序后线性切分，重叠区间取 min(end) 截断。
 */
import { cn } from '@/lib/utils';
import type { FeynmanWeakPoint } from '@/types/models';

interface ExplanationHighlightsProps {
  text: string;
  weakPoints: FeynmanWeakPoint[];
}

export function ExplanationHighlights({ text, weakPoints }: ExplanationHighlightsProps) {
  if (!text) {
    return <span className="text-text-tertiary italic">（请先在步骤 2 中写下你的讲解内容）</span>;
  }

  if (weakPoints.length === 0) return <>{text}</>;

  // 按位置排序并切分片段
  const sortedWp = [...weakPoints].sort((a, b) => a.position.start - b.position.start);
  const segments: { text: string; wp?: FeynmanWeakPoint }[] = [];
  let cursor = 0;

  for (const wp of sortedWp) {
    if (wp.position.start > cursor) {
      segments.push({ text: text.slice(cursor, wp.position.start) });
    }
    const end = Math.min(wp.position.end, text.length);
    segments.push({ text: text.slice(wp.position.start, end), wp });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor) });
  }

  return (
    <>
      {segments.map((seg, i) =>
        seg.wp ? (
          <mark
            key={i}
            className={cn(
              'rounded-kb-sm px-0.5 cursor-pointer',
              seg.wp.mastered
                ? 'bg-semantic-success/20 text-semantic-success'
                : 'bg-[#F59E0B]/20 text-[#B45309] dark:text-[#F59E0B]',
            )}
            title={seg.wp.mastered ? '已掌握' : '薄弱点'}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}
