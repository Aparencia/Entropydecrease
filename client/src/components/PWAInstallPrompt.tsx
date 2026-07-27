import { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA 安装提示组件
 *
 * 监听浏览器 beforeinstallprompt 事件，在合适时机显示安装提示。
 * 用户可以选择安装或关闭提示。
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 如果用户之前关闭过提示，不再显示
    const wasDismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // 延迟显示，避免打断用户操作
      setTimeout(() => setShowPrompt(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setShowPrompt(false);
    }

    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowPrompt(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  }, []);

  if (!showPrompt || dismissed || !deferredPrompt) return null;

  return (
    <div
      className={cn(
        'fixed bottom-20 left-4 right-4 z-50',  // bottom-20 避开 BottomNav
        'md:bottom-4', // 桌面端不受 BottomNav 影响
        'flex items-center justify-between gap-3',
        'rounded-kb-lg border border-white/10',
        'bg-bg-secondary/95 backdrop-blur-sm',
        'px-4 py-3 shadow-kb-lg',
        'animate-in slide-in-from-bottom duration-300',
        'sm:left-auto sm:right-4 sm:max-w-sm',
      )}
      role="alert"
      aria-label="安装熵减应用"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-10 h-10 rounded-kb-md bg-brand-600/20 flex items-center justify-center">
          <Download className="w-5 h-5 text-brand-400" />
        </div>
        <div className="min-w-0">
          <p className="text-b2 font-medium text-text-primary truncate">
            安装熵减
          </p>
          <p className="text-b3 text-text-secondary truncate">
            添加到桌面，随时离线使用
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button size="sm" variant="primary" onClick={handleInstall}>
          安装
        </Button>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors"
          aria-label="关闭安装提示"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
