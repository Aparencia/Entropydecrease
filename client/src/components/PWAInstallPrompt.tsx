/**
 * @ai-context: 通用组件：PWAInstallPrompt。
 * 双分支安装引导（移动端"下载"体验的 PWA 形态）：
 * ① Android Chrome：beforeinstallprompt → 应用内「安装」按钮（点一下即安装，
 *    体验最接近下载 App）；
 * ② iOS Safari：无 beforeinstallprompt 事件，改显「添加到主屏幕」分步引导
 *    （分享 → 添加到主屏幕）。A 方案（PWA 安装引导增强）。
 */
import { useState, useEffect, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * 是否在 iOS Safari 且非 standalone 模式（iPhone/iPad/iPod；iPadOS 的 UA 为
 * MacIntel 需用 maxTouchPoints 区分）。standalone 下已是主屏幕图标，无需引导。
 */
function isIosSafariBrowser(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  return !window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * PWA 安装提示组件（Android 安装按钮 + iOS 主屏幕引导）
 */
export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  /** iOS：无 beforeinstallprompt，改用"添加到主屏幕"分步引导 */
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // 用户之前关闭过提示（任一分支）则不再显示
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

    // iOS：无 beforeinstallprompt 事件，延迟显示主屏幕引导
    let iosTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafariBrowser()) {
      iosTimer = setTimeout(() => setShowIosGuide(true), 3000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (iosTimer) clearTimeout(iosTimer);
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
    setShowIosGuide(false);
    setDismissed(true);
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  }, []);

  // iOS 引导：无 beforeinstallprompt，显示添加到主屏幕分步指引
  if (showIosGuide && !dismissed) {
    return (
      <div
        className={cn(
          'fixed bottom-20 left-4 right-4 z-50', // bottom-20 避开 BottomNav
          'md:bottom-4',
          'flex items-start justify-between gap-3',
          'rounded-kb-lg border border-white/10',
          'bg-bg-secondary/95 backdrop-blur-sm',
          'px-4 py-3 shadow-kb-lg',
          'animate-in slide-in-from-bottom duration-300',
          'sm:left-auto sm:right-4 sm:max-w-sm',
        )}
        role="alert"
        aria-label="添加到主屏幕指引"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex-shrink-0 w-10 h-10 rounded-kb-md bg-brand-600/20 flex items-center justify-center">
            <Download className="w-5 h-5 text-brand-400" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-b2 font-medium text-text-primary">添加到主屏幕，像 App 一样使用</p>
            <ol className="text-b3 text-text-secondary space-y-0.5 list-decimal list-inside">
              <li>点底部「分享」按钮（方框 + 箭头）</li>
              <li>选择「添加到主屏幕」</li>
              <li>从桌面图标启动，可离线使用</li>
            </ol>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary transition-colors flex-shrink-0"
          aria-label="关闭指引"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Android：beforeinstallprompt 安装提示
  if (!showPrompt || dismissed || !deferredPrompt) return null;

  return (
    <div
      className={cn(
        'fixed bottom-20 left-4 right-4 z-50', // bottom-20 避开 BottomNav
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
