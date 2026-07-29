/**
 * 牌组详情 — 卡片编辑 / AI 生成 / 删除确认三个弹窗
 *
 * @ai-context: 从 DeckDetailPage 拆出。编辑弹窗按 editingCardId 区分新建/
 * 修改；AI 生成弹窗两段式——先输入知识内容生成，再逐张"添加到卡组"（
 * 不自动落库，避免生成质量不佳时污染牌组），错误源于缺 API Key 时给出
 * 设置页引导。删除为不可撤销操作，标题展示卡片正面前 30 字。
 */
import { Button, Card, Modal, Input } from '@/components/ui';
import { Sparkles, Trash2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Flashcard as AIFlashcard } from '@/lib/ai/types';

export interface CardEditModalProps {
  open: boolean;
  /** 非 null 表示编辑已有卡片 */
  editingCardId: string | null;
  front: string;
  back: string;
  saving: boolean;
  onFrontChange: (v: string) => void;
  onBackChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export function CardEditModal({
  open, editingCardId, front, back, saving,
  onFrontChange, onBackChange, onClose, onSave,
}: CardEditModalProps) {
  const isEditing = editingCardId !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? '编辑卡片' : '添加卡片'}
      description={isEditing ? '修改卡片正面和背面内容' : '创建一张新的基础卡片'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={onSave} loading={saving} disabled={!front.trim() || !back.trim()}>
            {isEditing ? '保存' : '添加'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-kb-md">
        <Input
          label="正面（问题）"
          placeholder="输入卡片正面的问题或概念"
          value={front}
          onChange={(e) => onFrontChange(e.target.value)}
          autoFocus
        />
        <Input
          label="背面（答案）"
          placeholder="输入卡片背面的答案或解释"
          value={back}
          onChange={(e) => onBackChange(e.target.value)}
        />
      </div>
    </Modal>
  );
}

export interface AIGenerateModalProps {
  open: boolean;
  inputContent: string;
  generatedCards: AIFlashcard[];
  loading: boolean;
  error: string | null | undefined;
  needsConfig?: boolean;
  /** 正在添加的卡片下标 */
  addingIndex: number | null;
  onInputChange: (v: string) => void;
  onClose: () => void;
  onGenerate: () => void;
  onAddCard: (card: AIFlashcard, index: number) => void;
  onGoSettings: () => void;
}

export function AIGenerateModal({
  open, inputContent, generatedCards, loading, error, needsConfig, addingIndex,
  onInputChange, onClose, onGenerate, onAddCard, onGoSettings,
}: AIGenerateModalProps) {
  const hasResult = generatedCards.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 生成闪卡"
      description="输入知识内容，AI 将自动生成闪卡"
      size="lg"
      footer={
        hasResult ? (
          <Button variant="secondary" onClick={onClose}>关闭</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button
              onClick={onGenerate}
              loading={loading}
              disabled={!inputContent.trim()}
              icon={<Sparkles className="w-icon-sm h-icon-sm" />}
            >
              生成闪卡
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-kb-md">
        {!hasResult ? (
          <>
            <div>
              <label className="text-b2 font-medium text-text-primary mb-kb-xs block">知识内容</label>
              <textarea
                value={inputContent}
                onChange={(e) => onInputChange(e.target.value)}
                placeholder="粘贴或输入笔记、教材内容等，AI 将提取关键信息生成闪卡…"
                className={cn(
                  'w-full min-h-[120px] p-kb-md bg-bg-secondary border border-border/50 rounded-kb-md',
                  'text-b2 text-text-primary placeholder:text-text-tertiary/60',
                  'outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20',
                  'resize-y',
                )}
              />
            </div>
            {error && (
              <div className="p-3 rounded-kb-md bg-semantic-error/10 border border-semantic-error/20 text-b2 text-semantic-error">
                {error}
                {needsConfig && (
                  <button
                    onClick={onGoSettings}
                    className="mt-2 block text-b3 underline hover:no-underline"
                  >
                    前往设置页配置 API Key
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-kb-sm kb-ai-result-enter">
            <p className="text-b2 text-text-tertiary mb-1">
              生成 {generatedCards.length} 张闪卡，点击「添加到卡组」将其加入当前牌组：
            </p>
            {generatedCards.map((card, idx) => (
              <Card key={idx} padding="sm" className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-b2 font-medium text-text-primary">{card.front}</p>
                  <p className="text-b3 text-text-secondary mt-0.5">{card.back}</p>
                  {card.hint && <p className="text-c1 text-text-tertiary mt-0.5 italic">提示：{card.hint}</p>}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Check className="w-icon-sm h-icon-sm" />}
                  disabled={addingIndex === idx}
                  onClick={() => onAddCard(card, idx)}
                >
                  {addingIndex === idx ? '添加中…' : '添加到卡组'}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export interface DeleteCardModalProps {
  open: boolean;
  /** 待删除卡片的正面文本（用于确认提示） */
  cardFront: string | undefined;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteCardModal({ open, cardFront, onClose, onConfirm }: DeleteCardModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="删除卡片"
      description={`确定要删除卡片「${cardFront?.slice(0, 30) ?? ''}」吗？该操作不可撤销。`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={onConfirm}
          >
            删除
          </Button>
        </>
      }
    >
      <div />
    </Modal>
  );
}
