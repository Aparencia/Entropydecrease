/**
 * SettingsCollapse — 采集设置折叠区
 * Collapsible capture settings (screenshot interval + recognition language).
 *
 * @ai-context: 左栏配置态组件，默认收起以保证左栏一屏容纳；收起时标题行
 * 显示当前配置摘要（如 "5s · 中文"），展开后提供滑块与语言切换。
 * @ai-context: Left-rail config-stage component, collapsed by default to keep
 * the rail within one screen; header shows a summary of current values.
 */
import { useState } from 'react';
import { Settings2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CaptureSidebarConfig } from '@/lib/capture';
import { LANGUAGE_OPTIONS } from '../constants';

interface SettingsCollapseProps {
  config: CaptureSidebarConfig;
  onChange: (patch: Partial<CaptureSidebarConfig>) => void;
}

export function SettingsCollapse({ config, onChange }: SettingsCollapseProps) {
  const [open, setOpen] = useState(false);
  const intervalSec = config.screenshotInterval / 1000;
  const languageLabel = LANGUAGE_OPTIONS.find((l) => l.value === config.language)?.label ?? '';
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="pt-2 border-t border-border/20">
      {/* 折叠标题行：收起时展示配置摘要 */}
      <button onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-2 text-b3 text-text-tertiary hover:text-text-secondary transition-colors">
        <Settings2 className="w-4 h-4" strokeWidth={1.5} />
        <span className="font-medium">采集设置</span>
        {!open && (
          <span className="ml-auto text-[11px] text-text-tertiary/80">{intervalSec}s · {languageLabel}</span>
        )}
        <Chevron className={cn('w-3.5 h-3.5', open && 'ml-auto')} strokeWidth={1.5} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-b3 text-text-tertiary mb-1 block">截图间隔: {intervalSec}s</label>
            <input type="range" min={1} max={30} value={intervalSec}
              onChange={(e) => onChange({ screenshotInterval: Number(e.target.value) * 1000 })}
              className="w-full accent-brand-600" />
          </div>
          <div>
            <label className="text-b3 text-text-tertiary mb-1 block">识别语言</label>
            <div className="flex gap-1">
              {LANGUAGE_OPTIONS.map(({ value, label }) => (
                <button key={value} onClick={() => onChange({ language: value })}
                  className={cn(
                    'flex-1 py-1.5 rounded-kb-sm text-b3 font-medium transition-all',
                    config.language === value
                      ? 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/50'
                      : 'text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary',
                  )}>
                  {label}
                </button>
              ))}
            </div>
            {/* P1-5：混说说明（本地双语模型直接支持；云端走语言检测） */}
            {config.language === 'mixed' && (
              <p className="text-c1 text-text-tertiary mt-1">
                中英混说：本地双语模型直接支持；云端转写走语言检测
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
