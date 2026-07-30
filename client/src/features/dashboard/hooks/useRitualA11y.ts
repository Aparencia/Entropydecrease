/**
 * useRitualA11y — 仪式层键盘与焦点管理 Hook / Keyboard & focus management
 *
 * @ai-context: RIT-24 a11y——Esc=跳过（仅本次）、Enter=下一步（输入控件
 * 与按钮内不拦截）、Tab 焦点陷阱（循环于仪式卡片内）、挂载时聚焦卡片。
 * 从 StartupRitual 容器抽离以满足容器 ≤120 行的验收约束。
 * @ai-context: RIT-24 accessibility: Esc skips (once), Enter advances
 * (not inside fields/buttons), Tab focus trap, initial card focus.
 * Extracted from the container to keep it within the 120-line budget.
 */
import { useEffect, useCallback, type RefObject, type KeyboardEvent } from 'react';

const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useRitualA11y(
  cardRef: RefObject<HTMLDivElement | null>,
  onEscape: () => void,
  onEnter: () => void,
) {
  // 挂载时聚焦卡片（tabIndex=-1 容器）
  useEffect(() => { cardRef.current?.focus(); }, [cardRef]);

  return useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onEscape(); return; }

    const target = e.target as HTMLElement;
    const inField = ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
    if (e.key === 'Enter' && !inField && target.tagName !== 'BUTTON') {
      e.preventDefault(); onEnter(); return;
    }

    // Tab 焦点陷阱：首尾元素间循环
    if (e.key === 'Tab' && cardRef.current) {
      const nodes = cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [cardRef, onEscape, onEnter]);
}
