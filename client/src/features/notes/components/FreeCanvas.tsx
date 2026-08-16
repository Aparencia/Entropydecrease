/**
 * 自由画布组件
 * Free canvas component
 *
 * @ai-context: 自由画布（巨型，待拆分 → 2026-08 R3 已拆分）：手写/绘图白板，
 * 供笔记批注与费曼讲解涂鸦。选择/框选状态机 → hooks/useCanvasSelection；
 * 文本块 CRUD → hooks/useCanvasBlocks；动作列表 → hooks/useCanvasActions；
 * 键盘快捷键 → hooks/useCanvasKeyboard；AI 排版工具栏 → components/FreeCanvasToolbar。
 * 墨迹绘制见 lib/canvas/useInkDrawing，浮层见 components/FreeCanvasOverlays，
 * 文本块见 components/FreeTextBlock。本文件保留数据归一化、墨迹状态与布局组合。
 * @ai-context: Free canvas (oversized; split in 2026-08 R3): handwriting/
 * drawing whiteboard for note annotation and Feynman doodles. Selection/box
 * state machine → hooks/useCanvasSelection; block CRUD → hooks/useCanvasBlocks;
 * action lists → hooks/useCanvasActions; keyboard → hooks/useCanvasKeyboard;
 * AI layout toolbar → components/FreeCanvasToolbar. Ink drawing lives in
 * lib/canvas/useInkDrawing, overlays in components/FreeCanvasOverlays, blocks
 * in components/FreeTextBlock. This file keeps data normalization, ink state
 * and layout composition.
 */
import { useCallback, useRef, useState, useEffect } from 'react';
import FreeTextBlock from './FreeTextBlock';
import { FreeCanvasOverlays } from './FreeCanvasOverlays';
import { InkToolbar } from './canvas/InkToolbar';
import { InkLayer } from './canvas/InkLayer';
import { useInkDrawing, type InkTool } from '../lib/canvas/useInkDrawing';
import { useCanvasAILayout, type LayoutMode } from '../hooks/useCanvasAILayout';
import { useCanvasSelection } from '../hooks/useCanvasSelection';
import { useCanvasBlocks } from '../hooks/useCanvasBlocks';
import { useCanvasActions } from '../hooks/useCanvasActions';
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard';
import { FreeCanvasToolbar } from './FreeCanvasToolbar';
import type { FreeCanvasData, InkStroke, InkPoint } from '@/types/models';

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

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [aiLayoutMode, setAiLayoutMode] = useState<LayoutMode | null>(null);
  const { loading: aiLayoutLoading, layout: aiLayout } = useCanvasAILayout();

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

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // 选择/框选状态机 + 画布鼠标交互（见 hooks/useCanvasSelection）
  const {
    selectedBlockIds, setSelectedBlockIds,
    selectionBox, contextMenu, setContextMenu,
    handleSelectBlock, handleBlockReleaseOutside,
    handleCanvasMouseDown, handleInnerCanvasMouseUp,
  } = useCanvasSelection({ dataRef, scrollContainerRef });

  // 文本块 CRUD（见 hooks/useCanvasBlocks）
  const {
    addBlockAtPosition, handleDeleteSelected, handleDuplicateBlock,
    handleMove, handleContentChange, handleDelete, handleResize,
  } = useCanvasBlocks({ dataRef, emitChange, selectedBlockIds, setSelectedBlockIds });

  // 右键菜单 / 操作面板动作列表（见 hooks/useCanvasActions）
  const { contextMenuActions, actions } = useCanvasActions({
    data, dataRef, contextMenu, selectedBlockIds, setSelectedBlockIds,
    emitChange, addBlockAtPosition, handleDeleteSelected, handleDuplicateBlock,
  });

  // 键盘快捷键（见 hooks/useCanvasKeyboard）
  useCanvasKeyboard({
    selectedBlockIds, setSelectedBlockIds, paletteOpen, setPaletteOpen,
    contextMenu, setContextMenu, handleDeleteSelected, handleDuplicateBlock,
  });

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

  // AI 智能排版：设置模式 → AI 布局 → 落盘 → 复位（失败时保持模式选择态，与既有行为一致）
  const handleApplyAiLayout = async (mode: LayoutMode) => {
    setAiLayoutMode(mode);
    const newBlocks = await aiLayout(data.blocks, mode);
    emitChange({ ...data, blocks: newBlocks });
    setAiLayoutMode(null);
  };

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

      {/* AI 智能排版工具栏（见 components/FreeCanvasToolbar） */}
      <FreeCanvasToolbar
        blockCount={data.blocks.length}
        aiLayoutLoading={aiLayoutLoading}
        aiLayoutMode={aiLayoutMode}
        onModeChange={setAiLayoutMode}
        onApplyLayout={handleApplyAiLayout}
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
