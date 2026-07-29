/**
 * @ai-context: 设置页 Hook：useStoragePath。
 */
import { useState, useEffect } from 'react';
import { readWithLegacyMigration } from '@/lib/utils/legacyLocalStorage';
import { isElectron } from '@/lib/utils/platform';
import { getStorageInfo } from '@/lib/storage';
import type { StorageInfo } from '@/lib/storage';
import { syncEngine } from '@/lib/sync/SyncEngine';
import { useToast } from '@/components/ui/Toast';

/**
 * 存储路径管理 Hook
 * 管理当前存储路径、默认路径、路径切换逻辑。
 */
export function useStoragePath() {
  const { toast } = useToast();
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(isElectron() ? '正在获取…' : '浏览器存储（IndexedDB）');
  const [defaultPath, setDefaultPath] = useState<string>('');
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    let mounted = true;
    getStorageInfo().then((info) => { if (mounted && info) setStorageInfo(info); });
    const savedPath = readWithLegacyMigration('ed-data-path', 'keban-data-path');

    if (window.electronAPI) {
      const timeoutId = setTimeout(() => {
        if (!savedPath) setCurrentPath((prev) => prev === '正在获取…' ? '未知路径（IPC 超时）' : prev);
      }, 5000);

      Promise.all([
        window.electronAPI.invoke('get-default-storage-path'),
        window.electronAPI.storage?.getActivePath() ?? Promise.resolve(null),
      ]).then(([defaultP, activeP]) => {
        clearTimeout(timeoutId);
        if (!mounted) return;
        setDefaultPath(defaultP as string);
        setCurrentPath((activeP as string) || savedPath || (defaultP as string));
      }).catch(() => {
        clearTimeout(timeoutId);
        if (!mounted) return;
        setCurrentPath(savedPath || '默认路径');
      });

      return () => { mounted = false; clearTimeout(timeoutId); };
    } else if (!savedPath) {
      setCurrentPath('浏览器存储（IndexedDB）');
    }
    return () => { mounted = false; };
  }, []);

  const handleSelectDirectory = async () => {
    if (!isElectron()) { toast({ type: 'error', message: '请在桌面端使用此功能' }); return; }
    try {
      setIsChanging(true);
      if (!window.electronAPI) { toast({ type: 'error', message: '请在桌面端使用此功能' }); return; }
      const result = await window.electronAPI.invoke('dialog:selectDirectory', { title: '选择数据存储目录' }) as { canceled: boolean; path?: string };
      if (!result.canceled && result.path) {
        const confirmed = window.confirm(`确定要将数据存储路径更改为：\n${result.path}\n\n数据将自动迁移到新路径，迁移期间请等待。`);
        if (confirmed) {
          syncEngine.pause();
          try {
            if (!window.electronAPI.storage) { toast({ type: 'error', message: '存储 API 不可用，请重启应用后重试' }); syncEngine.resume(); return; }
            const migrationResult = await window.electronAPI.storage.changePath(result.path);
            if (migrationResult.success) {
              setCurrentPath(migrationResult.newPath!);
              toast({ type: 'success', message: '存储路径已切换，数据迁移完成' });
            } else {
              toast({ type: 'error', message: migrationResult.error || '路径切换失败' });
            }
          } finally { syncEngine.resume(); syncEngine.sync(); }
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
      toast({ type: 'error', message: '选择目录失败，请重试' });
      syncEngine.resume();
    } finally {
      setIsChanging(false);
    }
  };

  return { storageInfo, currentPath, defaultPath, isChanging, handleSelectDirectory };
}
