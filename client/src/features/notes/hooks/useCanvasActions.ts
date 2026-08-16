/**
 * 自由画布动作列表 hook（右键菜单 + 操作面板）
 * Free-canvas action-list hook (context menu + palette)
 *
 * @ai-context: 从 FreeCanvas 拆出。构建右键快捷菜单与 Shift+A 操作面板的动作
 * 列表：添加文本（画布中心 ±30 随机偏移）、全选、删除选中、复制、清空画布。
 * 纯 useMemo 组装：依赖（data/选中集/CRUD 处理器）由父组件注入，execute 闭包
 * 捕获最新引用。动作形状 CanvasAction 由 FreeCanvasOverlays 定义（共用契约）。
 * @ai-context: Extracted from FreeCanvas. Builds the right-click context-menu
 * and Shift+A palette action lists: add text (canvas center ±30 random offset),
 * select all, delete selected, duplicate, clear canvas. Pure useMemo assembly:
 * deps (data/selection/CRUD handlers) injected by the parent; execute closures
 * capture the latest refs. The CanvasAction shape is defined by
 * FreeCanvasOverlays (shared contract).
 */
import { useMemo } from 'react';
import { Plus, Trash2, Copy, Eraser, CheckSquare } from 'lucide-react';
import type { FreeCanvasData } from '@/types/models';
import type { CanvasAction } from '../components/FreeCanvasOverlays';
import type { CanvasContextMenu } from './useCanvasSelection';

interface UseCanvasActionsOptions {
  data: FreeCanvasData;
  dataRef: React.MutableRefObject<FreeCanvasData>;
  contextMenu: CanvasContextMenu | null;
  selectedBlockIds: Set<string>;
  setSelectedBlockIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  emitChange: (next: FreeCanvasData) => void;
  addBlockAtPosition: (canvasX: number, canvasY: number) => void;
  handleDeleteSelected: () => void;
  handleDuplicateBlock: (id: string) => void;
}

/**
 * 返回右键菜单与操作面板的动作列表。
 * Returns context-menu and palette action lists.
 */
export function useCanvasActions({
  data, dataRef, contextMenu, selectedBlockIds, setSelectedBlockIds,
  emitChange, addBlockAtPosition, handleDeleteSelected, handleDuplicateBlock,
}: UseCanvasActionsOptions) {
  // 右键菜单操作列表
  const contextMenuActions = useMemo<CanvasAction[]>(() => [
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
  ], [contextMenu, data.blocks, selectedBlockIds, emitChange, handleDeleteSelected, addBlockAtPosition, handleDuplicateBlock, dataRef, setSelectedBlockIds]);

  // 操作面板操作列表
  const actions = useMemo<CanvasAction[]>(() => [
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
  ], [selectedBlockIds, data.blocks.length, emitChange, handleDeleteSelected, handleDuplicateBlock, dataRef, setSelectedBlockIds]);

  return { contextMenuActions, actions };
}
