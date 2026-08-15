/**
 * 自由画布文本块 CRUD hook
 * Free-canvas text-block CRUD hook
 *
 * @ai-context: 从 FreeCanvas 拆出。文本块的增删改：双击/右键菜单在画布坐标
 * 添加新块（位置偏移 -140/-20 使块中心落在点击处）、删除选中块、复制（+30/+30
 * 偏移并选中副本）、移动/改内容/改尺寸/删单块。全部经 dataRef 读当前数据、
 * emitChange 写回（稳定引用，避免闭包过期）。删除选中同时清理选中集合。
 * @ai-context: Extracted from FreeCanvas. Text-block CRUD: add at canvas coords
 * from double-click/context menu (position offset -140/-20 centers the block on
 * the click), delete selected, duplicate (+30/+30 offset, selects the copy),
 * move / content change / resize / single delete. All reads go through dataRef
 * and writes through emitChange (stable refs, no stale closures). Deleting
 * selected blocks also clears the selection.
 */
import { useCallback } from 'react';
import type { FreeCanvasData, FreeCanvasBlock } from '@/types/models';

interface UseCanvasBlocksOptions {
  dataRef: React.MutableRefObject<FreeCanvasData>;
  emitChange: (next: FreeCanvasData) => void;
  selectedBlockIds: Set<string>;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

/**
 * 返回文本块增删改处理器集合。
 * Returns the text-block CRUD handler collection.
 */
export function useCanvasBlocks({ dataRef, emitChange, selectedBlockIds, setSelectedBlockIds }: UseCanvasBlocksOptions) {
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
  }, [dataRef, emitChange]);

  // 删除选中块
  const handleDeleteSelected = useCallback(() => {
    if (selectedBlockIds.size === 0) return;
    const current = dataRef.current;
    emitChange({
      ...current,
      blocks: current.blocks.filter(b => !selectedBlockIds.has(b.id)),
    });
    setSelectedBlockIds(new Set());
  }, [selectedBlockIds, dataRef, emitChange, setSelectedBlockIds]);

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
    [dataRef, emitChange, setSelectedBlockIds],
  );

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
    [dataRef, emitChange],
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
    [dataRef, emitChange],
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
    [dataRef, emitChange, setSelectedBlockIds],
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
    [dataRef, emitChange],
  );

  return {
    addBlockAtPosition, handleDeleteSelected, handleDuplicateBlock,
    handleMove, handleContentChange, handleDelete, handleResize,
  };
}
