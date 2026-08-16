/**
 * 自由画布选择/框选状态机 hook
 * Free-canvas selection & box-select state machine hook
 *
 * @ai-context: 从 FreeCanvas 拆出。承载选中块集合、Shift+左键框选（画布坐标
 * 归一化：client 坐标 - 容器 rect + scrollLeft/Top）、右键拖拽平移与右键快捷
 * 菜单状态、拖出块取消选中的抑制标志、卸载时清理 document 级拖拽监听。
 * 框选命中测试用块的 position/size 与框区域做相交判定（高度 'auto' 按 160）。
 * 纯状态机：数据读写（dataRef）与滚动容器（scrollContainerRef）由父组件注入。
 * @ai-context: Extracted from FreeCanvas. Owns the selected-block set, shift+
 * left-drag box select (canvas coords: client - container rect + scrollLeft/Top),
 * right-drag pan + right-click context-menu state, the drag-out deselect
 * suppress flag, and cleanup of document-level drag listeners on unmount.
 * Box-select hit-test intersects block position/size against the box region
 * (height 'auto' treated as 160). Pure state machine: data (dataRef) and the
 * scroll container (scrollContainerRef) are injected by the parent.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FreeCanvasData } from '@/types/models';

/** 框选矩形（画布坐标）/ Box-select rectangle (canvas coords) */
export interface CanvasSelectionBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 右键快捷菜单位置 / Right-click context-menu position */
export interface CanvasContextMenu {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

interface UseCanvasSelectionOptions {
  dataRef: React.MutableRefObject<FreeCanvasData>;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}

/**
 * 返回选中状态与画布鼠标交互处理器。
 * Returns selection state and canvas mouse interaction handlers.
 */
export function useCanvasSelection({ dataRef, scrollContainerRef }: UseCanvasSelectionOptions) {
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());

  // 框选状态
  const [selectionBox, setSelectionBox] = useState<CanvasSelectionBox | null>(null);
  const isSelectingRef = useRef(false);
  const selectStartRef = useRef({ x: 0, y: 0 });
  const selectionBoxRef = useRef(selectionBox);
  selectionBoxRef.current = selectionBox;

  // 右键浮动菜单状态
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu | null>(null);

  // 拖出块取消选中的抑制标志
  const suppressSelectRef = useRef(false);

  // 组件卸载时清理残留的 document 级事件监听（右键拖拽中卸载）
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);

  // 选中块回调
  const handleSelectBlock = useCallback((id: string, addToSelection: boolean = false) => {
    if (suppressSelectRef.current) {
      suppressSelectRef.current = false;
      return;
    }
    setSelectedBlockIds(prev => {
      const next = new Set(addToSelection ? prev : []);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // 块释放到外部 → 取消选中
  const handleBlockReleaseOutside = useCallback(() => {
    setSelectedBlockIds(new Set());
    suppressSelectRef.current = true;
    setTimeout(() => { suppressSelectRef.current = false; }, 100);
  }, []);

  // ===== 鼠标事件统一处理 =====
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // 关闭右键菜单
    if (contextMenu) setContextMenu(null);

    // ---- 右键：拖拽平移 / 快捷菜单 ----
    if (e.button === 2) {
      e.preventDefault();
      const container = scrollContainerRef.current;
      if (!container) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startScrollLeft = container.scrollLeft;
      const startScrollTop = container.scrollTop;
      let hasMoved = false;

      container.style.cursor = 'grabbing';

      const handleMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
        container.scrollLeft = startScrollLeft - dx;
        container.scrollTop = startScrollTop - dy;
      };

      const handleMouseUp = () => {
        container.style.cursor = '';
        dragCleanupRef.current = null;
        // 未拖动 → 显示右键快捷菜单
        if (!hasMoved) {
          const rect = container.getBoundingClientRect();
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            canvasX: e.clientX - rect.left + startScrollLeft,
            canvasY: e.clientY - rect.top + startScrollTop,
          });
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      dragCleanupRef.current = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        container.style.cursor = '';
      };
      return;
    }

    // ---- Shift + 左键：框选 ----
    if (e.button === 0 && e.shiftKey) {
      e.preventDefault();
      isSelectingRef.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      const scrollContainer = scrollContainerRef.current;
      const scrollLeft = scrollContainer?.scrollLeft ?? 0;
      const scrollTop = scrollContainer?.scrollTop ?? 0;
      selectStartRef.current = {
        x: e.clientX - rect.left + scrollLeft,
        y: e.clientY - rect.top + scrollTop,
      };
      setSelectionBox({
        x1: selectStartRef.current.x,
        y1: selectStartRef.current.y,
        x2: selectStartRef.current.x,
        y2: selectStartRef.current.y,
      });

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isSelectingRef.current) return;
        const x2 = ev.clientX - rect.left + scrollLeft;
        const y2 = ev.clientY - rect.top + scrollTop;
        setSelectionBox({ x1: selectStartRef.current.x, y1: selectStartRef.current.y, x2, y2 });
      };

      const handleMouseUp = () => {
        isSelectingRef.current = false;
        const box = selectionBoxRef.current;
        if (box) {
          const minX = Math.min(box.x1, box.x2);
          const maxX = Math.max(box.x1, box.x2);
          const minY = Math.min(box.y1, box.y2);
          const maxY = Math.max(box.y1, box.y2);

          const current = dataRef.current;
          const ids = new Set<string>();
          for (const block of current.blocks) {
            const bx = block.position.x;
            const by = block.position.y;
            const bw = block.size.width;
            const bh = typeof block.size.height === 'number' ? block.size.height : 160;
            if (bx + bw > minX && bx < maxX && by + bh > minY && by < maxY) {
              ids.add(block.id);
            }
          }
          setSelectedBlockIds(ids);
        }
        setSelectionBox(null);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return;
    }

    // ---- 普通左键：清除选中（仅空白区域；块内保留编辑器焦点，否则点击文本块无法输入） ----
    if (e.button === 0 && !e.shiftKey) {
      const insideBlock = !!(e.target as HTMLElement).closest?.('[data-freeblock]');
      if (!insideBlock) {
        setSelectedBlockIds(new Set());
        (document.activeElement as HTMLElement)?.blur?.();
        suppressSelectRef.current = true;
        setTimeout(() => { suppressSelectRef.current = false; }, 100);
      }
    }
  };

  // 内层画布 mouseup：块内按下拖到外部释放 → 取消选中
  const handleInnerCanvasMouseUp = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const isInsideBlock = !!target.closest('[data-freeblock]');
    if (!isInsideBlock && suppressSelectRef.current) {
      setSelectedBlockIds(new Set());
      suppressSelectRef.current = false;
    }
  };

  return {
    selectedBlockIds, setSelectedBlockIds,
    selectionBox, contextMenu, setContextMenu,
    handleSelectBlock, handleBlockReleaseOutside,
    handleCanvasMouseDown, handleInnerCanvasMouseUp,
  };
}
