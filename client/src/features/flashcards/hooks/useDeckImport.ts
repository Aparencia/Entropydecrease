/**
 * 牌组导入 — 文件读取与冲突处理流程 hook
 *
 * @ai-context: 从 FlashcardsPage 拆出。封装导入全流程：文件读取（importDeck）
 * → 冲突预览（new / overwrite / skip / merge 四选一）→ 成功后回调 onRefresh
 * 刷新列表（loadDecks + 重拉全部卡片）。导入中 importing 锁防止连点。
 * @ai-context: Extracted from FlashcardsPage. Owns the deck import flow:
 * file read (importDeck) → conflict preview (new / overwrite / skip / merge)
 * → list refresh through the parent-provided onRefresh callback. The
 * `importing` lock guards against double taps.
 */
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui';
import {
  importDeck,
  importDeckNew,
  importDeckOverwrite,
  importDeckSkip,
  importDeckMerge,
} from '@/lib/storage/exportImport';
import type { KbanDeckFile } from '@/types/models';

export interface UseDeckImportOptions {
  /** 导入成功后刷新列表（loadDecks + 重拉全部卡片） */
  onRefresh: () => Promise<void>;
}

export function useDeckImport({ onRefresh }: UseDeckImportOptions) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<KbanDeckFile | null>(null);
  const [previewConflict, setPreviewConflict] = useState(false);
  const [previewExistingId, setPreviewExistingId] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** 关闭预览并清空暂存数据 */
  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewData(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const result = await importDeck(file);
      setPreviewData(result.deckData);
      setPreviewConflict(result.hasConflict);
      setPreviewExistingId(result.existingDeckId);
      setPreviewOpen(true);
    } catch { toast({ type: 'error', message: '导入失败，请确认文件格式正确' }); }
    finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmNew = async () => {
    if (!previewData) return;
    setImporting(true);
    try {
      const result = await importDeckNew(previewData);
      toast({ type: 'success', message: `导入成功：${result.cardCount} 张卡片` });
      await onRefresh();
    } catch { toast({ type: 'error', message: '导入失败，请稍后重试' }); }
    finally { setImporting(false); closePreview(); }
  };

  const handleOverwrite = async () => {
    if (!previewData || !previewExistingId) return;
    setImporting(true);
    try {
      await importDeckOverwrite(previewData, previewExistingId);
      toast({ type: 'success', message: `已覆盖导入：${previewData.cards.length} 张卡片` });
      await onRefresh();
    } catch { toast({ type: 'error', message: '覆盖导入失败' }); }
    finally { setImporting(false); closePreview(); }
  };

  const handleSkip = () => {
    importDeckSkip();
    toast({ type: 'info', message: '已跳过导入' });
    closePreview();
  };

  const handleMerge = async () => {
    if (!previewData || !previewExistingId) return;
    setImporting(true);
    try {
      const count = await importDeckMerge(previewData, previewExistingId);
      toast({ type: 'success', message: `已合并 ${count} 张新卡片到现有牌组` });
      await onRefresh();
    } catch { toast({ type: 'error', message: '合并导入失败' }); }
    finally { setImporting(false); closePreview(); }
  };

  return {
    importing,
    previewOpen,
    previewData,
    previewConflict,
    previewExistingId,
    fileInputRef,
    handleImport,
    handleConfirmNew,
    handleOverwrite,
    handleSkip,
    handleMerge,
    closePreview,
  };
}
