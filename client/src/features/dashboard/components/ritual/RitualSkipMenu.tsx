/**
 * RitualSkipMenu — 跳过入口三级下拉（本次 / 今天 / 永久）
 * Skip menu with three scopes (once / today / forever)
 *
 * @ai-context: RIT-25——补齐"不再显示"UI 缺口。三个选项分别映射
 * RitualSkipScope：once（仅关闭）、today（skipToday 持久化）、
 * forever（enabled=false 持久化），持久化由页面层执行。
 * @ai-context: RIT-25 fills the missing "don't show again" entry.
 * Options map to RitualSkipScope; persistence happens at page level.
 */
import { useState, useRef, useEffect } from 'react';
import { SkipForward } from 'lucide-react';
import type { RitualSkipScope } from '../../types';

interface Props {
  onSkip: (scope: RitualSkipScope) => void;
}

const OPTIONS: { scope: RitualSkipScope; label: string }[] = [
  { scope: 'once',    label: '仅本次跳过' },
  { scope: 'today',   label: '今天不再显示' },
  { scope: 'forever', label: '永久关闭仪式' },
];

export function RitualSkipMenu({ onSkip }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击菜单外部时收起
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={rootRef} className="absolute top-4 right-4 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="跳过仪式"
        className="p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary/50 transition-all duration-200"
      >
        <SkipForward className="w-4 h-4" strokeWidth={1.5} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-36 py-1 rounded-kb-md bg-bg-elevated border border-border/60 shadow-kb-md"
        >
          {OPTIONS.map(({ scope, label }) => (
            <button
              key={scope}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onSkip(scope); }}
              className="w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-bg-tertiary/50 hover:text-text-primary transition-colors duration-150"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
