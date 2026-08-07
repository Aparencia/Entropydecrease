/**
 * 视觉提取模式选择器（P8）
 * Vision mode selector
 *
 * @ai-context: 课堂助手配置区的视觉提取模式选择——写入 CaptureManager →
 * 截图消息 metadata.visionMode → VisionWorker 按模式提取（text/formula/
 * diagram/code/full）。auto=让 VisionWorker 默认策略（全量提取）。
 *
 * @ai-context: Vision extraction mode selector for the classroom assistant;
 * feeds message.metadata.visionMode consumed by VisionWorker.
 */
import { cn } from '@/lib/utils';

export type VisionMode = 'auto' | 'text' | 'formula' | 'diagram' | 'code' | 'full';

const MODES: Array<{ value: VisionMode; label: string; hint: string }> = [
  { value: 'auto', label: '自动', hint: '默认全量提取' },
  { value: 'text', label: '文字', hint: '侧重板书文字' },
  { value: 'formula', label: '公式', hint: '侧重数学公式' },
  { value: 'diagram', label: '图表', hint: '侧重图形图表' },
  { value: 'code', label: '代码', hint: '侧重代码内容' },
  { value: 'full', label: '全文', hint: '完整提取全部内容' },
];

export function VisionModeSelector({
  value,
  onChange,
}: {
  value: VisionMode;
  onChange: (mode: VisionMode) => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-border/20">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-text-secondary">视觉提取</span>
        <span className="text-[10px] text-text-tertiary">
          {MODES.find((m) => m.value === value)?.hint}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => onChange(m.value)}
            className={cn(
              'px-2.5 py-1 rounded-kb-sm text-[11px] transition-all active:scale-95',
              value === m.value
                ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400 border border-brand-500/30 font-medium'
                : 'text-text-tertiary hover:text-text-secondary border border-transparent hover:bg-bg-tertiary/40',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
