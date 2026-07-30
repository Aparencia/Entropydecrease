/**
 * 编辑器选中文本右键菜单 hook（AI 操作）
 *
 * @ai-context: 从 NoteEditPage 拆出。仅在 TipTap 有非空选区时接管右键
 * （否则 fallthrough 到浏览器默认菜单）；康奈尔模板不启用。
 * 四项 AI 操作：生成闪卡（走 persistCards 落库）、解释概念/提炼要点
 * （v0.5.0-B1.4 待实现）、高亮标记（直接执行 TipTap 命令）。
 */
import { useMemo, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/lib/contextMenu';
import { useToast } from '@/components/ui';

interface UseEditorContextMenuOptions {
  editor: Editor | null;
  /** 康奈尔模板下禁用自定义菜单 */
  disabled: boolean;
  /** 将选中文本转为闪卡并落库，返回卡片数 */
  persistCards: (source: string) => Promise<number>;
  onFlashcardError: (error: unknown) => void;
}

export function useEditorContextMenu({
  editor, disabled, persistCards, onFlashcardError,
}: UseEditorContextMenuOptions) {
  const { toast } = useToast();
  const { isOpen, position, context, handleContextMenu, close } = useContextMenu<string>();

  const groups = useMemo<ContextMenuGroup[]>(() => [
    {
      label: 'AI 操作',
      items: [
        { key: 'ai-flashcard', label: '生成闪卡', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'ai-explain', label: '解释概念' },
        { key: 'ai-distill', label: '提炼要点' },
        { key: 'ai-highlight', label: '高亮标记' },
      ],
    },
  ], []);

  const handleSelect = useCallback((itemKey: string, selectedText: string) => {
    if (!editor || !selectedText) return;

    switch (itemKey) {
      case 'ai-flashcard':
        persistCards(selectedText)
          .then((count) => toast({ type: 'success', message: `已生成 ${count} 张闪卡`, silent: true }))
          .catch(onFlashcardError);
        break;
      case 'ai-explain':
        // TODO [v0.5.0-B1.4]: 调用 AI 解释选中概念 — 需调用 summarize API 并展示解释结果
        toast({ type: 'info', message: 'AI 解释功能即将上线' });
        break;
      case 'ai-distill':
        // TODO [v0.5.0-B1.4]: 调用 AI 提炼要点 — 需调用 summarize API 提取关键点
        toast({ type: 'info', message: 'AI 提炼功能即将上线' });
        break;
      case 'ai-highlight':
        // 使用 TipTap 高亮命令直接标记选中文本
        editor.chain().focus().toggleHighlight().run();
        break;
    }
  }, [editor, persistCards, onFlashcardError, toast]);

  /** 挂到编辑区容器：仅有选区时接管右键 */
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (!editor || disabled) return;
    const { from, to } = editor.state.selection;
    if (from === to) return; // 无选中，fallthrough 到默认右键
    const selected = editor.state.doc.textBetween(from, to, ' ');
    if (!selected.trim()) return;
    handleContextMenu(e, selected);
  }, [editor, disabled, handleContextMenu]);

  return { isOpen, position, context, groups, handleSelect, onContextMenu, close };
}
