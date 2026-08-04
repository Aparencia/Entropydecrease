/**
 * 清除数据区块（含两级确认对话框）
 *
 * @ai-context: 从 DataSettings 拆出。清除全部数据需输入「确认清除」二次
 * 确认（防误触）；清除范围为 Dexie 全表 + localStorage.clear()，不可
 * 恢复，UI 已强提示先备份。表清单须与 db/schema 同步维护。
 */
import { useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { db } from '@/lib/storage/database';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

export function ClearDataSection() {
  const { toast } = useToast();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  const handleClearNotes = async () => {
    setShowClearDialog(false);
    setClearing(true);
    try {
      await db.transaction('rw', [db.notes, db.noteFolders], async () => {
        await db.notes.clear();
        await db.noteFolders.clear();
      });
      soundPlayer.play('data_cleared');
      toast({ type: 'success', message: '笔记数据已清除', silent: true });
    } catch {
      toast({ type: 'error', message: '清除失败，请重试' });
    } finally {
      setClearing(false);
    }
  };

  const handleClearAll = async () => {
    setShowClearConfirm(false);
    setClearing(true);
    try {
      // 清除所有 Dexie 表（保持与 database.ts 中的表定义同步）
      await db.transaction('rw', [
        db.pomodoroSessions, db.pomodoroSettings, db.pomodoroPresets, db.pomodoroGoals,
        db.notes, db.noteFolders, db.noteLinks,
        db.flashcardDecks, db.flashcards, db.flashcardReviews,
        db.feynmanNotes, db.feynmanSummaries, db.feynmanWeakPoints, db.feynmanAIResults,
        db.operationLog, db.appSettings,
        db.studyCheckIns, db.achievements,
        db.syncConflicts, db.offlineQueue,
        db.windowCaptures, db.windowCaptureSegments,
        db.consent, db.userProfile,
        db.inspirations, db.searchIndex,
        db.classroomNotes,
        db.crdtDocs, db.crdtChanges,
        db.ritualRecords,
        db.deepSeaDiscoveries, db.coralEcosystem,
        db.streakState,
        db.predictions,
        db.hotwords,
      ], async () => {
        await db.pomodoroSessions.clear();
        await db.pomodoroSettings.clear();
        await db.pomodoroPresets.clear();
        await db.pomodoroGoals.clear();
        await db.notes.clear();
        await db.noteFolders.clear();
        await db.noteLinks.clear();
        await db.flashcardDecks.clear();
        await db.flashcards.clear();
        await db.flashcardReviews.clear();
        await db.feynmanNotes.clear();
        await db.feynmanSummaries.clear();
        await db.feynmanWeakPoints.clear();
        await db.feynmanAIResults.clear();
        await db.operationLog.clear();
        await db.appSettings.clear();
        await db.studyCheckIns.clear();
        await db.achievements.clear();
        await db.syncConflicts.clear();
        await db.offlineQueue.clear();
        await db.windowCaptures.clear();
        await db.windowCaptureSegments.clear();
        await db.consent.clear();
        await db.userProfile.clear();
        await db.inspirations.clear();
        await db.searchIndex.clear();
        await db.classroomNotes.clear();
        await db.crdtDocs.clear();
        await db.crdtChanges.clear();
        await db.ritualRecords.clear();
        await db.deepSeaDiscoveries.clear();
        await db.coralEcosystem.clear();
        await db.streakState.clear();
        await db.predictions.clear();
        await db.hotwords.clear();
      });
      // 清除 localStorage 中的加密密钥派生材料（需在表清除后执行，以免影响表清除）
      // 注意：不清除所有 localStorage 键，仅清除应用相关键，避免破坏其他应用的数据
      const appKeys = Object.keys(localStorage).filter(k =>
        k.startsWith('keban_') || k.startsWith('keban-') || k.startsWith('entropydecrease_') || k.startsWith('entropy_')
      );
      appKeys.forEach(k => localStorage.removeItem(k));
      // 清除后显式重置应用模式为 local
      localStorage.setItem('ed_app_mode', 'local');
      soundPlayer.play('data_cleared');
      toast({ type: 'success', message: '所有数据已清除，即将刷新', silent: true });
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      toast({ type: 'error', message: '清除失败，请重试' });
    } finally {
      setClearing(false);
      setClearConfirmText('');
    }
  };

  return (
    <>
      <div className="border-t border-border/30 pt-kb-md flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Trash2 className="w-4 h-4 text-red-400" strokeWidth={1.5} />
          <h3 className="text-b2 font-medium text-text-primary">清除数据</h3>
        </div>
        <p className="text-c1 text-text-tertiary">
          清除部分或全部本地数据，此操作不可撤销，建议先导出备份。
        </p>
        <Button
          variant="secondary"
          size="md"
          icon={<Trash2 className="w-icon-sm h-icon-sm text-red-400" strokeWidth={1.5} />}
          className="w-full text-red-400 hover:bg-red-500/10 border-red-400/30 hover:border-red-400/50"
          onClick={() => setShowClearDialog(true)}
        >
          清除数据
        </Button>
      </div>

      {/* 清除数据选择对话框 */}
      <Modal
        open={showClearDialog}
        onClose={() => setShowClearDialog(false)}
        title="清除数据"
        description="选择要清除的数据范围，此操作不可撤销"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowClearDialog(false)}>
              取消
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 py-2">
          <Button
            variant="secondary"
            size="md"
            className="w-full justify-start text-left"
            onClick={handleClearNotes}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-medium">清除笔记数据</span>
              <span className="text-c2 text-text-tertiary font-normal">仅清除结礁和文件夹</span>
            </div>
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="w-full justify-start text-left border-red-400/30 hover:border-red-400/50 hover:bg-red-500/10"
            onClick={() => {
              setShowClearDialog(false);
              setShowClearConfirm(true);
              setClearConfirmText('');
            }}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-medium text-red-400">清除全部数据</span>
              <span className="text-c2 text-text-tertiary font-normal">清除所有本地数据，恢复出厂状态</span>
            </div>
          </Button>
        </div>
      </Modal>

      {/* 清除全部二次确认对话框 */}
      <Modal
        open={showClearConfirm}
        onClose={() => {
          setShowClearConfirm(false);
          setClearConfirmText('');
        }}
        title="确认清除全部数据"
        description="此操作将清除所有本地数据（笔记、牌组、番茄钟记录、设置等），且不可恢复"
        size="sm"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowClearConfirm(false);
                setClearConfirmText('');
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50"
              disabled={clearConfirmText !== '确认清除' || clearing}
              onClick={handleClearAll}
            >
              {clearing ? '清除中…' : '确认清除'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 py-2">
          <div className={cn(
            'flex items-center gap-2 p-3 rounded-kb-md',
            'bg-red-500/10 border border-red-400/30',
          )}>
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" strokeWidth={1.5} />
            <p className="text-c1 text-red-300 leading-relaxed">
              警告：此操作将永久删除所有本地数据，包括笔记、牌组、番茄钟记录、设置等。
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-c1 text-text-secondary">
              请输入 <span className="font-mono font-bold text-red-400">确认清除</span> 以继续：
            </label>
            <Input
              size="sm"
              placeholder="输入「确认清除」"
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
