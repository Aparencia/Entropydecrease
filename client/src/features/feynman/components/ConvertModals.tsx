/**
 * 薄弱点转闪卡弹窗（牌组选择 + 完成确认）
 *
 * @ai-context: 从 FeynmanSessionPage 拆出。两个关联弹窗：
 * ConvertDeckModal 选择目标牌组；ConvertConfirmModal 在完成学习时询问
 * 是否将未掌握薄弱点转为闪卡。转化逻辑经回调由父组件执行。
 */
import { Button, Modal } from '@/components/ui';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlashcardDeck, FeynmanWeakPoint } from '@/types/models';

// ── 牌组选择弹窗 ──

interface ConvertDeckModalProps {
  open: boolean;
  onClose: () => void;
  decks: FlashcardDeck[];
  selectedDeckId: string | null;
  onSelectDeck: (id: string) => void;
  isConverting: boolean;
  onConfirm: () => void;
}

export function ConvertDeckModal({
  open, onClose, decks, selectedDeckId, onSelectDeck, isConverting, onConfirm,
}: ConvertDeckModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="选择目标牌组"
      description="将薄弱点转为闪卡，放入以下牌组中进行间隔复习"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            disabled={!selectedDeckId || isConverting}
            loading={isConverting}
            onClick={onConfirm}
          >
            确认生成
          </Button>
        </div>
      }
    >
      {decks.length === 0 ? (
        <p className="text-b2 text-text-tertiary text-center py-4">
          还没有牌组，请先在闪卡模块创建牌组
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {decks.map((deck) => (
            <button
              key={deck.id}
              onClick={() => onSelectDeck(deck.id)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-kb-md text-left',
                'border transition-all duration-kb-fast',
                selectedDeckId === deck.id
                  ? 'border-[#F59E0B] bg-[#F59E0B]/5'
                  : 'border-border/50 hover:bg-bg-tertiary',
              )}
            >
              <div
                className="w-3 h-3 rounded-kb-full flex-shrink-0"
                style={{ backgroundColor: deck.color || '#6B7280' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-b2 font-medium text-text-primary truncate">{deck.name}</p>
                {deck.description && (
                  <p className="text-c1 text-text-tertiary truncate">{deck.description}</p>
                )}
              </div>
              {selectedDeckId === deck.id && (
                <CheckCircle2 className="w-4 h-4 text-[#F59E0B] flex-shrink-0" strokeWidth={2} />
              )}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── 完成前转化确认弹窗 ──

interface ConvertConfirmModalProps {
  open: boolean;
  onClose: () => void;
  unmasteredPoints: FeynmanWeakPoint[];
  onDirectComplete: () => void;
  onConvertAndComplete: () => void;
}

export function ConvertConfirmModal({
  open, onClose, unmasteredPoints, onDirectComplete, onConvertAndComplete,
}: ConvertConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="完成学习"
      description={`你还有 ${unmasteredPoints.length} 个薄弱点未掌握，是否要将它们转为闪卡进行间隔复习？`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onDirectComplete}
          >
            直接完成
          </Button>
          <Button
            size="sm"
            onClick={onConvertAndComplete}
          >
            转为闪卡后完成
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
        {unmasteredPoints.map((wp) => (
          <div key={wp.id} className="flex items-start gap-2 p-2 rounded-kb-sm bg-bg-secondary">
            <Circle className="w-3.5 h-3.5 mt-0.5 text-[#F59E0B] flex-shrink-0" strokeWidth={1.5} />
            <p className="text-b3 text-text-secondary leading-relaxed">{wp.text}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
