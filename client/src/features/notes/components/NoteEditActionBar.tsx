/**
 * 笔记编辑页 AI 工具行（图片提取 / 信息图 / 滚书背诵 / 阅读模式）
 * Note editor AI action bar
 *
 * @ai-context: 从 NoteEditPage 拆出。仅文本类模板（非 free/cornell/mindmap）
 * 显示（守卫条件保留在页面层）。纯展示组件：动作回调全部由页面注入（隐藏
 * input 点击、AI 调用、弹窗开关），自身无业务逻辑。
 * @ai-context: Extracted from NoteEditPage. Only rendered for text templates
 * (guard stays in the page). Pure presentational component: every action
 * callback is injected by the page (hidden-input click, AI calls, dialog
 * toggles); no business logic here.
 */
import { cn } from '@/lib/utils';
import { ScanText, BarChart3, BookMarked, BookOpen } from 'lucide-react';

interface NoteEditActionBarProps {
  onPickVision: () => void;
  visionExtracting: boolean;
  onGenerateInfographic: () => void;
  infographicLoading: boolean;
  onOpenRollingRecall: () => void;
  readingMode: boolean;
  onToggleReadingMode: () => void;
}

export function NoteEditActionBar({
  onPickVision,
  visionExtracting,
  onGenerateInfographic,
  infographicLoading,
  onOpenRollingRecall,
  readingMode,
  onToggleReadingMode,
}: NoteEditActionBarProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/20 bg-bg-elevated/20">
      <button
        onClick={onPickVision}
        disabled={visionExtracting}
        className="flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 text-text-tertiary transition-colors hover:text-brand-600 hover:bg-brand-500/10 disabled:opacity-50"
        title="选择截图/图片，AI 提取文字与公式后插入笔记"
      >
        <ScanText className="w-3.5 h-3.5" strokeWidth={1.5} />
        {visionExtracting ? '提取中…' : 'AI 提取图片文字'}
      </button>
      <button
        onClick={onGenerateInfographic}
        disabled={infographicLoading}
        className="flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 text-text-tertiary transition-colors hover:text-brand-600 hover:bg-brand-500/10 disabled:opacity-50"
        title="AI 将笔记内容转化为结构化信息图"
      >
        <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} />
        {infographicLoading ? '生成中…' : '生成信息图'}
      </button>
      <button
        onClick={onOpenRollingRecall}
        className="flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 text-text-tertiary transition-colors hover:text-brand-600 hover:bg-brand-500/10"
        title="滚书背诵：4 轮渐进式回忆（通读→精读→闭卷→默写）"
      >
        <BookMarked className="w-3.5 h-3.5" strokeWidth={1.5} />
        滚书背诵
      </button>
      <button
        onClick={onToggleReadingMode}
        className={cn(
          'flex items-center gap-1.5 rounded-kb-sm px-2.5 py-1 text-c1 transition-colors',
          readingMode
            ? 'text-brand-600 bg-brand-500/10'
            : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-500/10',
        )}
        title="阅读模式：自适应排版 + 阅读引导线，专注阅读"
      >
        <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
        {readingMode ? '退出阅读' : '阅读模式'}
      </button>
    </div>
  );
}
