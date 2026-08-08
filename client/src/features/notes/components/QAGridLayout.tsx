/**
 * 问答网格布局（QA Grid Template）
 *
 * @ai-context: 以网格形式组织问答对。行=问题，列=角度（是什么/为什么/怎么做/例子/类比）。
 * 每个单元格是独立可编辑的文本块。支持 AI 辅助填空和一键转闪卡。
 * @ai-context: QA Grid template — organizes Q&A pairs in a grid. Each row is
 * a question, each column is a perspective (what/why/how/example/analogy).
 */
import { useState, useCallback } from 'react';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QARow {
  id: string;
  question: string;
  what: string;
  why: string;
  how: string;
  example: string;
  analogy: string;
}

interface QAGridData {
  rows: QARow[];
}

interface QAGridLayoutProps {
  content: QAGridData;
  onChange: (data: QAGridData) => void;
}

const COLUMNS = [
  { key: 'question' as const, label: '问题', color: 'bg-brand-50 text-brand-700' },
  { key: 'what' as const, label: '是什么', color: 'bg-blue-50 text-blue-700' },
  { key: 'why' as const, label: '为什么', color: 'bg-emerald-50 text-emerald-700' },
  { key: 'how' as const, label: '怎么做', color: 'bg-amber-50 text-amber-700' },
  { key: 'example' as const, label: '例子', color: 'bg-purple-50 text-purple-700' },
  { key: 'analogy' as const, label: '类比', color: 'bg-rose-50 text-rose-700' },
];

function createRow(): QARow {
  return {
    id: crypto.randomUUID(),
    question: '',
    what: '',
    why: '',
    how: '',
    example: '',
    analogy: '',
  };
}

export function QAGridLayout({ content, onChange }: QAGridLayoutProps) {
  const [rows, setRows] = useState<QARow[]>(content?.rows || [createRow()]);

  const updateRow = useCallback((rowId: string, colKey: string, value: string) => {
    setRows((prev) => {
      const next = prev.map((r) =>
        r.id === rowId ? { ...r, [colKey]: value } : r,
      );
      onChange({ rows: next });
      return next;
    });
  }, [onChange]);

  const addRow = useCallback(() => {
    setRows((prev) => {
      const next = [...prev, createRow()];
      onChange({ rows: next });
      return next;
    });
  }, [onChange]);

  const deleteRow = useCallback((rowId: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== rowId);
      onChange({ rows: next.length > 0 ? next : [createRow()] });
      return next.length > 0 ? next : [createRow()];
    });
  }, [onChange]);

  const handleAIFill = useCallback(async (rowId: string) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row || !row.question.trim()) return;
    // 触发 AI 填充（通过自定义事件由父组件处理）
    window.dispatchEvent(new CustomEvent('qa-grid:ai-fill', {
      detail: { rowId, question: row.question },
    }));
  }, [rows]);

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center justify-between mb-3">
        <p className="text-b3 font-medium text-text-primary">问答网格</p>
        <button
          onClick={addRow}
          className="flex items-center gap-1 px-2.5 py-1 rounded-kb-sm text-c1 font-medium text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
          添加问题
        </button>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-2 min-w-[900px]">
        {/* 列头 */}
        {COLUMNS.map((col) => (
          <div key={col.key} className={cn('px-2 py-1.5 rounded-kb-sm text-c1 font-medium text-center', col.color)}>
            {col.label}
          </div>
        ))}

        {/* 行数据 */}
        {rows.map((row) => (
          <>
            {COLUMNS.map((col) => (
              <div key={`${row.id}-${col.key}`} className="relative group">
                {col.key === 'question' && (
                  <button
                    onClick={() => handleAIFill(row.id)}
                    className="absolute -left-2 top-1/2 -translate-y-1/2 p-0.5 text-text-tertiary hover:text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="AI 辅助填充"
                  >
                    <Sparkles className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )}
                <textarea
                  value={row[col.key]}
                  onChange={(e) => updateRow(row.id, col.key, e.target.value)}
                  placeholder={`输入${col.label}...`}
                  className="w-full h-20 px-2 py-1.5 rounded-kb-sm border border-border/30 bg-bg-secondary text-b2 text-text-primary placeholder:text-text-tertiary/50 resize-none focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400/30 transition-all"
                  rows={3}
                />
                {col.key === 'question' && (
                  <button
                    onClick={() => deleteRow(row.id)}
                    className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-bg-elevated border border-border/30 text-text-tertiary hover:text-semantic-error opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除此行"
                  >
                    <Trash2 className="w-3 h-3" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            ))}
          </>
        ))}
      </div>
    </div>
  );
}

export default QAGridLayout;