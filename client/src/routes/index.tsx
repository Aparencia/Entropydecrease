/**
 * @ai-context: 路由配置：index。
 */
// oxlint-disable react/only-export-components
// Why: 路由聚合文件——集中 lazy 定义全部页面组件并统一导出 router（非组件），
// Fast Refresh 不适用于路由表；组件与非组件导出混存是本文件的预期形态，
// 拆分页面到独立文件反而破坏「单文件聚合路由」的设计，故文件级豁免。
import { lazy, Suspense } from 'react';
import { createHashRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { AuthGuard } from '@/lib/auth/AuthGuard';
import { prefetchRoute } from '@/utils/scheduler';

// 在应用启动后空闲期预加载核心模块
// P1-6 prefetch 错峰：7 个高频页面 chunk 每 300ms 拉取一个（而非一次性突发），
// 避免启动 2s 后的网络/磁盘峰值影响首次交互帧
if (typeof window !== 'undefined') {
  const HIGH_FREQUENCY_PAGES = [
    () => import('@/features/dashboard/pages/DashboardPage'),
    () => import('@/features/notes/pages/NoteEditPage'),
    () => import('@/features/pomodoro/pages/PomodoroPage'),
    // 修复：增加高频页面预加载，减少模块切换时的加载等待与视觉跳变
    () => import('@/features/notes/pages/NotesPage'),
    () => import('@/features/flashcards/pages/FlashcardsPage'),
    () => import('@/features/feynman/pages/FeynmanPage'),
    () => import('@/pages/SettingsPage'),
  ];
  const PREFETCH_STAGGER_MS = 300;
  window.addEventListener('load', () => {
    setTimeout(() => {
      HIGH_FREQUENCY_PAGES.forEach((loader, i) => {
        setTimeout(() => prefetchRoute(loader), i * PREFETCH_STAGGER_MS);
      });
    }, 2000); // 启动2秒后开始预加载
  });
}

// Lazy-loaded pages
const Dashboard = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const PomodoroPage = lazy(() => import('@/features/pomodoro/pages/PomodoroPage'));
const PomodoroStatsPage = lazy(() => import('@/features/pomodoro/pages/PomodoroStatsPage'));
const PomodoroSettingsPage = lazy(() => import('@/features/pomodoro/pages/PomodoroSettingsPage'));
const NotesPage = lazy(() => import('@/features/notes/pages/NotesPage'));
const NotesGraphPage = lazy(() => import('@/features/notes/pages/NotesGraphPage'));
const NoteEditPage = lazy(() => import('@/features/notes/pages/NoteEditPage'));
const FlashcardsPage = lazy(() => import('@/features/flashcards/pages/FlashcardsPage'));
const DeckDetailPage = lazy(() => import('@/features/flashcards/pages/DeckDetailPage'));
const StudySessionPage = lazy(() => import('@/features/flashcards/pages/StudySessionPage'));
const GenerativeReviewPage = lazy(() => import('@/features/flashcards/pages/GenerativeReviewPage'));
const FeynmanPage = lazy(() => import('@/features/feynman/pages/FeynmanPage'));
const FeynmanSessionPage = lazy(() => import('@/features/feynman/pages/FeynmanSessionPage'));
const FeynmanGraphPage = lazy(() => import('@/features/feynman/pages/FeynmanGraphPage'));
const SocraticSessionPage = lazy(() => import('@/features/feynman/pages/SocraticSessionPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const UpgradePage = lazy(() => import('@/pages/UpgradePage'));
const AnalyticsPage = lazy(() => import('@/features/dashboard/pages/AnalyticsPage'));
const InspirationPage = lazy(() => import('@/features/inspiration/pages/InspirationPage'));
const ClassroomPage = lazy(() => import('@/features/classroom/pages/ClassroomPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const SettlingPage = lazy(() => import('@/features/settling/pages/SettlingPage'));
const SopListPage = lazy(() => import('@/features/sop/pages/SopListPage'));
const SopEditorPage = lazy(() => import('@/features/sop/pages/SopEditorPage'));
const SopRunPage = lazy(() => import('@/features/sop/pages/SopRunPage'));
const InboxPage = lazy(() => import('@/features/inbox/pages/InboxPage'));
const CertificatePage = lazy(() => import('@/features/dashboard/pages/CertificatePage'));
const GardenPage = lazy(() => import('@/features/garden/components/GardenPage'));
const RecipesPage = lazy(() => import('@/features/recipes/pages/RecipesPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPassword'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmail'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));
const SoundAnchorPage = lazy(() => import('@/features/soundanchor/pages/SoundAnchorPage'));
const TimeCapsulePage = lazy(() => import('@/features/timecapsule/pages/TimeCapsulePage'));
const ConstellationPage = lazy(() => import('@/features/constellation/pages/ConstellationPage'));
const EinkPage = lazy(() => import('@/features/eink/pages/EinkPage'));
const SocialDivePage = lazy(() => import('@/features/social/pages/DeepDivePage'));
const SocialRelayPage = lazy(() => import('@/features/social/pages/RelayPage'));
const SocialMirrorPage = lazy(() => import('@/features/social/pages/SocialMirrorPage'));
const StudyRoomPage = lazy(() => import('@/features/social/pages/StudyRoomPage'));
const WikiPage = lazy(() => import('@/features/wiki/pages/WikiPage'));
const MicroCardsPage = lazy(() => import('@/features/microcards/pages/MicroCardsPage'));

// 骨架屏加载占位：用 animate-pulse 灰色块替代旋转 spinner，减少模块切换时的视觉跳变
function PageLoader() {
  return (
    <div className="flex flex-col gap-4 p-6 min-h-[60vh] animate-pulse">
      {/* 模拟标题行 */}
      <div className="h-6 w-1/3 rounded bg-gray-200/30 dark:bg-white/10" />
      {/* 模拟内容块 */}
      <div className="h-4 w-2/3 rounded bg-gray-200/20 dark:bg-white/5" />
      <div className="h-4 w-1/2 rounded bg-gray-200/20 dark:bg-white/5" />
      {/* 模拟卡片区域 */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="h-24 rounded-lg bg-gray-200/20 dark:bg-white/5" />
        <div className="h-24 rounded-lg bg-gray-200/20 dark:bg-white/5" />
      </div>
    </div>
  );
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const routes: RouteObject[] = [
  {
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { path: '/', element: <SuspenseWrapper><Dashboard /></SuspenseWrapper> },
      { path: '/pomodoro', element: <SuspenseWrapper><PomodoroPage /></SuspenseWrapper> },
      { path: '/pomodoro/stats', element: <SuspenseWrapper><PomodoroStatsPage /></SuspenseWrapper> },
      { path: '/pomodoro/settings', element: <SuspenseWrapper><PomodoroSettingsPage /></SuspenseWrapper> },
      { path: '/notes', element: <SuspenseWrapper><NotesPage /></SuspenseWrapper> },
      { path: '/notes/graph', element: <SuspenseWrapper><NotesGraphPage /></SuspenseWrapper> },
      { path: '/notes/:id', element: <SuspenseWrapper><NoteEditPage /></SuspenseWrapper> },
      { path: '/flashcards', element: <SuspenseWrapper><FlashcardsPage /></SuspenseWrapper> },
      { path: '/flashcards/:deckId', element: <SuspenseWrapper><DeckDetailPage /></SuspenseWrapper> },
      { path: '/flashcards/:deckId/study', element: <SuspenseWrapper><StudySessionPage /></SuspenseWrapper> },
      { path: '/flashcards/:deckId/generative-review', element: <SuspenseWrapper><GenerativeReviewPage /></SuspenseWrapper> },
      { path: '/feynman', element: <SuspenseWrapper><FeynmanPage /></SuspenseWrapper> },
      { path: '/feynman/graph', element: <SuspenseWrapper><FeynmanGraphPage /></SuspenseWrapper> },
      { path: '/feynman/:sessionId', element: <SuspenseWrapper><FeynmanSessionPage /></SuspenseWrapper> },
      { path: '/socratic', element: <SuspenseWrapper><SocraticSessionPage /></SuspenseWrapper> },
      { path: '/settings', element: <SuspenseWrapper><SettingsPage /></SuspenseWrapper> },
      { path: '/upgrade', element: <SuspenseWrapper><UpgradePage /></SuspenseWrapper> },
      { path: '/analytics', element: <SuspenseWrapper><AnalyticsPage /></SuspenseWrapper> },
      { path: '/inspiration', element: <SuspenseWrapper><InspirationPage /></SuspenseWrapper> },
      { path: '/classroom', element: <SuspenseWrapper><ClassroomPage /></SuspenseWrapper> },
      { path: '/settling', element: <SuspenseWrapper><SettlingPage /></SuspenseWrapper> },
      { path: '/sop', element: <SuspenseWrapper><SopListPage /></SuspenseWrapper> },
      { path: '/sop/editor/:id?', element: <SuspenseWrapper><SopEditorPage /></SuspenseWrapper> },
      { path: '/inbox', element: <SuspenseWrapper><InboxPage /></SuspenseWrapper> },
      { path: '/certificate', element: <SuspenseWrapper><CertificatePage /></SuspenseWrapper> },
      { path: '/garden', element: <SuspenseWrapper><GardenPage /></SuspenseWrapper> },
      { path: '/recipes', element: <SuspenseWrapper><RecipesPage /></SuspenseWrapper> },
      { path: '/soundanchor', element: <SuspenseWrapper><SoundAnchorPage /></SuspenseWrapper> },
      { path: '/timecapsule', element: <SuspenseWrapper><TimeCapsulePage /></SuspenseWrapper> },
      { path: '/constellation', element: <SuspenseWrapper><ConstellationPage /></SuspenseWrapper> },
      { path: '/social/dive', element: <SuspenseWrapper><SocialDivePage /></SuspenseWrapper> },
      { path: '/social/relay', element: <SuspenseWrapper><SocialRelayPage /></SuspenseWrapper> },
      { path: '/social/mirror', element: <SuspenseWrapper><SocialMirrorPage /></SuspenseWrapper> },
      { path: '/social/studyroom', element: <SuspenseWrapper><StudyRoomPage /></SuspenseWrapper> },
      { path: '/wiki', element: <SuspenseWrapper><WikiPage /></SuspenseWrapper> },
      { path: '/microcards', element: <SuspenseWrapper><MicroCardsPage /></SuspenseWrapper> },
    ],
  },
  {
    // 电子墨水学习板次窗口：仿 /onboarding 先例挂在 AuthGuard/AppLayout 之外，避免重定向循环
    path: '/eink',
    element: <SuspenseWrapper><EinkPage /></SuspenseWrapper>,
  },
  {
    // SOP 全屏沉浸执行器：仿 /onboarding 先例挂在 AuthGuard/AppLayout 之外，绕开 3D canvas
    path: '/sop/run/:runId',
    element: <SuspenseWrapper><SopRunPage /></SuspenseWrapper>,
  },
  {
    path: '/onboarding',
    element: <SuspenseWrapper><OnboardingPage /></SuspenseWrapper>,
  },
  {
    path: '/login',
    element: <SuspenseWrapper><LoginPage /></SuspenseWrapper>,
  },
  {
    path: '/register',
    element: <SuspenseWrapper><RegisterPage /></SuspenseWrapper>,
  },
  {
    path: '/privacy',
    element: <SuspenseWrapper><PrivacyPolicy /></SuspenseWrapper>,
  },
  {
    path: '/terms',
    element: <SuspenseWrapper><TermsOfService /></SuspenseWrapper>,
  },
  {
    path: '/reset-password',
    element: <SuspenseWrapper><ResetPasswordPage /></SuspenseWrapper>,
  },
  {
    path: '/verify-email',
    element: <SuspenseWrapper><VerifyEmailPage /></SuspenseWrapper>,
  },
];

export const router = createHashRouter(routes);
