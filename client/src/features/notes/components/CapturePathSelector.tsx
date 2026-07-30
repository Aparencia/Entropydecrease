/**
 * 采集侧边栏 — 三路径选择器（精细/智能/录制）
 *
 * @ai-context: 从 CaptureSidebar 拆出。三条采集路径的取舍：
 * fine=逐帧 OCR（板书密集，开销高）、smart=AI 关键帧+录音分段（省资源）、
 * full_record=全程录像后离线分析。采集/处理中禁止切换路径。
 */
import { Crosshair, Sparkles, Video, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CapturePath, SessionStatus } from '@/lib/capture';

export interface CapturePathSelectorProps {
  capturePath: CapturePath;
  status: SessionStatus;
  onChange: (path: CapturePath) => void;
}

const PATH_OPTIONS: { value: CapturePath; label: string; icon: typeof Crosshair; brief: string }[] = [
  { value: 'fine', label: '精细', icon: Crosshair, brief: '逐帧截图' },
  { value: 'smart', label: '智能', icon: Sparkles, brief: 'AI关键帧' },
  { value: 'full_record', label: '录制', icon: Video, brief: '全程录像' },
];

const PATH_HINTS: Record<CapturePath, string> = {
  fine: '按固定间隔截屏，逐帧 OCR/AI 识别，适合板书密集场景',
  smart: 'AI 检测画面变化自动截图，同步录音智能分段，资源占用低',
  full_record: '录制完整课堂视频，课后 AI 生成结构化笔记',
};

export function CapturePathSelector({ capturePath, status, onChange }: CapturePathSelectorProps) {
  const locked = status === 'capturing' || status === 'processing';

  return (
    <div className="px-3 py-2 border-b border-border/20 space-y-1.5">
      <div className="flex items-center gap-1">
        {PATH_OPTIONS.map(({ value, label, icon: PathIcon, brief }) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            disabled={locked}
            className={cn(
              'flex-1 flex flex-col items-center gap-0.5 py-2 px-1 rounded-kb-sm transition-all duration-kb-fast border',
              capturePath === value
                ? 'bg-brand-50 border-brand-200/50 text-brand-600'
                : 'border-transparent text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50',
              locked && 'opacity-50 cursor-not-allowed',
            )}
          >
            <PathIcon className="w-4 h-4" strokeWidth={1.5} />
            <span className="text-b3 font-medium leading-tight">{label}</span>
            <span className={cn('text-[10px] leading-tight', capturePath === value ? 'text-brand-400' : 'text-text-tertiary/70')}>
              {brief}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-text-tertiary leading-relaxed px-0.5">
        {PATH_HINTS[capturePath]}
      </p>
    </div>
  );
}

/** 提取错误提示条 */
export function ExtractionErrorBanner({ message }: { message: string }) {
  return (
    <div
      className={cn(
        'mx-3 my-2 p-3 rounded-kb-lg',
        'bg-semantic-error/5 backdrop-blur-xl border border-semantic-error/10',
        'shadow-kb-md',
      )}
    >
      <div className="flex items-start gap-2">
        <XCircle
          className="w-4 h-4 mt-0.5 flex-shrink-0 text-semantic-error"
          strokeWidth={1.5}
        />
        <div className="flex-1 min-w-0">
          <p className="text-b3 text-semantic-error font-medium leading-snug">
            {message}
          </p>
          <p className="text-b3 text-text-tertiary mt-1">
            请在设置中检查AI网关配置
          </p>
        </div>
      </div>
    </div>
  );
}
