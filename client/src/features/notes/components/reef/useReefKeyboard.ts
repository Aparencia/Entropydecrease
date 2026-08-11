/**
 * 沉浸视图键盘导航 hook
 * Immersive view keyboard navigation hook
 *
 * @ai-context: Enter 打开选中笔记、方向键在卡片间循环切换选中（按活跃度排序）。
 * 输入框聚焦时跳过（与 AppLayout 全局快捷键同款防护）。ESC 不处理——留给
 * AppLayout 的模块退出逻辑，避免双重拦截。
 * @ai-context: Enter opens the selected note; arrow keys cycle selection
 * across cards (sorted by activity). Skips when an input is focused.
 * ESC is intentionally left to AppLayout's module-exit handling.
 */
import { useEffect, useRef } from 'react';
import type { ReefNote } from './reefTypes';

interface UseReefKeyboardOptions {
  /** 键盘导航顺序（活跃度排序的卡片列表） */
  cards: ReefNote[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  enabled?: boolean;
}

export function useReefKeyboard({
  cards, selectedId, onSelect, onOpen, enabled = true,
}: UseReefKeyboardOptions): void {
  // ref 缓存最新闭包（listener 只注册一次，避免高频重建）
  const stateRef = useRef({ cards, selectedId, onSelect, onOpen, enabled });
  stateRef.current = { cards, selectedId, onSelect, onOpen, enabled };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (!s.enabled || s.cards.length === 0) return;
      // 输入焦点不拦截（搜索框/重命名框内方向键保留原生行为）
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const idx = s.cards.findIndex((c) => c.id === s.selectedId);
      if (e.key === 'Enter') {
        if (s.selectedId) {
          e.preventDefault();
          s.onOpen(s.selectedId);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = idx <= 0 ? s.cards.length - 1 : idx - 1;
        s.onSelect(s.cards[next].id);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = idx === -1 ? 0 : (idx + 1) % s.cards.length;
        s.onSelect(s.cards[next].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export default useReefKeyboard;
