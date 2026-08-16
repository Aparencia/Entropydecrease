/**
 * 牌组列表 — 右键菜单 hook（菜单分组与选择处理）
 *
 * @ai-context: 从 FlashcardsPage 拆出。菜单分组静态；选择处理按 key 分发：
 * study 跳转会话页、edit 触发重命名、share 导出并下载文件、delete 触发删除
 * 确认。navigate/toast 由 hook 自取，onEdit/onDelete 为父级注入的 UI 入口。
 * @ai-context: Extracted from FlashcardsPage. Static menu groups; selection is
 * key-dispatched (study → navigate to session, edit → rename, share → export
 * + download, delete → confirm delete). navigate/toast come from the hook
 * itself; onEdit/onDelete are parent-provided UI entry points.
 */
import { useCallback } from 'react';
import { useToast } from '@/components/ui';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { BookOpen, Pencil, Share2, Trash2 } from 'lucide-react';
import { exportDeck, downloadDeckFile } from '@/lib/storage/exportImport';
import type { FlashcardDeck } from '@/types/models';

export interface UseDeckContextMenuDeps {
  navigate: (path: string) => void;
  /** 编辑牌组入口（父级打开重命名弹窗） */
  onEdit: (deck: FlashcardDeck) => void;
  /** 删除牌组入口（父级打开删除确认） */
  onDelete: (deckId: string) => void;
}

export function useDeckContextMenu({ navigate, onEdit, onDelete }: UseDeckContextMenuDeps) {
  const { toast } = useToast();

  const groups: ContextMenuGroup[] = [
    { label: '牌组操作', items: [
      { key: 'study', label: '开始学习', icon: <BookOpen className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'edit', label: '编辑牌组', icon: <Pencil className="w-4 h-4" strokeWidth={1.5} /> },
      { key: 'share', label: '导出分享', icon: <Share2 className="w-4 h-4" strokeWidth={1.5} /> },
    ]},
    { label: '管理', items: [
      { key: 'delete', label: '删除牌组', icon: <Trash2 className="w-4 h-4" strokeWidth={1.5} />, danger: true },
    ]},
  ];

  const handleSelect = useCallback(async (itemKey: string, deck: FlashcardDeck) => {
    switch (itemKey) {
      case 'study': navigate(`/flashcards/${deck.id}`); break;
      case 'edit': onEdit(deck); break;
      case 'share': {
        try {
          const data = await exportDeck(deck.id);
          downloadDeckFile(data);
          toast({ type: 'success', message: `牌组「${deck.name}」已导出` });
        } catch { toast({ type: 'error', message: '导出失败，请稍后重试' }); }
        break;
      }
      case 'delete': onDelete(deck.id); break;
    }
  }, [navigate, toast, onEdit, onDelete]);

  return { groups, handleSelect };
}
