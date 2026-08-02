/**
 * 编辑器选中文本右键菜单 hook（AI 操作）
 *
 * @ai-context: 从 NoteEditPage 拆出。仅在 TipTap 有非空选区时接管右键
 * （否则 fallthrough 到浏览器默认菜单）；康奈尔模板不启用。
 * 四项 AI 操作：生成闪卡（走 persistCards 落库）、解释概念（调用
 * summarize API paragraph 风格）、提炼要点（调用 summarize API bullet
 * 风格）、高亮标记（直接执行 TipTap 命令）。
 */
import { useMemo, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { Sparkles } from 'lucide-react';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { useContextMenu } from '@/lib/contextMenu';
import { useToast } from '@/components/ui';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';

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
      case 'ai-explain': {
        // AI 解释概念：调用 summarize API，以段落风格对选中文本生成解释
        toast({ type: 'info', message: '正在生成解释…', duration: 1500 });
        aiPluginLoader
          .summarizeNote(selectedText, { maxLength: 300, style: 'paragraph', language: 'zh' })
          .then((result) => {
            // 展示 AI 解释结果（截取摘要文本，toast 最长 6 秒）
            toast({ type: 'success', message: result.summary, duration: 6000 });
          })
          .catch((err: unknown) => {
            // 离线或 AI 不可用时给出友好提示
            const msg = err instanceof Error ? err.message : '未知错误';
            toast({ type: 'error', message: `AI 解释失败：${msg}` });
          });
        break;
      }
      case 'ai-distill': {
        // AI 提炼要点：调用 summarize API，以 bullet 风格提取选中文本的关键点
        toast({ type: 'info', message: '正在提炼要点…', duration: 1500 });
        aiPluginLoader
          .summarizeNote(selectedText, { maxLength: 200, style: 'bullet', language: 'zh' })
          .then((result) => {
            // 展示提炼出的关键要点
            toast({ type: 'success', message: result.summary, duration: 6000 });
          })
          .catch((err: unknown) => {
            // 离线或 AI 不可用时给出友好提示
            const msg = err instanceof Error ? err.message : '未知错误';
            toast({ type: 'error', message: `AI 提炼失败：${msg}` });
          });
        break;
      }
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
