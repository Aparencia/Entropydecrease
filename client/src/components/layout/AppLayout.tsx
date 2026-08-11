/**
 * @ai-context: 布局组件：AppLayout。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, MotionConfig, AnimatePresence } from 'framer-motion';
import { Home } from 'lucide-react';
import { Tip } from '@/components/ui/Tip';
import CommandPalette from '../ui/CommandPalette';
import { CloseConfirmDialog } from '../ui/CloseConfirmDialog';
import { CustomTitlebar } from './CustomTitlebar';
import BottomNav from './BottomNav';
import { useSessionExpiry } from '@/hooks/useSessionExpiry';
import { useSync } from '@/lib/sync/SyncContext';
import { SceneProvider } from '@/lib/3d/core/SceneProvider';
import { SceneTransition } from '@/lib/3d/scenes/SceneTransition';
import { SpatialNav } from '@/lib/3d/navigation/SpatialNav';
import { MobileNavGrid } from '@/lib/3d/scenes/MobileNavGrid';
import { FunctionalOverlay } from '@/components/overlay/FunctionalOverlay';
import { useOrbitalStore, routeToModuleId } from '@/lib/3d/navigation/OrbitalStore';
import { OnboardingOverlay } from '@/components/onboarding/OnboardingOverlay';
import { ModuleTourToast } from '@/components/onboarding/ModuleTourToast';
import { HelpCenter } from '@/components/onboarding/HelpCenter';
import { useOnboardingStore } from '@/components/onboarding/useOnboardingStore';
import { useRuntimeEnv } from '@/lib/env/useRuntimeEnv';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { FirstDiveGate } from '@/features/onboarding/firstDive/FirstDiveGate';
import { usePerformanceModeStore } from '@/lib/performance/usePerformanceMode';
import { PERFORMANCE_MODE_CONFIG } from '@/lib/performance/performanceMode';
import { cn } from '@/lib/utils';

/**
 * 路由层级映射：子路由 -> 父路由
 * 在 ESC 处理器中用于"向上导航一级"而非直接退出模块
 */
function findParentRoute(pathname: string): string | null {
  const patterns: Array<{
    pattern: RegExp;
    parent: string | ((match: RegExpMatchArray) => string);
  }> = [
    // Pomodoro 子页面
    { pattern: /^\/pomodoro\/(stats|settings)$/, parent: '/pomodoro' },
    // Notes 子页面
    { pattern: /^\/notes\/graph$/, parent: '/notes' },
    { pattern: /^\/notes\/([^/]+)$/, parent: '/notes' },
    // Flashcards 子页面（二级子路由回到所属牌组详情）
    { pattern: /^\/flashcards\/([^/]+)\/(study|generative-review)$/, parent: (m) => `/flashcards/${m[1]}` },
    { pattern: /^\/flashcards\/([^/]+)$/, parent: '/flashcards' },
    // Feynman 子页面
    { pattern: /^\/feynman\/([^/]+)$/, parent: '/feynman' },
    { pattern: /^\/socratic$/, parent: '/feynman' },
    // SOP 子页面
    { pattern: /^\/sop\/editor/, parent: '/sop' },
    // 非模块页面（settings/analytics/settling/inbox/certificate -> 仪表盘）
    { pattern: /^\/(settings|analytics|settling|inbox|certificate)$/, parent: '/' },
  ];

  for (const { pattern, parent } of patterns) {
    const match = pathname.match(pattern);
    if (match) {
      return typeof parent === 'function' ? parent(match) : parent;
    }
  }
  return null;
}

export default function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // 跟踪当前路径（ref 避免 ESC 处理器闭包读到旧值，同时避免加入 effect 依赖）
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  // 细粒度 selector 订阅：整 store 订阅会被 hoveredModule 等高频字段变化
  // 连带重渲染整棵布局树（含 Outlet 页面），是流畅度关键瓶颈
  const isInModule = useOrbitalStore((s) => s.isInModule);
  const currentModule = useOrbitalStore((s) => s.currentModule);
  const overlayVisible = useOrbitalStore((s) => s.overlayVisible);
  const enterModule = useOrbitalStore((s) => s.enterModule);
  const exitModule = useOrbitalStore((s) => s.exitModule);
  const syncWithRoute = useOrbitalStore((s) => s.syncWithRoute);
  const openHelp = useOnboardingStore((s) => s.openHelp);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const { sync } = useSync();
  const { shouldDegrade3D } = useRuntimeEnv();
  // 性能模式：静谧(low)档全局减弱 Framer Motion 动画（transform/layout 动画直接到位）
  const perfMode = usePerformanceModeStore((s) => s.mode);
  const reduceMotion = PERFORMANCE_MODE_CONFIG[perfMode].reduceMotion;
  // 笔记编辑/图谱路由需要满高面板：面板默认高度由内容决定（auto），
  // 高度链 h-full → flex-1 会逐级失效，导致 React Flow 等依赖 100% 高度的
  // 画布类组件容器高度为 0（思维导图/自由画布/图谱不渲染）。
  // 给这些路由的面板补 !h-full 让高度链恢复（max-h 仍生效）。
  const isFullHeightRoute = /^\/notes\/[^/]+$/.test(pathname);

  // 监听 session 过期事件
  useSessionExpiry();

  // 路由 → 3D状态同步（刷新页面或直接URL访问时恢复状态）
  // useLayoutEffect：在绘制前完成相位迁移，避免新页面内容在旧覆盖层内闪现一帧
  useLayoutEffect(() => {
    syncWithRoute(pathname);
  }, [pathname, syncWithRoute]);

  // 监听 Electron 主进程发出的窗口关闭事件
  useEffect(() => {
    if (!window.electronAPI?.onWindowClosing) return;
    const cleanup = window.electronAPI.onWindowClosing(() => {
      setShowCloseDialog(true);
    });
    return cleanup;
  }, []);

  // 监听退出前同步事件：主进程通知渲染进程执行一次同步
  useEffect(() => {
    if (!window.electronAPI?.onSyncBeforeQuit) return;
    const cleanup = window.electronAPI.onSyncBeforeQuit(async () => {
      try {
        await sync();
      } catch (err) {
        console.error('[AppLayout] Sync before quit failed:', err);
      } finally {
        // 无论同步成功与否，都通知主进程可以继续退出
        window.electronAPI?.notifySyncComplete();
      }
    });
    return cleanup;
  }, [sync]);

  // 键盘快捷键：Esc退出模块，数字键导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入元素中，不拦截
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'Escape') {
        // 层级感知：子路由 -> 父路由，根路由 -> 退出模块
        const currentPath = pathnameRef.current;
        const parentRoute = findParentRoute(currentPath);

        if (parentRoute) {
          // 有父路由 -> 向上导航一级（不退出模块，保持模块 docked 态）
          e.preventDefault();
          navigate(parentRoute);
        } else if (isInModule) {
          // 已是模块根路由 -> 退出模块回到 3D 概览
          e.preventDefault();
          exitModule();
        } else if (currentPath !== '/') {
          // 3D 场景模式下按 Esc 返回仪表盘（仅非首页时）
          e.preventDefault();
          enterModule('dashboard');
          navigate('/');
        }
      }

      // 数字键 0-7 快捷导航（需无修饰键）
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const moduleKeys: Record<string, string> = {
          '1': '/', '2': '/pomodoro', '3': '/notes',
          '4': '/flashcards', '5': '/feynman', '6': '/inspiration',
          '7': '/classroom', '8': '/constellation', '0': '/settings',
        };
        if (moduleKeys[e.key]) {
          const route = moduleKeys[e.key];
          // 显式调用 enterModule：同路由 navigate 无效时仍能触发相位迁移（修复 Esc 后重复按键无响应）
          // 使用 routeToModuleId 统一映射：对非 MODULE_POSITIONS 成员（如 /settings）
          // 也能正确调用 enterModule，避免 navigate 同路由无变化时相位无法恢复
          const modId = routeToModuleId(route);
          if (modId) enterModule(modId);
          navigate(route);
        }
      }

      // Ctrl+/ 或 Cmd+/ 打开帮助中心
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        openHelp();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInModule, enterModule, exitModule, navigate, openHelp]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Layer 2: 始终最顶层 — Electron标题栏 */}
      <CustomTitlebar />

      {/* Layer 0: 3D场景全屏背景 / 移动端2D降级 */}
      {shouldDegrade3D ? (
        /* 移动端降级：显示 2D 模块导航网格代替 3D 场景 */
        !isInModule && <MobileNavGrid />
      ) : (
        <SceneProvider interactive={!overlayVisible}>
          <SceneTransition />
          <SpatialNav />
        </SceneProvider>
      )}

      {/* Layer 1: 功能覆盖层 — 常驻挂载（visible 控制显隐），同模块 Esc/重入不卸载页面，避免动画重播 */}
      {/* 修复：移除 key={currentModule}，防止模块切换时整棵组件树强制卸载/重挂载导致旧组件瞬间消失无退出动画 */}
      {currentModule && (
        <FunctionalOverlay
          visible={overlayVisible}
          /* 萤火海沟自带全屏暗物质场：透明面板让深海背景透出，遮罩用深海底色实现整屏无缝（其他模块保持毛玻璃） */
          panelClassName={currentModule === 'inspiration'
            ? '!bg-transparent !backdrop-blur-none !shadow-none !border-white/5'
            : currentModule === 'notes'
              ? isFullHeightRoute
                ? '!p-0 !h-full'
                : '!p-0'
              : isFullHeightRoute
                ? '!h-full'
                : undefined}
          maskClassName={currentModule === 'inspiration' ? '!bg-[var(--kb-bg-primary)] !backdrop-blur-none' : undefined}
        >
          {/* 路由级过渡：grid 叠放 + 同期交叉淡入淡出。
              历史方案 mode="wait" 要求旧页退出回调交接后才挂载新页；在
              reduced-motion / StrictMode(dev) / HMR 等条件下交接会偶发丢失，
              新页永不挂载——即内测反馈"回到主页时主页不显示"的根因。
              交叉淡入淡出下新页立即挂载、旧页淡出后卸载，退出即使延迟也不阻塞内容展示 */}
                    {/* grid 视口锚定：面板为 max-h + auto 容器，h-full 链会退化为内容自然高（页面随内容伸缩）；
              显式锚定后所有 h-full 子页面继承此高度，与 module-content 面板内容区精确一致（无空隙无滚动）。
              公式 = 面板实际高度 - padding 垂直 - border*2：
              普通路由面板 sm+ max-h=85vh、小屏 100vh-5rem，padding md p-8=4rem / sm p-5=2.5rem / 小屏 p-3=1.5rem；
              Notes 面板 !p-0（去内边距、内容贴边）：小屏 calc(100vh-5rem-2px)、sm+ calc(85vh-2px)；
              full-height 路由面板 !h-full（h-full 链有效）保持 h-full 不动 */}
          <div className={cn(
            'grid h-full',
            !isFullHeightRoute && (
              currentModule === 'notes'
                ? 'h-[calc(100vh-5rem-2px)] sm:h-[calc(85vh-2px)]'
                : 'h-[calc(100vh-6.5rem-2px)] sm:h-[calc(85vh-2.5rem-2px)] md:h-[calc(85vh-4rem-2px)]'
            ),
          )}>
            <AnimatePresence>
              <motion.div
                key={pathname}
                className="h-full"
                style={{ gridArea: '1 / 1' }}
                /* 简单的 opacity 淡入淡出，不影响 3D 场景的相机飞行和停靠时序 */
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </FunctionalOverlay>
      )}

      {/* 非模块内时显示简洁的状态提示 + 返回按钮（仅桌面端） */}
      {!isInModule && !shouldDegrade3D && (
        <>
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 hidden md:block">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-6 py-3 rounded-full bg-black/30 backdrop-blur-xl border border-white/10 text-white/70 text-sm"
            >
              点击3D物体进入模块 · 按 Esc 返回仪表盘 · 数字键 0-7 快捷跳转
            </motion.div>
          </div>
          {/* 浮动返回仪表盘按钮，带 tooltip（仅桌面端） */}
          <Tip text="返回仪表盘" side="left">
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => { enterModule('dashboard'); navigate('/'); }}
            className="fixed bottom-8 right-8 z-20 hidden md:flex w-12 h-12 rounded-full bg-black/30 backdrop-blur-xl border border-white/15 items-center justify-center text-white/70 hover:text-white hover:bg-black/50 transition-colors"
            aria-label="返回仪表盘"
          >
            <Home className="w-5 h-5" strokeWidth={1.5} />
          </motion.button>
          </Tip>
        </>
      )}

      {/* 移动端底部标签栏 — 置于功能覆盖层之上，避免被 3D 场景或模块遮罩覆盖 */}
      <BottomNav />

      {/* 全局组件 */}
      <FirstDiveGate />
      <OnboardingOverlay />
      <ModuleTourToast moduleId={currentModule} />
      <HelpCenter />
      <CommandPalette />
      <PWAInstallPrompt />
      <CloseConfirmDialog open={showCloseDialog} onClose={() => setShowCloseDialog(false)} />
    </div>
    </MotionConfig>
  );
}
