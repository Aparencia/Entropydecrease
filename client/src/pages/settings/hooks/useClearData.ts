/**
 * @ai-context: 设置页 Hook：useClearData。
 */
import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { db } from '@/lib/storage/database';

/**
 * 清除数据逻辑 Hook
 * 管理清除数据对话框状态和清除操作。
 */
export function useClearData() {
  const { toast } = useToast();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  const clearNotes = async () => {
    setShowClearDialog(false);
    setClearing(true);
    try {
      await db.transaction('rw', [db.notes, db.noteFolders], async () => {
        await db.notes.clear();
        await db.noteFolders.clear();
      });
      toast({ type: 'success', message: '笔记数据已清除' });
    } catch {
      toast({ type: 'error', message: '清除失败，请重试' });
    } finally {
      setClearing(false);
    }
  };

  const clearAll = async () => {
    setShowClearConfirm(false);
    setClearing(true);
    try {
      await db.transaction('rw', [
        db.pomodoroSessions, db.pomodoroSettings,
        db.notes, db.noteFolders,
        db.flashcardDecks, db.flashcards, db.flashcardReviews,
        db.feynmanNotes, db.feynmanSummaries, db.feynmanWeakPoints,
        db.operationLog, db.appSettings,
        db.studyCheckIns, db.achievements,
        db.pomodoroGoals, db.syncConflicts, db.offlineQueue,
        db.windowCaptures, db.windowCaptureSegments,
      ], async () => {
        await db.pomodoroSessions.clear();
        await db.pomodoroSettings.clear();
        await db.notes.clear();
        await db.noteFolders.clear();
        await db.flashcardDecks.clear();
        await db.flashcards.clear();
        await db.flashcardReviews.clear();
        await db.feynmanNotes.clear();
        await db.feynmanSummaries.clear();
        await db.feynmanWeakPoints.clear();
        await db.operationLog.clear();
        await db.appSettings.clear();
        await db.studyCheckIns.clear();
        await db.achievements.clear();
        await db.pomodoroGoals.clear();
        await db.syncConflicts.clear();
        await db.offlineQueue.clear();
        await db.windowCaptures.clear();
        await db.windowCaptureSegments.clear();
      });
      localStorage.clear();
      toast({ type: 'success', message: '所有数据已清除，即将刷新' });
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      toast({ type: 'error', message: '清除失败，请重试' });
    } finally {
      setClearing(false);
      setClearConfirmText('');
    }
  };

  return {
    showClearDialog, setShowClearDialog,
    showClearConfirm, setShowClearConfirm,
    clearConfirmText, setClearConfirmText,
    clearing,
    clearNotes, clearAll,
  };
}
