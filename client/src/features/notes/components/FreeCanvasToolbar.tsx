/**
 * 自由画布 AI 智能排版工具栏
 * Free-canvas AI layout toolbar
 *
 * @ai-context: 从 FreeCanvas 拆出。块数 >1 时左下角悬浮：默认态为"AI 整理"
 * 按钮（点击进入 tree 模式选择态）；选择态展示树形/时间线/聚类三模式按钮与
 * 取消。AI 调用与结果落盘（onApplyLayout）由父组件注入；本组件纯展示。
 * @ai-context: Extracted from FreeCanvas. Floating bottom-left toolbar shown
 * when block count >1: idle state is an "AI 整理" button (click enters tree
 * mode-selection state); selection state shows tree/timeline/cluster mode
 * buttons plus cancel. The AI call and result commit (onApplyLayout) are
 * injected by the parent; this component is purely presentational.
 */
import { Sparkles } from 'lucide-react';
import type { LayoutMode } from '../hooks/useCanvasAILayout';

interface FreeCanvasToolbarProps {
  blockCount: number;
  aiLayoutLoading: boolean;
  aiLayoutMode: LayoutMode | null;
  onModeChange: (mode: LayoutMode | null) => void;
  onApplyLayout: (mode: LayoutMode) => void;
}

export function FreeCanvasToolbar({
  blockCount,
  aiLayoutLoading,
  aiLayoutMode,
  onModeChange,
  onApplyLayout,
}: FreeCanvasToolbarProps) {
  if (blockCount <= 1) return null;
  return (
    <div className="absolute bottom-20 left-4 z-10 flex gap-1">
      {aiLayoutMode ? (
        <div className="flex items-center gap-1 px-2 py-1.5 rounded-kb-md bg-bg-elevated/90 backdrop-blur-sm border border-border/30 shadow-kb-sm">
          <span className="text-c1 text-text-tertiary mr-1">AI 排版</span>
          {(['tree', 'timeline', 'cluster'] as LayoutMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => onApplyLayout(mode)}
              disabled={aiLayoutLoading}
              className="px-2 py-0.5 rounded-kb-sm text-c1 font-medium bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors"
            >
              {mode === 'tree' ? '树形' : mode === 'timeline' ? '时间线' : '聚类'}
            </button>
          ))}
          <button
            onClick={() => onModeChange(null)}
            className="px-1.5 py-0.5 rounded-kb-sm text-c1 text-text-tertiary hover:text-text-primary transition-colors"
          >
            取消
          </button>
        </div>
      ) : (
        <button
          onClick={() => onModeChange('tree')}
          disabled={aiLayoutLoading}
          className="flex items-center gap-1 px-2 py-1.5 rounded-kb-md bg-bg-elevated/90 backdrop-blur-sm border border-border/30 shadow-kb-sm text-c1 text-text-tertiary hover:text-brand-600 hover:border-brand-300 transition-colors disabled:opacity-50"
          title="AI 智能排版"
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
          {aiLayoutLoading ? '排版中...' : 'AI 整理'}
        </button>
      )}
    </div>
  );
}
