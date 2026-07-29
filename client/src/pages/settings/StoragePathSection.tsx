/**
 * 存储信息与路径切换区块
 *
 * @ai-context: 从 DataSettings 拆出。路径切换为事务式：暂停 syncEngine →
 * IPC storage.changePath（主进程迁移 keban.db）→ 恢复同步。IPC 取路径有
 * 5s 超时兜底。'ed-data-path' localStorage 键经 readWithLegacyMigration
 * 兼容旧 'keban-data-path'。
 */
import { useState, useEffect } from 'react';
import { readWithLegacyMigration } from '@/lib/utils/legacyLocalStorage';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { HardDrive, FolderOpen, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isElectron } from '@/lib/utils/platform';
import { getStorageInfo } from '@/lib/storage';
import type { StorageInfo } from '@/lib/storage';
import { syncEngine } from '@/lib/sync/SyncEngine';

export function StoragePathSection() {
  const { toast } = useToast();
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [currentPath, setCurrentPath] = useState<string>(
    isElectron() ? '正在获取…' : '浏览器存储（IndexedDB）'
  );
  const [defaultPath, setDefaultPath] = useState<string>('');
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    let mounted = true;

    getStorageInfo().then((info) => {
      if (mounted && info) setStorageInfo(info);
    });
    const savedPath = readWithLegacyMigration('ed-data-path', 'keban-data-path');
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
    <>
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
    </>
  );
}
