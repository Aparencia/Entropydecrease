/**
 * 学习会话 — 右键菜单 hook（分组与选择处理）
 *
 * @ai-context: 从 StudySessionPage 拆出。分组动态生成：无当前卡时禁用难度
 * 阶梯入口；选择处理按 key 分发——搁置（dueDate 推后一年）/ 标记困难
 * （easeFactor -0.2，下限 1.3）/ AI 优化 / AI 记忆术（懒加载，失败 toast
 * 降级）/ 难度阶梯。toast 由 hook 自取，弹窗入口由父级注入。
 * @ai-context: Extracted from StudySessionPage. Groups are built dynamically
 * (difficulty-ladder disabled without a current card); selection dispatches
 * suspend / mark-hard / ai-optimize / ai-mnemonic (lazy, toast fallback) /
 * difficulty-ladder. toast comes from the hook; modal entry points are
 * injected by the parent.
 */
import { useCallback, useMemo } from 'react';
import { useToast } from '@/components/ui';
import type { ContextMenuGroup } from '@/components/ui/ContextMenu';
import { PauseCircle, AlertTriangle, Sparkles, Gauge } from 'lucide-react';
import type { Flashcard } from '@/types/models';

export interface UseSessionContextMenuDeps {
  current: Flashcard | undefined;
  updateCard: (id: string, changes: Partial<Flashcard>) => Promise<void>;
  aiOptimize: (front: string, back: string) => Promise<unknown>;
  generateMnemonic: (front: string, back: string) => Promise<unknown>;
  onOptimizeModal: () => void;
  onMnemonicModal: () => void;
  onDifficultyModal: () => void;
}

export function useSessionContextMenu({
  current, updateCard, aiOptimize, generateMnemonic,
  onOptimizeModal, onMnemonicModal, onDifficultyModal,
}: UseSessionContextMenuDeps) {
  const { toast } = useToast();

  // 右键菜单分组（动态生成：无当前卡时禁用难度阶梯入口）
  const groups = useMemo<ContextMenuGroup[]>(() => [
    {
      label: '学习操作',
      items: [
        { key: 'suspend', label: '搁置当前卡', icon: <PauseCircle className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'mark-hard', label: '标记困难', icon: <AlertTriangle className="w-4 h-4" strokeWidth={1.5} /> },
      ],
    },
    {
      label: 'AI 操作',
      items: [
        { key: 'ai-optimize', label: 'AI 优化卡片内容', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
        { key: 'ai-mnemonic', label: '✨ 记忆术提示', icon: <Sparkles className="w-4 h-4" strokeWidth={1.5} /> },
        // 自适应挑战阶梯：展示当前卡档位（间隔信号驱动），无当前卡时禁用
        { key: 'difficulty-ladder', label: '🎯 难度阶梯', icon: <Gauge className="w-4 h-4" strokeWidth={1.5} />, disabled: !current },
      ],
    },
  ], [current]);

  const handleSelect = useCallback(async (itemKey: string, card: Flashcard) => {
    switch (itemKey) {
      case 'suspend': {
        const farFuture = new Date();
        farFuture.setFullYear(farFuture.getFullYear() + 1);
        updateCard(card.id, { dueDate: farFuture });
        toast({ type: 'success', message: '卡片已搁置，请继续学习其他卡片' });
        break;
      }
      case 'mark-hard': {
        const newEaseFactor = Math.max(1.3, card.easeFactor - 0.2);
        updateCard(card.id, { lapses: card.lapses + 1, easeFactor: newEaseFactor });
        toast({ type: 'success', message: '已标记为困难卡片，后续会更频繁复习' });
        break;
      }
      case 'ai-optimize': {
        await aiOptimize(card.front, card.back);
        onOptimizeModal();
        break;
      }
      case 'ai-mnemonic': {
        // P2 记忆术：生成谐音/故事/空间联想提示（懒加载，失败 toast 降级）
        try {
          await generateMnemonic(card.front, card.back);
          onMnemonicModal();
        } catch {
          toast({ type: 'warning', message: '记忆术生成失败，请稍后重试' });
        }
        break;
      }
      case 'difficulty-ladder': {
        // 自适应挑战阶梯：展示当前卡档位（纯本地展示，无需 AI 调用）
        onDifficultyModal();
        break;
      }
    }
  }, [updateCard, toast, aiOptimize, generateMnemonic, onOptimizeModal, onMnemonicModal, onDifficultyModal]);

  return { groups, handleSelect };
}
