/**
 * 牌组管理 — 新建 / 删除确认 / 重命名三个弹窗
 *
 * @ai-context: 从 FlashcardsPage 拆出。三个弹窗均为受控组件：新建（create*）
 * 与重命名（rename*）由父级持有输入状态，删除确认按 deleteTargetName 展示
 * 文案；保存/删除等提交逻辑全部由父级回调承担，本组件不含业务状态。
 * @ai-context: Extracted from FlashcardsPage. Three controlled modals: create
 * and rename are driven by parent-held input state, delete-confirm renders
 * by deleteTargetName; all submission logic lives in parent callbacks.
 */
import { Button, Modal, Input } from '@/components/ui';
import { Trash2 } from 'lucide-react';

export interface DeckManagementModalsProps {
  createOpen: boolean;
  createName: string;
  createDesc: string;
  creating: boolean;
  /** 删除确认弹窗可见性（由父级 deleteTarget 决定） */
  deleteOpen: boolean;
  /** 待删除牌组名（仅展示用） */
  deleteTargetName: string;
  renameOpen: boolean;
  renameName: string;
  /** 当前牌组原名（重命名未变化时禁用保存） */
  renameCurrentName: string | undefined;
  renaming: boolean;
  onCloseCreate: () => void;
  onCreateNameChange: (v: string) => void;
  onCreateDescChange: (v: string) => void;
  onCreateSubmit: () => void;
  onCloseDelete: () => void;
  onConfirmDelete: () => void;
  onCloseRename: () => void;
  onRenameNameChange: (v: string) => void;
  onRenameSubmit: () => void;
}

export function DeckManagementModals({
  createOpen, createName, createDesc, creating,
  deleteOpen, deleteTargetName, renameOpen, renameName, renameCurrentName, renaming,
  onCloseCreate, onCreateNameChange, onCreateDescChange, onCreateSubmit,
  onCloseDelete, onConfirmDelete, onCloseRename, onRenameNameChange, onRenameSubmit,
}: DeckManagementModalsProps) {
  return (
    <>
      {/* ── 新建牌组 Modal ── */}
      <Modal
        open={createOpen}
        onClose={onCloseCreate}
        title="新建牌组"
        description="创建一个新的闪卡牌组来组织你的学习内容"
        footer={
          <>
            <Button variant="secondary" onClick={onCloseCreate}>取消</Button>
            <Button onClick={onCreateSubmit} loading={creating} disabled={!createName.trim()}>创建</Button>
          </>
        }
      >
        <div className="flex flex-col gap-kb-md">
          <Input label="牌组名称" placeholder="例如：数据结构基础" value={createName}
            onChange={(e) => onCreateNameChange(e.target.value)} autoFocus />
          <Input label="描述（可选）" placeholder="简要描述牌组内容" value={createDesc}
            onChange={(e) => onCreateDescChange(e.target.value)} />
        </div>
      </Modal>

      {/* ── 删除确认 Modal ── */}
      <Modal
        open={deleteOpen}
        onClose={onCloseDelete}
        title="删除牌组"
        description={`确定要删除「${deleteTargetName}」吗？该操作将同时删除牌组中的所有卡片，且无法撤销。`}
        footer={
          <>
            <Button variant="secondary" onClick={onCloseDelete}>取消</Button>
            <Button variant="danger"
              icon={<Trash2 className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
              onClick={onConfirmDelete}>
              删除
            </Button>
          </>
        }
      >
        <div />
      </Modal>

      {/* ── 编辑牌组（重命名）Modal ── */}
      <Modal
        open={renameOpen}
        onClose={onCloseRename}
        title="编辑牌组"
        description="修改牌组名称"
        footer={
          <>
            <Button variant="secondary" onClick={onCloseRename}>取消</Button>
            <Button onClick={onRenameSubmit} loading={renaming} disabled={!renameName.trim() || renameName.trim() === renameCurrentName}>保存</Button>
          </>
        }
      >
        <div className="flex flex-col gap-kb-md">
          <Input
            label="牌组名称"
            placeholder="例如：数据结构基础"
            value={renameName}
            onChange={(e) => onRenameNameChange(e.target.value)}
            autoFocus
          />
        </div>
      </Modal>
    </>
  );
}
