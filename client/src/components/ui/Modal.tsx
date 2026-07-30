import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

export type ModalSize = 'sm' | 'md' | 'lg';

/**
 * 模态框组件 props
 * @param open - 是否显示
 * @param onClose - 关闭回调
 * @param title - 标题
 * @param description - 描述文本
 * @param children - 内容
 * @param footer - 底部操作区
 * @param size - 尺寸：sm | md | lg
 * @ai-context 极夜深海主题 Modal，进场动效 fade+slideY(8px) 400ms ease-out
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/**
 * 熵减模态框组件
 * @param props - ModalProps
 * @returns React 模态框元素
 * @ai-context 使用 Radix Dialog + Framer Motion，支持双主题色板
 */
export const Modal: React.FC<ModalProps> = ({
  open, onClose, title, description, children, footer, size = 'md',
}) => {
  // 仅在 open 真实转换时播放开/关音效（挂载与卸载不播，避免路由切换误响）
  const prevOpenRef = React.useRef(open);
  React.useEffect(() => {
    if (prevOpenRef.current === open) return;
    prevOpenRef.current = open;
    soundPlayer.play(open ? 'ui_modal_open' : 'ui_modal_close');
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            {/* ── 背景遮罩 ── */}
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              />
            </Dialog.Overlay>

            {/* ── 对话框 ── */}
            <Dialog.Content
              asChild
              onPointerDownOutside={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => e.preventDefault()}
            >
              <motion.div
                className="fixed inset-0 z-50 flex items-center justify-center p-kb-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <motion.div
                  className={cn(
                    'relative w-full',
                    'bg-bg-elevated/90 backdrop-blur-2xl rounded-kb-xl shadow-2xl kb-squircle',
                    'border border-border/40',
                    'p-kb-lg',
                    sizeClasses[size],
                  )}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
                >
                  {/* ── 顶部渐变装饰线 ── */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/30 to-transparent" />

                  {/* 关闭按钮 */}
                  <Dialog.Close asChild>
                    <motion.button
                      className="absolute top-4 right-4 p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
                      whileHover={{ scale: 1.1, rotate: 90 }}
                      whileTap={{ scale: 0.9 }}
                      aria-label="关闭"
                    >
                      <X className="w-icon-md h-icon-md" />
                    </motion.button>
                  </Dialog.Close>

                  {/* 头部 */}
                  <div className="pr-8">
                    <Dialog.Title className="text-h2 font-semibold text-text-primary">
                      {title}
                    </Dialog.Title>
                    {description && (
                      <Dialog.Description className="mt-kb-xs text-b2 text-text-secondary">
                        {description}
                      </Dialog.Description>
                    )}
                  </div>

                  {/* 内容区 */}
                  <div className="mt-kb-md">{children}</div>

                  {/* 底部操作区 */}
                  {footer && (
                    <div className="mt-kb-lg flex justify-end gap-kb-sm">{footer}</div>
                  )}
                </motion.div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
};

Modal.displayName = 'Modal';
