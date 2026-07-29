/**
 * @ai-context: 通用组件：ImportPreviewModal。
 */
import { Modal, Button } from '@/components/ui';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { Layers, AlertTriangle, Merge, SkipForward } from 'lucide-react';
import type { KbanDeckFile } from '@/types/models';

interface ImportPreviewModalProps {
  open: boolean;
  onClose: () => void;
  deckData: KbanDeckFile | null;
  hasConflict: boolean;
  existingDeckId?: string;
  onConfirmNew: () => void;         // 无冲突时确认导入
  onOverwrite: () => void;         // 覆盖
  onSkip: () => void;              // 跳过
  onMerge: () => void;             // 合并
  loading?: boolean;
}

export default function ImportPreviewModal({
  open,
  onClose,
  deckData,
  hasConflict,
  onConfirmNew,
  onOverwrite,
  onSkip,
  onMerge,
  loading = false,
}: ImportPreviewModalProps) {
  if (!deckData) return null;

  const cardCount = deckData.deck.cardCount ?? deckData.cards.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hasConflict ? '牌组冲突' : '导入预览'}
      size="md"
    >
      <div className="flex flex-col gap-kb-md">
        {/* 牌组信息 */}
        <div className="bg-bg-elevated rounded-kb-xl p-kb-md flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-kb-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
              <Layers className="w-5 h-5 text-brand-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-b1 font-semibold text-text-primary truncate">
                {deckData.deck.name}
              </h3>
              {deckData.deck.description && (
                <p className="text-b3 text-text-tertiary mt-0.5 line-clamp-2">
                  {deckData.deck.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-c1 text-text-secondary">
            <span>卡片数量：{cardCount} 张</span>
            {deckData.author && <span>导出者：{deckData.author}</span>}
          </div>
        </div>

        {/* 冲突提示 */}
        {hasConflict && (
          <div className="flex items-start gap-2 p-kb-sm rounded-kb-lg bg-warning-500/10 text-warning-600">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-b3">
              已存在同名牌组「{deckData.deck.name}」，请选择处理方式：
            </p>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      {!hasConflict ? (
        <div className="flex justify-end gap-2 mt-kb-md">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => { soundPlayer.play('ui_click'); onConfirmNew(); }} loading={loading}>
            确认导入
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mt-kb-md">
          <Button
            className="bg-error-500 text-white hover:bg-error-600"
            icon={<AlertTriangle className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={onOverwrite}
            loading={loading}
          >
            覆盖 — 删除旧牌组，导入新数据
          </Button>
          <Button
            variant="secondary"
            className="bg-bg-tertiary"
            icon={<SkipForward className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={onSkip}
          >
            跳过 — 取消导入
          </Button>
          <Button
            className="bg-brand-500 text-white hover:bg-brand-600"
            icon={<Merge className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={onMerge}
            loading={loading}
          >
            合并 — 将新卡片追加到现有牌组
          </Button>
        </div>
      )}
    </Modal>
  );
}
