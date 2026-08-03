/**
 * 牌组详情 — 顶栏（返回/牌组名/添加/AI 生成/导出）
 *
 * @ai-context: 从 DeckDetailPage 拆出。牌组色点取自 deck.color；AI 生成
 * 按钮在请求中显示思考指示器；导出按钮导出后触发浏览器下载（.json）。
 */
import { Button } from '@/components/ui';
import { Tip } from '@/components/ui/Tip';
import { ArrowLeft, Sparkles, Plus, Loader2, Download } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';

export interface DeckDetailHeaderProps {
  deckName: string | undefined;
  deckColor: string | undefined;
  aiLoading: boolean;
  exporting: boolean;
  onBack: () => void;
  onAddCard: () => void;
  onOpenAIGenerate: () => void;
  onExport: () => void;
}

export function DeckDetailHeader({
  deckName, deckColor, aiLoading, exporting,
  onBack, onAddCard, onOpenAIGenerate, onExport,
}: DeckDetailHeaderProps) {
  return (
    <div className="flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50 flex-shrink-0">
      {/* 返回按钮，带 tooltip */}
      <Tip text="返回">
      <button
        onClick={onBack}
        className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
      >
        <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
      </button>
      </Tip>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {deckColor && (
          <span
            className="w-2.5 h-2.5 rounded-kb-full flex-shrink-0"
            style={{ backgroundColor: deckColor }}
          />
        )}
        <h1 className="text-h2 font-semibold text-text-primary truncate">
          {deckName ?? '加载中…'}
        </h1>
      </div>
      <Button size="sm" icon={<Plus className="w-icon-sm h-icon-sm" strokeWidth={2} />} onClick={onAddCard}>
        添加卡片
      </Button>

      <Button
        size="sm"
        variant="secondary"
        icon={aiLoading ? <AIThinkingIndicator size={4} gap={3} /> : <Sparkles className="w-icon-sm h-icon-sm" />}
        onClick={onOpenAIGenerate}
      >
        AI 生成闪卡
      </Button>

      {/* 导出牌组按钮，升级原生 title 为 Tip 组件 */}
      <Tip text="导出牌组">
      <button
        onClick={onExport}
        disabled={exporting}
        className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast disabled:opacity-50"
        aria-label="导出牌组"
      >
        {exporting
          ? <Loader2 className="w-icon-sm h-icon-sm animate-spin" strokeWidth={1.5} />
          : <Download className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
      </button>
      </Tip>
    </div>
  );
}
