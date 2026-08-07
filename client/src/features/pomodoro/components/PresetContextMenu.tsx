/**
 * PresetContextMenu — 番茄钟预设右键菜单
 *
 * 在 PresetTabs 中对预设标签右键弹出，提供编辑/复制/删除等快捷操作。
 * 使用 createPortal 挂到 body 避免 overflow 裁剪。
 *
 * @ai-context: 右键菜单组件：PresetContextMenu。轻量级浮层，点击外部/Esc 关闭。
 */
import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PomodoroPreset } from '@/types/models';

interface PresetContextMenuProps {
  /** 右键目标预设 */
  preset: PomodoroPreset;
  /** 菜单位置（相对于视口） */
  position: { x: number; y: number };
  /** 关闭菜单 */
  onClose: () => void;
  /** 编辑预设 */
  onEdit: (preset: PomodoroPreset) => void;
  /** 复制为新预设 */
  onDuplicate: (preset: PomodoroPreset) => void;
  /** 删除预设 */
  onDelete: (id: string) => void;
}

export default function PresetContextMenu({
  preset, position, onClose, onEdit, onDuplicate, onDelete,
}: PresetContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  // Esc 关闭
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  // 避免菜单超出视口右/下边界
  const menuWidth = 180;
  const menuHeight = preset.builtin ? 116 : 156;
  const adjustedX = Math.min(position.x, window.innerWidth - menuWidth - 8);
  const adjustedY = Math.min(position.y, window.innerHeight - menuHeight - 8);

  const menuItems = [
    {
      label: '编辑预设',
      icon: Pencil,
      onClick: () => { onEdit(preset); onClose(); },
      disabled: false,
    },
    {
      label: '复制为新预设',
      icon: Copy,
      onClick: () => { onDuplicate(preset); onClose(); },
      disabled: false,
    },
    {
      label: '删除预设',
      icon: Trash2,
      onClick: () => { onDelete(preset.id); onClose(); },
      disabled: preset.builtin,
      tone: 'danger' as const,
    },
  ];

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        className="fixed z-[100] min-w-[180px] py-1 rounded-kb-lg bg-bg-elevated border border-border/50 shadow-kb-lg backdrop-blur-xl"
        style={{ left: adjustedX, top: adjustedY }}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
      >
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              onClick={item.onClick}
              disabled={item.disabled}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-b3 transition-colors duration-100',
                item.disabled
                  ? 'text-text-tertiary/40 cursor-not-allowed'
                  : item.tone === 'danger'
                    ? 'text-semantic-error hover:bg-semantic-error/10'
                    : 'text-text-secondary hover:text-text-primary hover:bg-bg-tertiary',
              )}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span className="flex-1 text-left">{item.label}</span>
              {item.disabled && (
                <span className="text-[10px] text-text-tertiary/40">内置</span>
              )}
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}