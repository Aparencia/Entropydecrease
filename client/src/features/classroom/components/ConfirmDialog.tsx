/**
 * ConfirmDialog — 课堂模块应用内确认对话框（替代 window.confirm）
 *
 * @ai-context: 组装共享 Modal（Radix Dialog）+ 确认/取消按钮。Modal 有意
 * 屏蔽 Escape（ui/Modal.tsx），故本组件在 open 期间自挂 window Escape
 * keydown 监听触发取消（卸载/关闭时移除）；确认按钮挂载即聚焦，Enter
 * 由原生 button 行为触发确认。
 * @ai-context: In-app confirm dialog replacing window.confirm. Modal blocks
 * Escape by design, so this component attaches its own Escape listener to
 * cancel; the confirm button auto-focuses so Enter confirms natively.
 */
import { useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 应用内确认对话框
 * @param props - ConfirmDialogProps
 * @returns React 对话框元素
 */
export function ConfirmDialog({
  open, title, description, confirmLabel = '确认', cancelLabel = '取消',
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Modal 屏蔽 Escape（有意设计，不改共享组件）：此处自挂监听触发取消
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  // 确认按钮 auto-focus：Radix 默认聚焦首个可聚焦元素（关闭按钮），
  // 故打开后显式聚焦确认按钮，保证 Enter 直接触发确认
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-kb-lg text-b3 font-medium text-text-secondary bg-bg-secondary hover:bg-bg-tertiary active:scale-[0.98] transition-all"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-4 py-2 rounded-kb-lg text-b3 font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-all"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {/* 内容已由 Modal description 承载，此处留空占位保持 Modal 契约 */}
      <div />
    </Modal>
  );
}

export default ConfirmDialog;
