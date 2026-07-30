/**
 * 待办统计组件（含进度条）
 * @ai-context 在笔记编辑页底部/顶部展示当前 taskList 的完成进度。
 * 当 template === 'todo' 时显示在编辑器顶部（sticky），其余模板显示在底部。
 * 组件基于 TipTap editor 实例实时统计，无外部副作用。
 */

import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { CheckCircle2 } from 'lucide-react';

interface TodoStatsProps {
  editor: Editor | null;
}

/** 遍历文档统计 taskItem 的已完成/总数（纯函数） */
function countTaskItems(editor: Editor): { checked: number; total: number } {
  let checked = 0;
  let total = 0;

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'taskItem') {
      total++;
      if (node.attrs.checked) {
        checked++;
      }
    }
  });

  return { checked, total };
}

export function TodoStats({ editor }: TodoStatsProps) {
  const [stats, setStats] = useState({ checked: 0, total: 0 });

  useEffect(() => {
    if (!editor) return;

    // 初始统计
    setStats(countTaskItems(editor));

    // 监听内容变化实时更新统计
    const handler = () => setStats(countTaskItems(editor));
    editor.on('update', handler);
    editor.on('transaction', handler);

    return () => {
      editor.off('update', handler);
      editor.off('transaction', handler);
    };
  }, [editor]);

  // 没有待办项时不渲染
  if (stats.total === 0) return null;

  const percent = Math.round((stats.checked / stats.total) * 100);
  const isComplete = stats.checked === stats.total;

  return (
    <div className="flex items-center gap-3 px-kb-md py-2 select-none">
      <CheckCircle2
        className="w-icon-sm h-icon-sm flex-shrink-0"
        strokeWidth={1.5}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-b2 text-semantic-success/80">
            已完成 {stats.checked}/{stats.total}
          </span>
          <span className="text-c1 text-text-tertiary font-mono tabular-nums">
            {percent}%
          </span>
        </div>
        {/* 进度条 @ai-context 视觉反馈完成比例，全量完成时切换为品牌色 */}
        <div className="h-1.5 w-full rounded-full bg-bg-tertiary/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${percent}%`,
              backgroundColor: isComplete
                ? 'rgb(91, 138, 114)'   // brand-500
                : 'rgb(16, 185, 129)',  // emerald-500
            }}
          />
        </div>
      </div>
    </div>
  );
}
