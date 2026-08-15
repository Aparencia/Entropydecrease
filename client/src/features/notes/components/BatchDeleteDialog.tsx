/**
 * @ai-context: 批量删除笔记确认弹窗（真删除不可撤销）。
 * 自 NotesPage.tsx 原样拆出；选中数量与取消/确认动作经 props 注入。
 * @ai-context: Batch-delete confirmation dialog extracted verbatim from
 * NotesPage.tsx. Selected count and cancel/confirm actions are injected via props.
 */
import { Trash2 } from 'lucide-react';
import { Modal, Button } from '@/components/ui';

interface BatchDeleteDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 批量选中数量 */
  count: number;
  /** 取消删除 */
  onCancel: () => void;
  /** 确认删除 */
  onConfirm: () => void;
}

export default function BatchDeleteDialog({ open, count, onCancel, onConfirm }: BatchDeleteDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="批量删除笔记"
      description={`确定要删除选中的 ${count} 篇笔记吗？此操作不可撤销。`}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="danger" icon={<Trash2 className="w-4 h-4" strokeWidth={1.5} />} onClick={onConfirm}>删除 {count} 篇</Button>
        </>
      }
    >
      <div />
    </Modal>
  );
}
