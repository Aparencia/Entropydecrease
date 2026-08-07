/**
 * 深潜设置页共享 UI 原语
 *
 * @ai-context: 下潜档案版设置页共用的 Toggle / SettingRow。
 * 拆分为独立文件以控制页面行数（AI 编程规范 §1：单文件 ≤300 行）。
 *
 * @ai-context: Shared UI primitives for the pomodoro settings page sections.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 开关组件 */
export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative w-11 h-6 rounded-kb-full transition-colors duration-kb-fast ease-kb-default',
        'flex-shrink-0',
        'hover:scale-[1.02] active:scale-[0.98]',
        checked ? 'bg-brand-600' : 'bg-bg-tertiary border border-border/50',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-5 h-5 rounded-kb-full bg-white shadow-kb-sm',
          'transition-transform duration-kb-fast ease-kb-default',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

/** 设置行：标签 + 说明 + 控件 */
export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-kb-sm">
      <div className="flex-1 min-w-0">
        <p className="text-b2 font-medium text-text-primary">{label}</p>
        {description && (
          <p className="text-c1 text-text-tertiary mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0 ml-kb-md">{children}</div>
    </div>
  );
}
