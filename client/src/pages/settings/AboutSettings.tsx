/**
 * @ai-context: 设置页组件：AboutSettings。
 */
import { useState, useEffect, useCallback } from 'react';
import { readWithLegacyMigration } from '@/lib/utils/legacyLocalStorage';
import { Card, Button, Modal } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Shield, Info, RefreshCw, Download, CheckCircle, Loader2, AlertCircle, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
  releaseNotes?: string | null;
  retryCount?: number;
  maxRetries?: number;
}

/** localStorage key */
const AUTO_UPDATE_KEY = 'ed-auto-update';
const LEGACY_AUTO_UPDATE_KEY = 'keban-auto-update'; // 旧键，2027-01 前兼容

export default function AboutSettings() {
  const { toast } = useToast();
  const [appVersion, setAppVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState<boolean>(
    () => readWithLegacyMigration(AUTO_UPDATE_KEY, LEGACY_AUTO_UPDATE_KEY) !== 'false',
  );
  const [sponsorOpen, setSponsorOpen] = useState(false);

  const isElectron = !!window.electronAPI;

  // 启动时通知主进程当前的自动更新设置
  useEffect(() => {
    const enabled = readWithLegacyMigration(AUTO_UPDATE_KEY, LEGACY_AUTO_UPDATE_KEY) !== 'false';
    window.electronAPI?.setAutoUpdate?.(enabled);
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.invoke('get-app-version').then((version) => {
        setAppVersion(version as string);
      });
    }
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.on) return;

    const cleanup = window.electronAPI.on('update-status', (data: unknown) => {
      const status = data as UpdateStatus;
      setUpdateStatus(status);

      if (status.status === 'not-available') {
        setIsChecking(false);
        toast({ type: 'success', message: '当前已是最新版本' });
      } else if (status.status === 'available') {
        setIsChecking(false);
      } else if (status.status === 'error') {
        setIsChecking(false);
        toast({ type: 'error', message: `检查更新失败：${status.message || '未知错误'}` });
      }
    });

    return cleanup;
  }, [toast]);

  const handleCheckUpdate = async () => {
    if (!window.electronAPI) return;
    setIsChecking(true);
    setUpdateStatus(null);
    try {
      await window.electronAPI.invoke('update:check');
    } catch {
      setIsChecking(false);
      toast({ type: 'error', message: '检查更新失败，请稍后重试' });
    }
  };

  const handleDownload = () => {
    window.electronAPI?.invoke('update:download');
  };

  const handleInstall = () => {
    window.electronAPI?.invoke('update:install');
  };

  const handleAutoUpdateToggle = useCallback((enabled: boolean) => {
    setAutoUpdate(enabled);
    localStorage.setItem(AUTO_UPDATE_KEY, String(enabled));
    window.electronAPI?.setAutoUpdate?.(enabled);
  }, []);

  const displayVersion = appVersion || 'v0.8.0';

  /** 渲染更新状态区域 */
  const renderUpdateSection = () => {
    if (!isElectron) return null;

    // 下载中：进度条
    if (updateStatus?.status === 'downloading') {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Loader2 className="w-icon-sm h-icon-sm text-brand-500 animate-spin flex-shrink-0" strokeWidth={1.5} />
            <span className="text-b2 text-text-secondary">
              {updateStatus.retryCount
                ? `下载失败，正在重试 (${updateStatus.retryCount}/${updateStatus.maxRetries})...`
                : '正在下载更新...'}
            </span>
          </div>
          <div className="w-full bg-bg-tertiary rounded-kb-full h-2">
            <div
              className="h-full bg-brand-500 rounded-kb-full transition-all duration-300"
              style={{ width: `${updateStatus.percent || 0}%` }}
            />
          </div>
          <span className="text-c1 text-text-tertiary">{updateStatus.percent || 0}%</span>
        </div>
      );
    }

    // 下载完成：重启安装按钮
    if (updateStatus?.status === 'downloaded') {
      return (
        <div className="flex items-center gap-3">
          <CheckCircle className="w-icon-sm h-icon-sm text-semantic-success flex-shrink-0" strokeWidth={1.5} />
          <span className="text-b2 text-text-secondary flex-1">
            v{updateStatus.version} 已下载完成
          </span>
          <Button
            variant="primary"
            size="sm"
            icon={<RefreshCw className="w-icon-xs h-icon-xs" />}
            onClick={handleInstall}
          >
            重启安装
          </Button>
        </div>
      );
    }

    // 有新版本：显示版本号 + 下载按钮
    if (updateStatus?.status === 'available') {
      return (
        <div className="flex items-center gap-3">
          <AlertCircle className="w-icon-sm h-icon-sm text-brand-500 flex-shrink-0" strokeWidth={1.5} />
          <span className="text-b2 text-text-secondary flex-1">
            发现新版本 <span className="font-medium text-brand-600">v{updateStatus.version}</span>
          </span>
          <Button
            variant="primary"
            size="sm"
            icon={<Download className="w-icon-xs h-icon-xs" />}
            onClick={handleDownload}
          >
            立即下载
          </Button>
        </div>
      );
    }

    // 默认 / 检查中
    return (
      <div className="flex items-center gap-3">
        {isChecking ? (
          <>
            <Loader2 className="w-icon-sm h-icon-sm text-text-tertiary animate-spin flex-shrink-0" strokeWidth={1.5} />
            <span className="text-b2 text-text-tertiary flex-1">正在检查...</span>
          </>
        ) : (
          <span className="text-b2 text-text-tertiary flex-1">点击检查是否有新版本</span>
        )}
        <Button
          variant="secondary"
          size="sm"
          loading={isChecking}
          onClick={handleCheckUpdate}
        >
          检查更新
        </Button>
      </div>
    );
  };

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <h2 className="text-b1 font-semibold text-text-primary">关于</h2>

      <div className="flex items-center gap-3">
        <img
          src="/app-icon.png"
          alt="熵减"
          className={cn(
            'w-11 h-11 rounded-kb-lg flex-shrink-0 object-cover',
            'shadow-kb-sm',
          )}
        />
        <div>
          <p className="text-b1 font-semibold text-text-primary">熵减</p>
          <p className="text-c1 text-text-tertiary">{displayVersion}</p>
        </div>
      </div>

      {/* 检查更新区域（仅 Electron 环境显示） */}
      {isElectron && (
        <div className={cn(
          'p-3 rounded-kb-md',
          'bg-bg-secondary border border-border/40',
        )}>
          {renderUpdateSection()}
        </div>
      )}

      {/* 自动更新开关（仅 Electron 环境显示） */}
      {isElectron && (
        <div className={cn(
          'flex items-center justify-between gap-3 p-3 rounded-kb-md',
          'bg-bg-secondary border border-border/40',
        )}>
          <div className="flex-1">
            <p className="text-b2 text-text-primary">自动检查更新</p>
            {!autoUpdate && (
              <p className="text-c1 text-text-tertiary mt-0.5">
                关闭后将不再自动检测新版本，您仍可手动点击检查更新
              </p>
            )}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoUpdate}
            onClick={() => handleAutoUpdateToggle(!autoUpdate)}
            className={cn(
              'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-kb-full transition-colors duration-200 ease-in-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
              autoUpdate ? 'bg-brand-500' : 'bg-bg-tertiary',
            )}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                'mt-0.5',
                autoUpdate ? 'translate-x-5 ml-0.5' : 'translate-x-0.5',
              )}
            />
          </button>
        </div>
      )}

      <div className={cn(
        'p-3 rounded-kb-md',
        'bg-bg-secondary border border-border/40',
      )}>
        <p className="text-b3 text-text-secondary leading-relaxed">
          <span className="font-medium text-brand-600">技术栈：</span>
          React 18 + TypeScript + Vite + TailwindCSS + IndexedDB
        </p>
      </div>

      <div className={cn(
        'flex items-start gap-2.5 p-3 rounded-kb-md',
        'bg-semantic-success/5 border border-semantic-success/20',
      )}>
        <Shield className="w-icon-sm h-icon-sm text-semantic-success flex-shrink-0 mt-0.5" strokeWidth={1.5} />
        <p className="text-b3 text-text-secondary leading-relaxed">
          <span className="font-medium text-semantic-success">隐私优先：</span>
          本地优先架构，数据完全保存在您的设备上，不会上传至任何服务器。
        </p>
      </div>

      <div className={cn(
        'flex items-start gap-2.5 p-3 rounded-kb-md',
        'bg-bg-secondary border border-border/40',
      )}>
        <Info className="w-icon-sm h-icon-sm text-text-tertiary flex-shrink-0 mt-0.5" strokeWidth={1.5} />
        <p className="text-c1 text-text-tertiary leading-relaxed">
          熵减是一款面向学生的本地优先学习工具，集成深潜、结礁、反衰减呼吸和浮出水面四大核心模块，
          帮助你建立科学高效的学习习惯。
        </p>
      </div>

      {/* 支持开发者 */}
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-kb-md',
        'bg-brand-500/5 border border-brand-500/20',
      )}>
        <Heart className="w-icon-sm h-icon-sm text-brand-500 flex-shrink-0" strokeWidth={1.5} />
        <p className="text-b3 text-text-secondary leading-relaxed flex-1">
          <span className="font-medium text-brand-600">喜欢熵减？</span>
          你的赞赏会变成服务器电费，支撑它继续对抗宇宙的无序。
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSponsorOpen(true)}
        >
          请作者喝杯蜜雪
        </Button>
      </div>

      {/* 赞赏码弹窗 */}
      <Modal
        open={sponsorOpen}
        onClose={() => setSponsorOpen(false)}
        title="支持开发者"
        description="微信扫一扫，请作者喝杯蜜雪 ☕"
        size="sm"
      >
        <div className="flex flex-col items-center gap-kb-sm">
          <img
            src="/sponsor-qr.png"
            alt="微信赞赏码"
            className="w-full max-w-[260px] rounded-kb-lg bg-white p-2"
          />
          <p className="text-c1 text-text-tertiary text-center leading-relaxed">
            赞赏是纯粹的心意支持，不与任何功能挂钩。
            <br />
            无论是否赞赏，熵减的本地功能永远免费。
          </p>
        </div>
      </Modal>
    </Card>
  );
}
