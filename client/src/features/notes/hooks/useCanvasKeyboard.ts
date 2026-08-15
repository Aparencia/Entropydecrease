/**
 * 自由画布键盘快捷键 hook
 * Free-canvas keyboard shortcuts hook
 *
 * @ai-context: 从 FreeCanvas 拆出。Shift+A 切换操作面板、Ctrl+D 复制选中块、
 * Delete/Backspace 删除选中块（均仅非编辑器/输入框聚焦时生效）、Escape 依次
 * 关闭右键菜单 → 关闭面板 → 取消选中。依赖（选中集/CRUD/面板开关/菜单状态）
 * 由父组件注入，effect 每次渲染重建监听以保证闭包最新。
 * @ai-context: Extracted from FreeCanvas. Shift+A toggles the palette, Ctrl+D
 * duplicates the selected block, Delete/Backspace deletes the selection (all
 * only when no editor/input is focused), Escape closes the context menu →
 * closes the palette → clears selection. Deps (selection/CRUD/palette/menu)
 * are injected by the parent; the effect re-registers the listener each render
 * to keep closures fresh.
 */
import { useEffect } from 'react';
import type { CanvasContextMenu } from './useCanvasSelection';

interface UseCanvasKeyboardOptions {
  selectedBlockIds: Set<string>;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  paletteOpen: boolean;
  setPaletteOpen: React.Dispatch<React.SetStateAction<boolean>>;
  contextMenu: CanvasContextMenu | null;
  setContextMenu: (v: CanvasContextMenu | null) => void;
  handleDeleteSelected: () => void;
  handleDuplicateBlock: (id: string) => void;
}

/**
 * 注册画布键盘快捷键（无返回值）。
 * Registers canvas keyboard shortcuts (no return value).
 */
export function useCanvasKeyboard({
  selectedBlockIds, setSelectedBlockIds,
  paletteOpen, setPaletteOpen,
  contextMenu, setContextMenu,
  handleDeleteSelected, handleDuplicateBlock,
}: UseCanvasKeyboardOptions) {
  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInEditor = document.activeElement?.closest('.ProseMirror') ||
                         document.activeElement?.closest('[contenteditable]') ||
                         document.activeElement?.tagName === 'INPUT' ||
                         document.activeElement?.tagName === 'TEXTAREA';

      // Shift+A 切换面板（仅非编辑器聚焦时）
      if (e.shiftKey && (e.key === 'A' || e.key === 'a') && !isInEditor) {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
        return;
      }

      // Ctrl+D 复制选中块（仅非编辑器聚焦时）
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D') && !isInEditor && selectedBlockIds.size > 0) {
        e.preventDefault();
        const firstId = selectedBlockIds.values().next().value;
        if (!firstId) return;
        handleDuplicateBlock(firstId);
        return;
      }

      // Delete/Backspace 删除选中块（仅非编辑器聚焦时）
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInEditor && selectedBlockIds.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
        return;
      }

      // Escape 取消选中 / 关闭面板 / 关闭右键菜单
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
        } else if (paletteOpen) {
          setPaletteOpen(false);
        } else {
          setSelectedBlockIds(new Set());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedBlockIds, handleDeleteSelected, paletteOpen, handleDuplicateBlock, contextMenu, setPaletteOpen, setContextMenu, setSelectedBlockIds]);
}
