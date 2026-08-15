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
import { AssistantRoot } from '@/features/assistant/AssistantRoot';
import { ShortcutRoot } from '@/features/shortcut/ShortcutRoot';
import { assistantEventBus } from '@/features/assistant/lib/eventBus';
import { RETURN_THRESHOLD_MS } from '@/features/assistant/constants';
// 留存机制：初始化 hook（store 加载）+ 深海发现弹窗（全局 portal）
import { useRetentionInit } from '@/features/retention/hooks/useRetentionInit';
import { useWorldSnapshotSync } from '@/features/retention/hooks/useWorldSnapshotSync';
import { DiscoveryReveal } from '@/features/retention/components/DiscoveryReveal';
import { SignatureMoment } from '@/features/retention/components/SignatureMoment';
import { FatigueEmpathy } from '@/features/retention/components/FatigueEmpathy';
import { WorldRecap } from '@/features/retention/components/WorldRecap';
import { WorldSoundscape } from '@/lib/audio/WorldSoundscape';
import { useFocusGuardian } from '@/hooks/useFocusGuardian';
import { FocusGuardianOverlay } from '@/components/FocusGuardianOverlay';
import { useDigitalWellbeing } from '@/hooks/useDigitalWellbeing';
import { DigitalWellbeingOverlay } from '@/components/DigitalWellbeingOverlay';
import { useLocalStorageFlag } from '@/hooks/useLocalStorageFlag';
import { EyeCareModeStyle, useEyeCareMode } from '@/components/EyeCareMode';
import { applyDailyHueShift } from '@/features/retention/lib/dailyVariation';
import '@/stores/useSettingsStore'; // 导入以触发音效设置初始化
import { startPomodoroScheduler } from '@/features/pomodoro/lib/pomodoroScheduler';
import { usePomodoroStore } from '@/features/pomodoro/store/usePomodoroStore';
import { PomodoroAudioLayer } from '@/features/pomodoro/components/PomodoroAudioLayer';

// 启动时预加载所有音效（不阻塞渲染）
soundPlayer.preloadAll();

// 番茄钟全局计时调度器：tick 驱动与页面生命周期解耦（切页后计时不停摆）
startPomodoroScheduler();

// 番茄钟持久化初始化：此前 initialize 仅在设置页挂载时触发（PomodoroSettingsPage），
// 深潜主页启动不加载——用户设置的时长/预设刷新后回退默认值（25 分钟），
// 且完成的番茄按默认时长落库（学习脉搏数据失真）。App 启动即初始化，幂等安全。
usePomodoroStore.getState().initialize().catch((err) => {
  console.debug('[App] pomodoro store initialize failed', err);
});

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
  // 每日确定性色相微调（对抗感觉适应：每天微妙的新鲜感，纯本地无网络）
  applyDailyHueShift();

  // 留存机制：在 Provider 内、路由外初始化所有留存 store
  // 放在此处确保无论用户从哪个路由进入，数据均已就绪
  useRetentionInit();
  // 世界状态快照同步：retention 数据→sqlite→MCP 记忆服务器（单向桥，失败静默）
  useWorldSnapshotSync();

  // 3.9 专注守护灵（M18: 开关响应 storage 事件，设置页变更即时生效）
  const guardian = useFocusGuardian();
  const focusGuardianEnabled = useLocalStorageFlag('ed-focus-guardian');
  const [dismissedOverlay, setDismissedOverlay] = useState(false);

  // 3.10 数字养生守门人
  const wellbeing = useDigitalWellbeing();
  const digitalWellbeingEnabled = useLocalStorageFlag('ed-digital-wellbeing');
  const eyeCareEnabled = useLocalStorageFlag('ed-eye-care');

  // 3.10 护眼模式
  useEyeCareMode(eyeCareEnabled || wellbeing.eyeCareMode);

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
        window.electronAPI.invoke('ai:set-gateway-url', aiConfig.gatewayUrl).catch((err) => {
          console.debug('[App] set gateway url failed', err);
        });
      }
      import('./hooks/useAIGatewayHealth').then(({ precheckGatewayHealth }) => {
        precheckGatewayHealth();
      });
    });
  }, []);

  // @ai-context: 应用生命周期事件——启动 & 久别回归，驱动 AI 学伴主动触发引擎
  useEffect(() => {
    try {
      const lastVisit = localStorage.getItem('kb-last-visit');
      const now = Date.now();
      const currentHour = new Date().getHours();

      assistantEventBus.emit('app:startup', { currentHour });

      if (lastVisit && now - Number(lastVisit) > RETURN_THRESHOLD_MS) {
        const days = Math.floor((now - Number(lastVisit)) / (24 * 60 * 60 * 1000));
        assistantEventBus.emit('user:return', { currentHour, daysSinceLastVisit: days });
      }

      localStorage.setItem('kb-last-visit', String(now));
    } catch { /* localStorage 不可用时静默降级 */ }
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
              {/* AI 学伴：全局浮层，路由之外、Provider 之内，偏好关闭时零开销 */}
              <AssistantRoot />
              {/* 全局快捷键：订阅主进程 shortcut:triggered 并按 id 分发
                  （capture-clipboard 收藏剪贴板到收件箱） */}
              <ShortcutRoot />
              {/* 留存机制：深海发现揭示弹窗（createPortal 到 body，与 AchievementToast 同级）
                  仅当 discoveryStore 有待展示发现时才渲染实际 DOM */}
              <DiscoveryReveal />
              {/* 签名时刻（宪法第三条）：掌握一个概念时的三幕演出，
                  由世界事件总线驱动，仅事件发生时渲染 DOM */}
              <SignatureMoment />
              {/* 宪法 P2：疲劳共情（觉察式建议）+ 延时摄影开场（每日生长摘要）
                  + 世界声景（双世界环境底噪，默认关闭可开启） */}
              <FatigueEmpathy />
              <WorldRecap />
              <WorldSoundscape />

              {/* 番茄钟全局音频层：白噪音/BGM 播放器与页面生命周期解耦，
                  切到其他模块时计时与背景音继续（仅渲染 null） */}
              <PomodoroAudioLayer />

              {/* 3.9 专注守护灵 — 全屏覆盖层（L3+） */}
              {focusGuardianEnabled && (
                <FocusGuardianOverlay
                  level={guardian.level}
                  show={guardian.level >= 3 && !dismissedOverlay}
                  onDismiss={() => setDismissedOverlay(true)}
                  onSuggestBreak={() => {
                    setDismissedOverlay(true);
                    guardian.resetScore();
                    // 重置覆盖状态以便下次可重新显示
                    setTimeout(() => setDismissedOverlay(false), 60_000);
                  }}
                />
              )}

              {/* 3.10 数字养生守门人 — 休息活动浮层 */}
              {digitalWellbeingEnabled && (
                <DigitalWellbeingOverlay
                  show={wellbeing.showRestActivity}
                  restActivities={wellbeing.restActivities}
                  isLocked={wellbeing.isLocked}
                  onDismiss={wellbeing.dismissRestActivity}
                />
              )}

              {/* 3.10 护眼模式样式注入（全局挂载一次） */}
              <EyeCareModeStyle />
            </ErrorBoundary>
          </SyncProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
