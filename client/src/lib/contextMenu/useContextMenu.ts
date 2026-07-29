/**
 * 右键菜单 Hook
 *
 * @ai-context: 菜单定位基于视口坐标并做边缘翻转，仅供 ContextMenu 组件族使用。
 */
import { useState, useCallback, useEffect } from 'react';

/** useContextMenu 返回值 */
export interface UseContextMenuReturn<T = unknown> {
  /** 是否显示菜单 */
  isOpen: boolean;
  /** 菜单位置 */
  position: { x: number; y: number };
  /** 当前右键上下文数据（触发时的目标对象） */
  context: T | null;
  /** 绑定到元素的 onContextMenu 事件处理器 */
  handleContextMenu: (e: React.MouseEvent, context: T) => void;
  /** 关闭菜单 */
  close: () => void;
}

/**
 * 通用右键菜单 hook
 *
 * 封装右键菜单的常见交互逻辑：位置追踪、显示/隐藏、上下文数据管理。
 * 配合 `<ContextMenu>` 组件使用。
 *
 * @example
 * ```tsx
 * interface NoteContext { id: string; title: string }
 *
 * const { isOpen, position, context, handleContextMenu, close } =
 *   useContextMenu<NoteContext>();
 *
 * const groups: ContextMenuGroup[] = [
 *   { label: '笔记操作', items: [
 *     { key: 'open', label: '打开' },
 *     { key: 'rename', label: '重命名' },
 *   ]},
 *   { label: '危险操作', items: [
 *     { key: 'delete', label: '删除', danger: true },
 *   ]},
 * ];
 *
 * const handleSelect = (itemKey: string, ctx: NoteContext) => {
 *   switch (itemKey) {
 *     case 'open': openNote(ctx.id); break;
 *     case 'delete': deleteNote(ctx.id); break;
 *   }
 * };
 *
 * <div onContextMenu={(e) => handleContextMenu(e, { id: '1', title: '笔记' })}>
 *   ...
 * </div>
 * {isOpen && context && (
 *   <ContextMenu
 *     groups={groups}
 *     position={position}
 *     context={context}
 *     onSelect={handleSelect}
 *     onClose={close}
 *   />
 * )}
 * ```
 */
export function useContextMenu<T = unknown>(): UseContextMenuReturn<T> {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [context, setContext] = useState<T | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, data: T) => {
      e.preventDefault();
      e.stopPropagation();

      setContext(data);
      setPosition({ x: e.clientX, y: e.clientY });
      setIsOpen(true);
    },
    [],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setContext(null);
  }, []);

  // 点击外部关闭（ContextMenu 组件自身也有此逻辑，此处作为兜底）
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = () => close();
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen, close]);

  return {
    isOpen,
    position,
    context,
    handleContextMenu,
    close,
  };
}
