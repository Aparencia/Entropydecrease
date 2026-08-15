/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：ContextMenu。
 * 定位机制：Radix ContextMenu 的菜单锚点取自触发器真实收到的 contextmenu 事件坐标，
 * 因此挂载后向隐藏触发器派发携带 position 坐标的原生事件来打开菜单；
 * 绝不可强制传 open（锚点未初始化会导致菜单固定在屏幕左上角）。
 */
import React, { useCallback, useEffect, useRef } from 'react';
import * as RadixContextMenu from '@radix-ui/react-context-menu';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/* ── 类型定义 ──────────────────────────────────────── */

export interface ContextMenuItem {
  /** 菜单项唯一标识，选中时传给 onSelect */
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** 二级子菜单分组，存在时该项显示 ▶ 指示器 */
  subGroups?: ContextMenuGroup[];
}

export interface ContextMenuGroup {
  /** 分组标题，可选 */
  label?: string;
  items: ContextMenuItem[];
}

export interface ContextMenuProps<C = unknown> {
  /** 菜单分组 */
  groups: ContextMenuGroup[];
  /** 菜单位置 */
  position: { x: number; y: number };
  /** 右键菜单上下文数据（触发时的目标对象） */
  context: C;
  /** 菜单项选中回调，接收 itemKey 和 context */
  onSelect: (itemKey: string, context: C) => void;
  /** 关闭菜单 */
  onClose: () => void;
}

/* ── 菜单项渲染（递归处理子菜单）────────────────────── */

function renderItems(
  items: ContextMenuItem[],
  onSelect: (key: string) => void,
): React.ReactNode {
  return items.map((item) => {
    const hasSub = item.subGroups && item.subGroups.length > 0;

    if (hasSub) {
      return (
        <RadixContextMenu.Sub key={item.key}>
          <RadixContextMenu.SubTrigger
            disabled={item.disabled}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-b2 text-left outline-none cursor-default select-none transition-colors',
              item.danger
                ? 'text-semantic-error data-[highlighted]:bg-semantic-error/10'
                : 'text-text-secondary data-[highlighted]:bg-bg-tertiary data-[highlighted]:text-text-primary',
              item.disabled && 'opacity-40 cursor-not-allowed',
            )}
          >
            {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            <span className="ml-auto text-text-tertiary text-xs">▶</span>
          </RadixContextMenu.SubTrigger>

          <RadixContextMenu.Portal>
            <RadixContextMenu.SubContent
              className={cn(
                'z-[10000] bg-bg-elevated/90 backdrop-blur-2xl border border-border/50 rounded-kb-md shadow-xl py-1 min-w-[160px]',
              )}
              style={{ position: 'fixed' }}
            >
              {item.subGroups!.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  {gIdx > 0 && (
                    <RadixContextMenu.Separator className="my-1 h-px bg-border/40" />
                  )}
                  {group.label && (
                    <div className="px-3 py-1 text-xs font-medium text-text-tertiary select-none">
                      {group.label}
                    </div>
                  )}
                  {renderItems(group.items, onSelect)}
                </React.Fragment>
              ))}
            </RadixContextMenu.SubContent>
          </RadixContextMenu.Portal>
        </RadixContextMenu.Sub>
      );
    }

    return (
      <RadixContextMenu.Item
        key={item.key}
        disabled={item.disabled}
        onSelect={() => onSelect(item.key)}
        className={cn(
          'flex items-center gap-2 px-3 py-2 text-b2 text-left outline-none cursor-default select-none transition-colors',
          item.danger
            ? 'text-semantic-error data-[highlighted]:bg-semantic-error/10'
            : 'text-text-secondary data-[highlighted]:bg-bg-tertiary data-[highlighted]:text-text-primary',
          item.disabled && 'opacity-40 cursor-not-allowed',
        )}
      >
        {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
      </RadixContextMenu.Item>
    );
  });
}

/* ── 主菜单组件 ────────────────────────────────────── */

export const ContextMenu = <C,>({
  groups,
  position,
  context,
  onSelect,
  onClose,
}: ContextMenuProps<C>) => {
  const triggerRef = useRef<HTMLSpanElement>(null);

  const handleSelect = useCallback(
    (itemKey: string) => {
      onSelect(itemKey, context);
      onClose();
    },
    [onSelect, context, onClose],
  );

  // 向隐藏触发器派发带坐标的 contextmenu 事件，让 Radix 记录锚点并打开菜单；
  // position 变化时（菜单未关闭又右键另一目标）重新派发以重定位
  useEffect(() => {
    triggerRef.current?.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: position.x,
      clientY: position.y,
    }));
  }, [position.x, position.y]);

  return (
    <RadixContextMenu.Root onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* Hidden trigger at target position */}
      <RadixContextMenu.Trigger
        ref={triggerRef}
        // 阻止合成事件冒泡到页面的 onContextMenu，避免重复触发 handleContextMenu
        onContextMenu={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          width: 1,
          height: 1,
          pointerEvents: 'none',
          visibility: 'hidden',
        }}
        aria-hidden
        tabIndex={-1}
      />

      <RadixContextMenu.Portal>
        <RadixContextMenu.Content
          collisionPadding={8}
          onCloseAutoFocus={(e: Event) => e.preventDefault()}
          className={cn(
            'z-[9999] bg-bg-elevated/90 backdrop-blur-2xl border border-border/50 rounded-kb-md shadow-xl py-1 min-w-[160px]',
          )}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] as const }}
          >
            {groups.map((group, gIdx) => (
              <RadixContextMenu.Group key={gIdx}>
                {gIdx > 0 && (
                  <RadixContextMenu.Separator className="my-1 h-px bg-border/40" />
                )}
                {group.label && (
                  <RadixContextMenu.Label className="px-3 py-1 text-xs font-medium text-text-tertiary select-none">
                    {group.label}
                  </RadixContextMenu.Label>
                )}
                {renderItems(group.items, handleSelect)}
              </RadixContextMenu.Group>
            ))}
          </motion.div>
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
};
