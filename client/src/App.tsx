/**
 * 应用根组件：全局 Provider 编排与路由挂载
 *
 * @ai-context: Provider 顺序即依赖顺序——Query/Toast 在外，Auth/Sync 依赖其后，
 * 路由最内层。此处仅做编排，不写业务逻辑。
 * @ai-context: 首屏用 useLayoutEffect 处理主题以避免闪白（在绘制前同步应用）。
 */
import { useState, useEffect, useLayoutEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/Toast';
import AchievementToast from '@/components/ui/AchievementToast';
import UpdateNotification from '@/components/ui/UpdateNotification';
import ConsentModal, { CURRENT_CONSENT_VERSION } from '@/components/ui/ConsentModal';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { SyncProvider } from '@/lib/sync/SyncContext';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { router } from '@/routes';
import { useTheme } from '@/hooks/useTheme';
import { db } from '@/lib/storage/database';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { getAIConfig } from '@/lib/ai/config';
import { OfflineAIQueueBootstrap } from '@/lib/ai/OfflineAIQueueBootstrap';
import '@/stores/useSettingsStore'; // 导入以触发音效设置初始化

// 启动时预加载所有音效（不阻塞渲染）
soundPlayer.preloadAll();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

function App() {
  // Initialize theme on app mount
  useTheme();

  // ── 启动缓冲带：接管 HTML 内联 splash，首次渲染完成后淡出 ──
  useLayoutEffect(() => {
    const splash = document.getElementById('app-splash');
    if (!splash) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      splash.remove();
      return;
    }

    // 触发淡出过渡（CSS transition: opacity 0.5s ease）
    requestAnimationFrame(() => {
      splash.style.pointerEvents = 'none';
      splash.style.opacity = '0';
      const onEnd = () => {
        splash.remove();
        splash.removeEventListener('transitionend', onEnd);
      };
      splash.addEventListener('transitionend', onEnd);
      // 安全兑底：transitionend 未触发时强制移除
      setTimeout(() => { if (splash.parentNode) splash.remove(); }, 800);
    });

    // 应用空闲时预检测 AI 网关健康状态（不阻塞首屏）
    const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
    idle(() => {
      // 同步网关地址到主进程（主进程无法访问 localStorage，需显式传递）
      const aiConfig = getAIConfig();
      if (aiConfig.gatewayUrl && window.electronAPI) {
        window.electronAPI.invoke('ai:set-gateway-url', aiConfig.gatewayUrl).catch(() => {});
      }
      import('./hooks/useAIGatewayHealth').then(({ precheckGatewayHealth }) => {
        precheckGatewayHealth();
      });
    });
  }, []);

  const [consentGiven, setConsentGiven] = useState<boolean | null>(null);

  useEffect(() => {
    // 检查是否已同意隐私政策
    db.consent
      .where('type')
      .equals('privacy')
      .first()
      .then((record) => {
        setConsentGiven(!!record);
      })
      .catch(() => {
        setConsentGiven(false);
      });
  }, []);

  const handleAcceptConsent = async () => {
    const now = new Date();
    await db.consent.bulkPut([
      { id: crypto.randomUUID(), type: 'privacy' as const, version: CURRENT_CONSENT_VERSION, acceptedAt: now },
      { id: crypto.randomUUID(), type: 'terms' as const, version: CURRENT_CONSENT_VERSION, acceptedAt: now },
    ]);
    setConsentGiven(true);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <SyncProvider>
            {consentGiven === false && (
              <ConsentModal onAccept={handleAcceptConsent} />
            )}
            <ErrorBoundary>
              <RouterProvider router={router} />
              <AchievementToast />
              <UpdateNotification />
              <OfflineAIQueueBootstrap />
            </ErrorBoundary>
          </SyncProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
