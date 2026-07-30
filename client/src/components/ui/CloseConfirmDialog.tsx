import { useState } from 'react';
import { LogOut, Minus, X, Check } from 'lucide-react';
import { Modal } from './Modal';
import { cn } from '@/lib/utils';

interface CloseConfirmDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 关闭窗口行为确认对话框
 *
 * 当用户在 Electron 环境下点击关闭窗口且尚未保存偏好时，
 * 由主进程触发 `window:closing` 事件，前端展示此对话框让用户选择：
 * - 直接退出程序
 * - 最小化到系统托盘
 * - 取消操作
 * 并可通过复选框记住选择。
 */
export function CloseConfirmDialog({ open, onClose }: CloseConfirmDialogProps) {
  const [remember, setRemember] = useState(false);

  /**
   * 处理关闭行为选择，向 Electron 主进程发送对应 action
   * @param action - 用户选择的关闭行为
   * @ai-context Electron IPC: window:close-action
   */
  const handleAction = async (action: 'quit' | 'minimize' | 'cancel') => {
    try {
      const shouldRemember = action === 'cancel' ? false : remember;
      await window.electronAPI?.closeAction(action, shouldRemember);
    } catch (err) {
      console.error('[CloseConfirmDialog] closeAction failed:', err);
    } finally {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => handleAction('cancel')}
      title="关闭熵减"
      description="你希望如何处理？"
      size="sm"
    >
      <div className="flex flex-col gap-kb-sm">
        {/* 退出程序 */}
        <button
          onClick={() => handleAction('quit')}
          className={cn(
            'flex items-center gap-kb-sm w-full px-kb-md py-kb-sm rounded-kb-lg',
            'text-b1 font-medium',
            'text-text-primary',
            'bg-bg-tertiary hover:bg-red-500/15 hover:text-red-500',
            'transition-colors duration-kb-fast',
          )}
        >
          <LogOut className="w-icon-sm h-icon-sm shrink-0" />
          直接退出程序
        </button>

        {/* 最小化到托盘 */}
        <button
          onClick={() => handleAction('minimize')}
          className={cn(
            'flex items-center gap-kb-sm w-full px-kb-md py-kb-sm rounded-kb-lg',
            'text-b1 font-medium',
            'text-text-primary',
            'bg-bg-tertiary hover:bg-brand-600/15 hover:text-brand-600',
            'transition-colors duration-kb-fast',
          )}
        >
          <Minus className="w-icon-sm h-icon-sm shrink-0" />
          最小化到系统托盘
        </button>

        {/* 取消 */}
        <button
          onClick={() => handleAction('cancel')}
          className={cn(
            'flex items-center gap-kb-sm w-full px-kb-md py-kb-sm rounded-kb-lg',
            'text-b1 font-medium',
            'text-text-secondary',
            'bg-bg-tertiary hover:bg-bg-secondary',
            'transition-colors duration-kb-fast',
          )}
        >
          <X className="w-icon-sm h-icon-sm shrink-0" />
          取消
        </button>
      </div>

      {/* 记住选择复选框 */}
      <label
        className={cn(
          'flex items-center gap-kb-xs mt-kb-md cursor-pointer select-none',
          'text-b2 text-text-secondary',
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={remember}
          onClick={() => setRemember((v) => !v)}
          className={cn(
            'flex items-center justify-center w-4 h-4 rounded-kb-sm shrink-0',
            'border transition-colors duration-kb-fast',
            remember
              ? 'bg-brand-600 border-brand-600 text-white'
              : 'border-border bg-bg-primary',
          )}
        >
          {remember && <Check className="w-3 h-3" />}
        </button>
        记住我的选择
      </label>
    </Modal>
  );
}
