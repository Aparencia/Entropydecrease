/**
 * PathModeSelector — 采集路径与采集模式选择器
 * Capture path (fine/smart/full_record) and mode (vision/audio/mixed) selector.
 *
 * @ai-context: 左栏配置态组件。为保证左栏一屏容纳，此处只保留选项按钮本身，
 * 详细说明文案统一移至右侧空态说明卡（IdleGuidePanel），文案源自 constants.ts。
 * @ai-context: Left-rail config-stage component. Option details are rendered by
 * the right-side IdleGuidePanel to keep the rail within one screen height.
 */
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CaptureMode, CapturePath } from '@/lib/capture';
import { PATH_OPTIONS, MODE_OPTIONS } from '../constants';

interface PathModeSelectorProps {
  capturePath: CapturePath;
  onPathChange: (path: CapturePath) => void;
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  disabled?: boolean;
}

export function PathModeSelector({ capturePath, onPathChange, mode, onModeChange, disabled }: PathModeSelectorProps) {
  return (
    <div className="space-y-4">
      {/* 采集路径 */}
      <div>
        <span className="text-b3 font-medium text-text-tertiary block mb-2">采集路径</span>
        <div className="flex flex-col gap-1.5">
          {PATH_OPTIONS.map(({ value, label, icon: PathIcon, brief }) => (
            <button key={value} onClick={() => onPathChange(value)} disabled={disabled}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-kb-md text-left transition-all border',
                capturePath === value
                  ? 'bg-brand-50 border-brand-200/60 shadow-kb-sm'
                  : 'border-transparent hover:bg-bg-tertiary/50',
                disabled && 'opacity-50 cursor-not-allowed',
              )}>
              <PathIcon className={cn('w-4 h-4 flex-shrink-0', capturePath === value ? 'text-brand-600' : 'text-text-tertiary')} strokeWidth={1.5} />
              <span className={cn('text-b3 font-medium', capturePath === value ? 'text-brand-700' : 'text-text-secondary')}>
                {label}
              </span>
              <span className={cn('text-[11px]', capturePath === value ? 'text-brand-500' : 'text-text-tertiary')}>
                {brief}
              </span>
              {capturePath === value && (
                <CheckCircle2 className="ml-auto w-4 h-4 text-brand-500 flex-shrink-0" strokeWidth={1.5} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 采集模式 */}
      <div>
        <span className="text-b3 font-medium text-text-tertiary block mb-2">采集模式</span>
        <div className="flex items-center gap-1">
          {MODE_OPTIONS.map(({ value, label, icon: ModeIcon }) => (
            <button key={value} onClick={() => onModeChange(value)} disabled={disabled}
              className={cn(
                'flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-kb-sm text-b3 font-medium transition-all',
                mode === value
                  ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                  : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50',
                disabled && 'opacity-50 cursor-not-allowed',
              )}>
              <ModeIcon className="w-3.5 h-3.5" strokeWidth={1.5} /> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
