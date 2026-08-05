/**
 * @ai-context: 自由画布组件（巨型，待拆分）：手写/绘图白板，供笔记批注与费曼讲解涂鸦。
 */
import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Copy, Eraser, CheckSquare } from 'lucide-react';
import FreeTextBlock from './FreeTextBlock';
import { FreeCanvasOverlays } from './FreeCanvasOverlays';
import { InkToolbar } from './canvas/InkToolbar';
import { InkLayer } from './canvas/InkLayer';
import { useInkDrawing, type InkTool } from '../lib/canvas/useInkDrawing';
import type { FreeCanvasData, FreeCanvasBlock, InkStroke, InkPoint } from '@/types/models';

interface FreeCanvasProps {
  content: FreeCanvasData | null;
  onChange: (data: FreeCanvasData) => void;
}

const DEFAULT_CANVAS_WIDTH = 3000;
const DEFAULT_CANVAS_HEIGHT = 3000;

function buildDefaultData(): FreeCanvasData {
  return {
    blocks: [],
    canvasWidth: DEFAULT_CANVAS_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
  };
}

export default function FreeCanvas({ content, onChange }: FreeCanvasProps) {
  const raw = content ?? buildDefaultData();
  const data: FreeCanvasData = {
    blocks: raw.blocks ?? [],
    canvasWidth: raw.canvasWidth || DEFAULT_CANVAS_WIDTH,
    canvasHeight: raw.canvasHeight || DEFAULT_CANVAS_HEIGHT,
  };

  const dataRef = useRef(data);
  dataRef.current = data;

  const emitChange = useCallback(
    (next: FreeCanvasData) => {
      onChange(next);
    },
    [onChange],
  );

  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);

  // 阶段三：墨迹工具状态 / ink tool state
  const [inkTool, setInkTool] = useState<InkTool>('select');
  const [inkColor, setInkColor] = useState('#1e293b');
  const [inkWidth, setInkWidth] = useState(4);
  const innerCanvasRef = useRef<HTMLDivElement>(null);

  // 阶段三：墨迹笔画数据与绘制 / ink strokes data & drawing
  const strokes = data.strokes ?? [];

  const getCanvasPoint = useCallback((clientX: number, clientY: number): InkPoint => {
    const rect = innerCanvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handleCommitStroke = useCallback((stroke: InkStroke) => {
    const current = dataRef.current;
    emitChange({ ...current, strokes: [...(current.strokes ?? []), stroke] });
  }, [emitChange]);

  const handleErase = useCallback((predicate: (s: InkStroke) => boolean) => {
    const current = dataRef.current;
    const prev = current.strokes ?? [];
    const remaining = prev.filter((s) => !predicate(s));
    if (remaining.length !== prev.length) {
      emitChange({ ...current, strokes: remaining });
    }
  }, [emitChange]);

  const { currentStroke, handlePointerDown, handlePointerMove, handlePointerUp } = useInkDrawing({
    tool: inkTool,
    color: inkColor,
    width: inkWidth,
    getCanvasPoint,
    onCommitStroke: handleCommitStroke,
    onErase: handleErase,
  });

  // 框选状态
  const [selectionBox, setSelectionBox] = useState<{x1: number; y1: number; x2: number; y2: number} | null>(null);
  const isSelectingRef = useRef(false);
  const selectStartRef = useRef({ x: 0, y: 0 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectionBoxRef = useRef(selectionBox);
  selectionBoxRef.current = selectionBox;

  // 右键浮动菜单状态
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);

  // 拖出块取消选中的抑制标志
  const suppressSelectRef = useRef(false);

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

  // 在指定画布坐标添加新块
  const addBlockAtPosition = useCallback((canvasX: number, canvasY: number) => {
    const current = dataRef.current;
    const newBlock: FreeCanvasBlock = {
      id: crypto.randomUUID(),
      type: 'text',
      content: '',
      position: { x: canvasX - 140, y: canvasY - 20 },
      size: { width: 280, height: 160 },
    };
    emitChange({ ...current, blocks: [...current.blocks, newBlock] });
  }, [emitChange]);

  // 删除选中块
  const handleDeleteSelected = useCallback(() => {
    if (selectedBlockIds.size === 0) return;
    const current = dataRef.current;
    emitChange({
      ...current,
      blocks: current.blocks.filter(b => !selectedBlockIds.has(b.id)),
    });
    setSelectedBlockIds(new Set());
  }, [selectedBlockIds, emitChange]);

  // 复制块
  const handleDuplicateBlock = useCallback(
    (id: string) => {
      const current = dataRef.current;
      const source = current.blocks.find(b => b.id === id);
      if (!source) return;
      const newBlock = {
        ...source,
        id: crypto.randomUUID(),
        position: { x: source.position.x + 30, y: source.position.y + 30 },
      };
      emitChange({ ...current, blocks: [...current.blocks, newBlock] });
      setSelectedBlockIds(new Set([newBlock.id]));
    },
    [emitChange],
  );

  // 双击空白区域添加文本块
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (inkTool !== 'select') return; // 绘制工具下不新建文本块
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const canvasX = e.clientX - rect.left + scrollContainer.scrollLeft;
    const canvasY = e.clientY - rect.top + scrollContainer.scrollTop;

    addBlockAtPosition(canvasX, canvasY);
  };

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

  // 移动块
  const handleMove = useCallback(
    (id: string, x: number, y: number) => {
      const current = dataRef.current;
      emitChange({
        ...current,
        blocks: current.blocks.map((b) =>
          b.id === id ? { ...b, position: { x, y } } : b,
        ),
      });
    },
    [emitChange],
  );

  // 内容变更
  const handleContentChange = useCallback(
    (id: string, blockContent: string) => {
      const current = dataRef.current;
      emitChange({
        ...current,
        blocks: current.blocks.map((b) =>
          b.id === id ? { ...b, content: blockContent } : b,
        ),
      });
    },
    [emitChange],
  );

  // 删除块
  const handleDelete = useCallback(
    (id: string) => {
      const current = dataRef.current;
      emitChange({
        ...current,
        blocks: current.blocks.filter((b) => b.id !== id),
      });
      setSelectedBlockIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [emitChange],
  );

  // 调整块大小
  const handleResize = useCallback(
    (id: string, width: number, height: number) => {
      const current = dataRef.current;
      emitChange({
        ...current,
        blocks: current.blocks.map((b) =>
          b.id === id ? { ...b, size: { width, height } } : b,
        ),
      });
    },
    [emitChange],
  );

  // 右键菜单操作列表
  const contextMenuActions = useMemo(() => [
    {
      id: 'add-text',
      label: '添加新文本',
      icon: Plus,
      disabled: false,
      execute: () => {
        if (contextMenu) addBlockAtPosition(contextMenu.canvasX, contextMenu.canvasY);
      },
    },
    {
      id: 'select-all',
      label: '全选',
      icon: CheckSquare,
      disabled: data.blocks.length === 0,
      execute: () => {
        setSelectedBlockIds(new Set(data.blocks.map(b => b.id)));
      },
    },
    {
      id: 'delete-selected',
      label: '删除选中',
      icon: Trash2,
      disabled: selectedBlockIds.size === 0,
      execute: () => handleDeleteSelected(),
    },
    {
      id: 'duplicate-selected',
      label: '复制',
      icon: Copy,
      disabled: selectedBlockIds.size === 0,
      execute: () => {
        const firstId = selectedBlockIds.values().next().value;
        if (!firstId) return;
        handleDuplicateBlock(firstId);
      },
    },
    {
      id: 'clear-canvas',
      label: '清空画布',
      icon: Eraser,
      disabled: data.blocks.length === 0,
      execute: () => {
        emitChange({ ...dataRef.current, blocks: [] });
        setSelectedBlockIds(new Set());
      },
    },
  ], [contextMenu, data.blocks, selectedBlockIds, emitChange, handleDeleteSelected, addBlockAtPosition, handleDuplicateBlock]);

  // 操作面板操作列表
  const actions = useMemo(() => [
    {
      id: 'add-block',
      label: '添加文本块',
      icon: Plus,
      disabled: false,
      execute: () => {
        const current = dataRef.current;
        const centerX = (current.canvasWidth || 3000) / 2 - 140;
        const centerY = (current.canvasHeight || 3000) / 2 - 80;
        const newBlock = {
          id: crypto.randomUUID(),
          type: 'text' as const,
          content: '',
          position: { x: centerX + (Math.random() - 0.5) * 60, y: centerY + (Math.random() - 0.5) * 60 },
          size: { width: 280, height: 160 },
        };
        emitChange({ ...current, blocks: [...current.blocks, newBlock] });
      },
    },
    {
      id: 'delete-block',
      label: '删除选中块',
      icon: Trash2,
      disabled: selectedBlockIds.size === 0,
      execute: () => handleDeleteSelected(),
    },
    {
      id: 'duplicate-block',
      label: '复制选中块',
      icon: Copy,
      disabled: selectedBlockIds.size === 0,
      execute: () => {
        const firstId = selectedBlockIds.values().next().value;
        if (!firstId) return;
        handleDuplicateBlock(firstId);
      },
    },
    {
      id: 'clear-canvas',
      label: '清空画布',
      icon: Eraser,
      disabled: data.blocks.length === 0,
      execute: () => {
        emitChange({ ...dataRef.current, blocks: [] });
        setSelectedBlockIds(new Set());
      },
    },
  ], [selectedBlockIds, data.blocks.length, emitChange, handleDeleteSelected, handleDuplicateBlock]);

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
  }, [selectedBlockIds, handleDeleteSelected, paletteOpen, handleDuplicateBlock, contextMenu]);

  // 挂载后自动滚动到画布中心
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const centerX = (data.canvasWidth - container.clientWidth) / 2;
    const centerY = (data.canvasHeight - container.clientHeight) / 2;
    container.scrollLeft = Math.max(0, centerX);
    container.scrollTop = Math.max(0, centerY);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full relative" data-allow-context-menu>
      {/* 画布滚动区域 */}
      <div
        ref={scrollContainerRef}
        data-free-canvas
        className="h-full w-full overflow-auto relative bg-bg-elevated/95 backdrop-blur-xl"
        onDoubleClick={handleCanvasDoubleClick}
        onMouseDown={handleCanvasMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={innerCanvasRef}
          style={{
            position: 'relative',
            width: data.canvasWidth,
            height: data.canvasHeight,
          }}
          onMouseUp={handleInnerCanvasMouseUp}
        >
          {data.blocks.map((block) => (
            <FreeTextBlock
              key={block.id}
              block={block}
              onMove={handleMove}
              onContentChange={handleContentChange}
              onDelete={handleDelete}
              onResize={handleResize}
              isSelected={selectedBlockIds.has(block.id)}
              onSelect={handleSelectBlock}
              onReleaseOutside={handleBlockReleaseOutside}
              onDuplicate={handleDuplicateBlock}
            />
          ))}

          {/* 阶段三：墨迹渲染层 / ink rendering layer */}
          <InkLayer
            strokes={strokes}
            currentStroke={currentStroke}
            width={data.canvasWidth}
            height={data.canvasHeight}
          />

          {/* 阶段三：绘制覆盖层（绘制工具激活时捕获指针事件） */}
          {inkTool !== 'select' && (
            <div
              className="absolute inset-0"
              style={{ zIndex: 8, cursor: inkTool === 'eraser' ? 'cell' : 'crosshair', touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          )}

          {/* 框选矩形 */}
          {selectionBox && (
            <div
              className="absolute border-2 border-blue-500/50 bg-blue-500/10 pointer-events-none z-30"
              style={{
                left: Math.min(selectionBox.x1, selectionBox.x2),
                top: Math.min(selectionBox.y1, selectionBox.y2),
                width: Math.abs(selectionBox.x2 - selectionBox.x1),
                height: Math.abs(selectionBox.y2 - selectionBox.y1),
              }}
            />
          )}
        </div>
      </div>

      <FreeCanvasOverlays
        contextMenu={contextMenu}
        contextMenuActions={contextMenuActions}
        onCloseMenu={() => setContextMenu(null)}
        paletteOpen={paletteOpen}
        actions={actions}
        onClosePalette={() => setPaletteOpen(false)}
      />

      {/* 阶段三：墨迹工具栏 / ink toolbar */}
      <InkToolbar
        tool={inkTool}
        color={inkColor}
        width={inkWidth}
        onToolChange={setInkTool}
        onColorChange={setInkColor}
        onWidthChange={setInkWidth}
      />
    </div>
  );
}
