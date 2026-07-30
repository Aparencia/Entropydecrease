/**
 * CourseInfoCard — 课程信息卡片（右侧空态区）
 * Course info editable card rendered in the right-side idle guide area.
 *
 * @ai-context: 原左栏 CourseInfoSection 迁出至右侧空态底部，启动采集前顺手
 * 填写课程名称/学科/AI 识别开关；detectedBy 徽标标示信息来源（ai/窗口标题/手动）。
 * @ai-context: Moved out of the left rail to keep it within one screen height;
 * rendered as an editable card at the bottom of the idle guide panel.
 */
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CourseMeta } from '@/lib/capture';
import { SUBJECT_OPTIONS } from '../constants';

interface CourseInfoCardProps {
  courseMeta: CourseMeta;
  onChange: (meta: CourseMeta) => void;
  aiDetectEnabled: boolean;
  onAiDetectToggle: (enabled: boolean) => void;
}

export function CourseInfoCard({ courseMeta, onChange, aiDetectEnabled, onAiDetectToggle }: CourseInfoCardProps) {
  return (
    <div className="rounded-kb-lg border border-border/20 bg-bg-secondary/40 p-4 space-y-3">
      <div className="flex items-center gap-2 text-b3 text-text-tertiary">
        <Sparkles className="w-4 h-4" strokeWidth={1.5} />
        <span className="font-medium">课程信息</span>
        {courseMeta.detectedBy && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-kb-xs bg-brand-50 text-brand-500">
            {courseMeta.detectedBy === 'ai' ? 'AI 识别' : courseMeta.detectedBy === 'window_title' ? '自动提取' : '手动'}
          </span>
        )}
      </div>
      <div>
        <label className="text-b3 text-text-tertiary mb-1 block">课程名称</label>
        <input
          type="text"
          value={courseMeta.courseName ?? ''}
          onChange={(e) => onChange({ ...courseMeta, courseName: e.target.value || undefined, detectedBy: 'manual' })}
          placeholder="如：高等数学、数据结构..."
          className="w-full px-2.5 py-1.5 rounded-kb-sm text-b3 bg-bg-secondary border border-border/30 text-text-primary placeholder:text-text-tertiary/50 focus:outline-none focus:ring-1 focus:ring-brand-300"
        />
      </div>
      <div>
        <label className="text-b3 text-text-tertiary mb-1 block">学科</label>
        <div className="flex gap-1 flex-wrap">
          {SUBJECT_OPTIONS.map(({ value, label }) => (
            <button key={value} onClick={() => onChange({ ...courseMeta, subject: value, detectedBy: 'manual' })}
              className={cn(
                'px-2 py-1 rounded-kb-sm text-[11px] font-medium transition-all',
                courseMeta.subject === value
                  ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                  : 'text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary',
              )}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* AI 识别开关 */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={aiDetectEnabled}
          onChange={(e) => onAiDetectToggle(e.target.checked)}
          className="w-3.5 h-3.5 rounded accent-brand-600"
        />
        <span className="text-b3 text-text-tertiary">采集开始时 AI 自动识别课程</span>
      </label>
    </div>
  );
}
