/**
 * @ai-context: 单条笔记删除确认弹窗（真删除不可撤销）。
 * 自 NotesPage.tsx 原样拆出；打开态与取消/确认动作经 props 注入。
 * @ai-context: Single-note delete confirmation dialog extracted verbatim from
 * NotesPage.tsx. Open state and cancel/confirm actions are injected via props.
 */
import { Trash2 } from 'lucide-react';
import { Modal, Button } from '@/components/ui';

interface DeleteNoteDialogProps {
  /** 是否打开（deleteTargetId 非空） */
  open: boolean;
  /** 取消删除 */
  onCancel: () => void;
  /** 确认删除 */
  onConfirm: () => void;
}

export default function DeleteNoteDialog({ open, onCancel, onConfirm }: DeleteNoteDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="确认删除"
      description="确定要删除这条笔记吗？此操作不可撤销。"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button variant="danger" icon={<Trash2 className="w-4 h-4" strokeWidth={1.5} />} onClick={onConfirm}>删除</Button>
        </>
      }
    >
      <div />
    </Modal>
  );
}
