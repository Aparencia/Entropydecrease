/**
 * @ai-context: 删除分组确认弹窗：组内笔记移回根目录，可选同时删除组内全部笔记（含子孙分组）。
 * 自 NotesPage.tsx 原样拆出；分组名、递归笔记数、复选状态与动作经 props 注入。
 * @ai-context: Delete-folder confirmation dialog extracted verbatim from
 * NotesPage.tsx. Folder name, recursive note count, checkbox state and actions
 * are injected via props.
 */
import { Trash2 } from 'lucide-react';
import { Modal, Button } from '@/components/ui';

interface DeleteFolderDialogProps {
  /** 是否打开（deleteFolderTarget 非空） */
  open: boolean;
  /** 待删除分组名（用于文案） */
  folderName: string;
  /** 分组树（含子孙分组）下的笔记数 */
  noteCount: number;
  /** 是否勾选「同时删除组内全部笔记」 */
  withNotesChecked: boolean;
  /** 勾选状态变化 */
  onWithNotesChange: (checked: boolean) => void;
  /** 取消删除（同时重置复选） */
  onCancel: () => void;
  /** 确认删除 */
  onConfirm: () => void;
}

export default function DeleteFolderDialog({
  open,
  folderName,
  noteCount,
  withNotesChecked,
  onWithNotesChange,
  onCancel,
  onConfirm,
}: DeleteFolderDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="删除分组"
      description={folderName
        ? `确定要删除分组「${folderName}」吗？${noteCount > 0 ? `组内 ${noteCount} 篇笔记将移至「全部笔记」，` : ''}笔记内容不会被删除。`
        : ''}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button
            variant="danger"
            icon={<Trash2 className="w-4 h-4" strokeWidth={1.5} />}
            onClick={onConfirm}
          >
            {withNotesChecked ? `删除分组与 ${noteCount} 篇笔记` : '删除分组'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* 附加选项：同时删除组内全部笔记（含子孙分组，不可撤销） */}
        {noteCount > 0 && (
          <label className="flex items-start gap-2 p-2.5 rounded-kb-md border border-semantic-error/25 bg-semantic-error/5 cursor-pointer">
            <input
              type="checkbox"
              checked={withNotesChecked}
              onChange={(e) => onWithNotesChange(e.target.checked)}
              className="mt-0.5 accent-[var(--kb-brand-500)]"
            />
            <span className="text-b3 text-text-secondary">
              同时删除组内全部笔记（含子分组，共 <b className="text-semantic-error">{noteCount}</b> 篇）
              <span className="block text-c1 text-semantic-error mt-0.5">笔记内容将永久丢失，此操作不可撤销</span>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}
