/**
 * @ai-context: 通用组件：SubjectFolder。
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronRight, Check, Folder, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContextMenu, type ContextMenuGroup } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/lib/contextMenu';
import type { NoteFolder } from '@/types/models';

interface SubjectFolderProps {
  folder: NoteFolder;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, newName: string) => Promise<void>;
  /** 删除分组（父层弹确认框后执行） / Delete folder (parent confirms first) */
  onDelete: (id: string) => void;
}

export default function SubjectFolder({
  folder,
  isSelected,
  onSelect,
  onRename,
  onDelete,
}: SubjectFolderProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(folder.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen: ctxOpen, position: ctxPos, context: ctxFolder,
    handleContextMenu: ctxHandleMenu, close: ctxClose,
  } = useContextMenu<NoteFolder>();

  const folderMenuGroups: ContextMenuGroup[] = [
    {
      label: '分组操作',
      items: [
        { key: 'rename', label: '重命名', icon: <Pencil className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'delete', label: '删除分组', icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />, danger: true },
      ],
    },
  ];

  const handleMenuSelect = useCallback((itemKey: string, target: NoteFolder) => {
    if (itemKey === 'rename') {
      setNewName(target.name);
      setIsRenaming(true);
    } else if (itemKey === 'delete') {
      onDelete(target.id);
    }
  }, [onDelete]);

  const startRename = useCallback(() => {
    setNewName(folder.name);
    setIsRenaming(true);
  }, [folder.name]);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    startRename();
  }, [startRename]);

  const handleRenameConfirm = useCallback(async () => {
    if (newName.trim() && newName.trim() !== folder.name) {
      await onRename(folder.id, newName.trim());
    }
    setIsRenaming(false);
  }, [newName, folder.name, folder.id, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameConfirm();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(folder.name);
    }
  }, [handleRenameConfirm, folder.name]);

  return (
    <>
    <div
      onClick={() => onSelect(folder.id)}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        ctxHandleMenu(e, folder);
      }}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-[var(--kb-radius-sm)] cursor-pointer',
        'transition-all duration-200 text-[13px]',
        isSelected
          ? 'bg-brand-50/80 text-brand-700 font-medium shadow-[inset_0_0_0_1px_rgba(91,138,114,0.08)]'
          : 'text-text-secondary hover:bg-bg-tertiary/40',
      )}
    >
      <ChevronRight className="w-3.5 h-3.5 opacity-40 flex-shrink-0" strokeWidth={1.5} />
      <Folder className="w-3.5 h-3.5 opacity-60 flex-shrink-0" strokeWidth={1.5} />

      {isRenaming ? (
        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleRenameConfirm}
            className="flex-1 min-w-0 px-1.5 py-0.5 text-[13px] bg-bg-tertiary/50 border border-brand-400 rounded-[var(--kb-radius-sm)] outline-none text-text-primary"
          />
          <button
            onClick={handleRenameConfirm}
            className="p-0.5 text-brand-500 hover:text-brand-600 transition-colors"
          >
            <Check className="w-3.5 h-3.5" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <span className="flex-1 min-w-0 truncate">{folder.name}</span>
      )}
    </div>

    {/* 右键菜单：重命名 / 删除分组 */}
    {ctxOpen && ctxFolder && (
      <ContextMenu
        groups={folderMenuGroups}
        position={ctxPos}
        context={ctxFolder}
        onSelect={handleMenuSelect}
        onClose={ctxClose}
      />
    )}
    </>
  );
}
