/**
 * @ai-context: 通用组件：CaptureSettingsPanel。
 */
import { useState } from 'react';
import { Settings2, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CaptureSidebarConfig } from '@/lib/capture';
import type { SettingsPanelProps } from './types';

// ================================================================
// 设置区常量
// ================================================================

const LANGUAGE_OPTIONS: { value: CaptureSidebarConfig['language']; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  { value: 'mixed', label: '混合' },
];

// ================================================================
// CaptureSettingsPanel 组件
// ================================================================

export function CaptureSettingsPanel({ config, onChange }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-border/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2.5 text-b2',
          'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50',
          'transition-colors duration-kb-fast',
        )}
      >
        <Settings2 className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        <span className="font-medium flex-1 text-left">设置</span>
        {open ? (
          <ChevronDown className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* 截图间隔 */}
          <div>
            <label className="text-b3 text-text-tertiary mb-1 block">截图间隔 (秒)</label>
            <input
              type="range"
              min={1}
              max={30}
              value={config.screenshotInterval / 1000}
              onChange={(e) => onChange({ screenshotInterval: Number(e.target.value) * 1000 })}
              className="w-full accent-brand-600"
            />
            <span className="text-b3 text-text-secondary">{config.screenshotInterval / 1000}s</span>
          </div>

          {/* 语言选择 */}
          <div>
            <label className="text-b3 text-text-tertiary mb-1 block">识别语言</label>
            <div className="flex gap-1">
              {LANGUAGE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onChange({ language: value })}
                  className={cn(
                    'flex-1 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
                    config.language === value
                      ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                      : 'text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 自动插入开关 */}
          <div className="flex items-center justify-between">
            <span className="text-b3 text-text-secondary">自动插入笔记</span>
            <button
              onClick={() => onChange({ autoInsert: !config.autoInsert })}
              className={cn(
                'relative w-9 h-5 rounded-kb-full transition-colors duration-kb-fast',
                config.autoInsert ? 'bg-brand-600' : 'bg-bg-tertiary',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-kb-full bg-white shadow-sm',
                  'transition-transform duration-kb-fast',
                  config.autoInsert && 'translate-x-4',
                )}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
