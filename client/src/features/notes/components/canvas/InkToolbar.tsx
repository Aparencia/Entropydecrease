/**
 * 墨迹工具栏（OneNote 式：选择/钢笔/荧光笔/橡皮 + 色板 + 笔粗）
 * Ink toolbar (OneNote-style: select/pen/highlighter/eraser + palette + width)
 *
 * @ai-context: 阶段三。悬浮于画布顶部居中。钢笔/荧光笔显示色板与笔粗选择；
 * 选择/橡皮工具隐藏颜色。当前工具高亮。工具/颜色/笔粗变更上抛父级。
 * @ai-context: Floating top-center toolbar. Color palette & width shown only for
 * pen/highlighter. Active tool highlighted; changes bubble up to parent.
 */
import { MousePointer2, Pen, Highlighter, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InkTool } from '../../lib/canvas/useInkDrawing';

/** OneNote 式色板 / OneNote-style palette */
const INK_COLORS = ['#1e293b', '#64748b', '#dc2626', '#ea580c', '#eab308', '#16a34a', '#2563eb', '#7c3aed'];
/** 笔粗档位（px） / Width stops */
const INK_WIDTHS = [2, 4, 7];

interface ToolDef {
  id: InkTool;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;
  label: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select', icon: MousePointer2, label: '选择（操作文本块）' },
  { id: 'pen', icon: Pen, label: '钢笔' },
  { id: 'highlighter', icon: Highlighter, label: '荧光笔' },
  { id: 'eraser', icon: Eraser, label: '橡皮擦' },
];

interface InkToolbarProps {
  tool: InkTool;
  color: string;
  width: number;
  onToolChange: (t: InkTool) => void;
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
}

export function InkToolbar({ tool, color, width, onToolChange, onColorChange, onWidthChange }: InkToolbarProps) {
  const showInkOptions = tool === 'pen' || tool === 'highlighter';
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-kb-lg bg-bg-elevated/95 backdrop-blur border border-border/60 shadow-kb-md">
      <div className="flex items-center gap-1">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => onToolChange(t.id)}
              title={t.label}
              className={cn(
                'p-1.5 rounded-kb-sm transition-colors',
                tool === t.id ? 'bg-brand-500 text-white' : 'text-text-secondary hover:bg-bg-tertiary',
              )}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
            </button>
          );
        })}
      </div>

      {showInkOptions && (
        <>
          <div className="w-px h-5 bg-border/60" />
          <div className="flex items-center gap-1">
            {INK_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onColorChange(c)}
                title={c}
                className={cn(
                  'w-5 h-5 rounded-full border transition-transform',
                  color === c ? 'border-brand-500 scale-110 ring-1 ring-brand-500/40' : 'border-border/60',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="w-px h-5 bg-border/60" />
          <div className="flex items-center gap-1">
            {INK_WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => onWidthChange(w)}
                title={`${w}px`}
                className={cn(
                  'w-6 h-6 rounded-kb-sm flex items-center justify-center transition-colors',
                  width === w ? 'bg-brand-50 text-brand-600' : 'text-text-secondary hover:bg-bg-tertiary',
                )}
              >
                <span className="rounded-full bg-current" style={{ width: w + 1, height: w + 1 }} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
