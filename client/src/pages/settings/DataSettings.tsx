import { useState, useEffect, useRef } from 'react';
import { Card, Button, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { HardDrive, Download, Upload, FolderOpen, AlertTriangle, Lock, Shield, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/utils/platform';
import {
  exportAllData,
  downloadExport,
  importData,
  readFileAsText,
  getStorageInfo,
} from '@/lib/storage';
import type { StorageInfo } from '@/lib/storage';
import { encryptBackup, decryptBackup, type EncryptedBackup } from '@/lib/crypto/backupCrypto';
import { syncEngine } from '@/lib/sync/SyncEngine';
import { db } from '@/lib/storage/database';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

export default function DataSettings() {
  const { toast } = useToast();

  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [currentPath, setCurrentPath] = useState<string>(
    isElectron() ? '正在获取…' : '浏览器存储（IndexedDB）'
  );
  const [defaultPath, setDefaultPath] = useState<string>('');
  const [isChanging, setIsChanging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // v0.9.0: Encrypted backup state
  const [backupPassword, setBackupPassword] = useState('');
  const [creatingEncryptedBackup, setCreatingEncryptedBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [restorePassword, setRestorePassword] = useState('');
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // 清除数据状态
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let mounted = true;

    getStorageInfo().then((info) => {
      if (mounted && info) setStorageInfo(info);
    });
    const savedPath = localStorage.getItem('keban-data-path');
    // 先获取 Electron 实际默认路径，再决定显示内容
    if (window.electronAPI) {
      // 设置超时：若 IPC 5 秒未响应，显示 fallback
      const timeoutId = setTimeout(() => {
        if (!savedPath) {
          setCurrentPath((prev) =>
            prev === '正在获取…' ? '未知路径（IPC 超时）' : prev
          );
        }
      }, 5000);

      Promise.all([
        window.electronAPI.invoke('get-default-storage-path'),
        window.electronAPI.storage?.getActivePath() ?? Promise.resolve(null),
      ]).then(([defaultP, activeP]) => {
        clearTimeout(timeoutId);
        if (!mounted) return;
        setDefaultPath(defaultP as string);
        // activeP 为 null 时（storage API 不可用），回退到 localStorage 或默认路径
        setCurrentPath((activeP as string) || savedPath || (defaultP as string));
      }).catch(() => {
        clearTimeout(timeoutId);
        if (!mounted) return;
        setCurrentPath(savedPath || '默认路径');
      });

      return () => {
        mounted = false;
        clearTimeout(timeoutId);
      };
    } else if (!savedPath) {
      // 非 Electron 环境且无自定义路径
      setCurrentPath('浏览器存储（IndexedDB）');
    }
    // Electron 路径通过 Promise.all 获取（见上方）
    return () => { mounted = false; };
  }, []);

  const handleExport = async () => {
    try {
      setExporting(true);
      const json = await exportAllData();
      downloadExport(json);
      soundPlayer.play('data_export');
      toast({ type: 'success', message: '数据导出成功', silent: true });
    } catch {
      toast({ type: 'error', message: '导出失败，请重试' });
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input 以便同一文件可以再次选择
    e.target.value = '';

    try {
      setImporting(true);
      const text = await readFileAsText(file);
      const result = await importData(text);
      if (result.success) {
        soundPlayer.play('data_import');
        toast({ type: 'success', message: result.message, silent: true });
        // 刷新页面以加载新数据
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast({ type: 'error', message: result.message });
      }
    } catch {
      toast({ type: 'error', message: '导入失败，请检查文件格式' });
    } finally {
      setImporting(false);
    }
  };

  // v0.9.0: Create encrypted backup
  const handleEncryptedBackup = async () => {
    try {
      setCreatingEncryptedBackup(true);
      const json = await exportAllData();
      const plaintext = JSON.stringify(json);

      if (backupPassword.trim()) {
        const encrypted = await encryptBackup(plaintext, backupPassword);
        const blob = new Blob([JSON.stringify(encrypted)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `keban-backup-encrypted-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        soundPlayer.play('data_export');
        toast({ type: 'success', message: '加密备份已下载', silent: true });
      } else {
        downloadExport(json);
        soundPlayer.play('data_export');
        toast({ type: 'success', message: '数据导出成功（未加密）', silent: true });
      }
    } catch {
      toast({ type: 'error', message: '备份失败，请重试' });
    } finally {
      setCreatingEncryptedBackup(false);
    }
  };

  // v0.9.0: Restore from backup file (auto-detect encrypted/plain)
  const handleBackupFileClick = () => {
    backupFileInputRef.current?.click();
  };

  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      setRestoringBackup(true);
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);

      // Auto-detect: if parsed has salt+iv+ciphertext, it's encrypted
      if (parsed.salt && parsed.iv && parsed.ciphertext) {
        if (!restorePassword.trim()) {
          toast({ type: 'error', message: '这是加密备份，请输入解密密码' });
          setRestoringBackup(false);
          return;
        }
        const plaintext = await decryptBackup(parsed as EncryptedBackup, restorePassword);
        const result = await importData(plaintext);
        if (result.success) {
          soundPlayer.play('data_import');
          toast({ type: 'success', message: result.message, silent: true });
          setTimeout(() => window.location.reload(), 800);
        } else {
          toast({ type: 'error', message: result.message });
        }
      } else {
        // Plain JSON backup
        const result = await importData(text);
        if (result.success) {
          soundPlayer.play('data_import');
          toast({ type: 'success', message: result.message, silent: true });
          setTimeout(() => window.location.reload(), 800);
        } else {
          toast({ type: 'error', message: result.message });
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('decrypt')) {
        toast({ type: 'error', message: '解密失败，请检查密码是否正确' });
      } else {
        toast({ type: 'error', message: '恢复失败，请检查文件格式' });
      }
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleSelectDirectory = async () => {
    if (!isElectron()) {
      toast({ type: 'error', message: '请在桌面端使用此功能' });
      return;
    }

    try {
      setIsChanging(true);
      if (!window.electronAPI) {
        toast({ type: 'error', message: '请在桌面端使用此功能' });
        return;
      }
      const result = await window.electronAPI.invoke('dialog:selectDirectory', {
        title: '选择数据存储目录',
      }) as { canceled: boolean; path?: string };

      if (!result.canceled && result.path) {
        const confirmed = window.confirm(
          `确定要将数据存储路径更改为：\n${result.path}\n\n` +
          `数据将自动迁移到新路径，迁移期间请等待。`,
        );

        if (confirmed) {
          // 暂停同步引擎，防止切换过程中触发同步
          syncEngine.pause();

          try {
            if (!window.electronAPI.storage) {
              toast({ type: 'error', message: '存储 API 不可用，请重启应用后重试' });
              syncEngine.resume();
              return;
            }
            const migrationResult = await window.electronAPI.storage.changePath(result.path);

            if (migrationResult.success) {
              setCurrentPath(migrationResult.newPath!);
              toast({ type: 'success', message: '存储路径已切换，数据迁移完成' });
            } else {
              toast({ type: 'error', message: migrationResult.error || '路径切换失败' });
            }
          } finally {
            // 无论成功失败，恢复同步引擎
            syncEngine.resume();
            syncEngine.sync(); // 触发一次同步，fire-and-forget
          }
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
      toast({ type: 'error', message: '选择目录失败，请重试' });
      // 确保异常时也恢复同步
      syncEngine.resume();
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <h2 className="text-b1 font-semibold text-text-primary">数据与存储</h2>

      {/* 存储使用情况 */}
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-kb-md',
        'bg-bg-secondary border border-border/40',
      )}>
        <div className={cn(
          'w-9 h-9 rounded-kb-md flex items-center justify-center flex-shrink-0',
          'bg-brand-50 text-brand-500',
        )}>
          <HardDrive className="w-5 h-5" strokeWidth={1.5} />
        </div>
        <div className="flex-1">
          <p className="text-b2 font-medium text-text-primary">存储使用情况</p>
          <p className="text-c1 text-text-tertiary">
            已使用{' '}
            <span className="text-brand-600 font-medium">
              {storageInfo ? storageInfo.formatted.used : '—'}
            </span>
            {storageInfo && storageInfo.quota > 0
              ? ` / ${storageInfo.formatted.quota}`
              : ' / 不限'}
          </p>
        </div>
      </div>

      {/* 存储路径选择 */}
      <div className={cn(
        'flex flex-col gap-2 p-3 rounded-kb-md',
        'bg-bg-secondary border border-border/40',
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-9 h-9 rounded-kb-md flex items-center justify-center flex-shrink-0',
            'bg-brand-50 text-brand-500',
          )}>
            <FolderOpen className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-b2 font-medium text-text-primary">数据存储路径</p>
            <p className="text-c1 text-text-tertiary font-mono truncate mt-0.5">
              {currentPath}
            </p>
            {defaultPath && currentPath === defaultPath && (
              <p className="text-c2 text-text-tertiary/70 mt-0.5">
                当前使用默认路径
              </p>
            )}
          </div>
        </div>
      </div>

      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-kb-md',
        'bg-brand-50 border border-brand-200/40',
      )}>
        <AlertTriangle className="w-4 h-4 text-brand-500 flex-shrink-0" strokeWidth={1.5} />
        <p className="text-c1 text-text-secondary leading-relaxed">
          切换路径后，数据将自动迁移到新位置。请确保目标磁盘有足够空间。
        </p>
      </div>

      <Button
        variant="secondary"
        size="md"
        icon={<FolderOpen className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
        className="w-full"
        onClick={handleSelectDirectory}
        disabled={isChanging}
      >
        {isChanging ? '选择中…' : '更改存储路径'}
      </Button>

      {/* 导出/导入 */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="md"
          icon={<Download className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? '导出中…' : '导出数据'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          icon={<Upload className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={handleImportClick}
          disabled={importing}
        >
          {importing ? '导入中…' : '导入数据'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* v0.9.0: 本地加密备份 */}
      <div className="border-t border-border/30 pt-kb-md flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <h3 className="text-b2 font-medium text-text-primary">本地加密备份</h3>
        </div>
        <p className="text-c1 text-text-tertiary">
          使用 AES-256-GCM 加密你的备份数据，设置密码保护隐私。
        </p>
        <Input
          size="sm"
          type="password"
          placeholder="设置备份密码（可选，留空则不加密）"
          value={backupPassword}
          onChange={(e) => setBackupPassword(e.target.value)}
        />
        <Button
          variant="primary"
          size="md"
          icon={<Shield className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={handleEncryptedBackup}
          disabled={creatingEncryptedBackup}
        >
          {creatingEncryptedBackup
            ? '创建中…'
            : backupPassword.trim()
              ? '创建加密备份'
              : '创建备份（未加密）'}
        </Button>
      </div>

      {/* 清除数据 */}
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
            onClick={async () => {
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
            }}
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
              onClick={async () => {
                setShowClearConfirm(false);
                setClearing(true);
                try {
                  // 清除所有 Dexie 表
                  await db.transaction('rw', [
                    db.pomodoroSessions, db.pomodoroSettings,
                    db.notes, db.noteFolders,
                    db.flashcardDecks, db.flashcards, db.flashcardReviews,
                    db.feynmanNotes, db.feynmanSummaries, db.feynmanWeakPoints,
                    db.operationLog, db.appSettings,
                    db.studyCheckIns, db.achievements,
                    db.pomodoroGoals, db.syncConflicts, db.offlineQueue,
                    db.windowCaptures,
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
                  });
                  // 清除 localStorage
                  localStorage.clear();
                  soundPlayer.play('data_cleared');
                  toast({ type: 'success', message: '所有数据已清除，即将刷新', silent: true });
                  setTimeout(() => window.location.reload(), 1000);
                } catch {
                  toast({ type: 'error', message: '清除失败，请重试' });
                } finally {
                  setClearing(false);
                  setClearConfirmText('');
                }
              }}
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

      {/* v0.9.0: 恢复数据 */}
      <div className="border-t border-border/30 pt-kb-md flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <h3 className="text-b2 font-medium text-text-primary">恢复数据</h3>
        </div>
        <p className="text-c1 text-text-tertiary">
          支持普通备份和加密备份文件，自动检测文件格式。
        </p>
        <Input
          size="sm"
          type="password"
          placeholder="解密密码（仅加密备份需要）"
          value={restorePassword}
          onChange={(e) => setRestorePassword(e.target.value)}
        />
        <Button
          variant="secondary"
          size="md"
          icon={<Upload className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={handleBackupFileClick}
          disabled={restoringBackup}
        >
          {restoringBackup ? '恢复中…' : '选择备份文件'}
        </Button>
        <input
          ref={backupFileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleBackupFileChange}
        />
      </div>
    </Card>
  );
}
