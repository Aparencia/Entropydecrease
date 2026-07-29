/**
 * @ai-context: 路由配置：index。
 */
import { lazy, Suspense } from 'react';
import { createHashRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { AuthGuard } from '@/lib/auth/AuthGuard';
import { prefetchRoute } from '@/utils/scheduler';

// 在应用启动后空闲期预加载核心模块
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => {
      prefetchRoute(() => import('@/features/dashboard/pages/DashboardPage'));
      prefetchRoute(() => import('@/features/notes/pages/NoteEditPage'));
      prefetchRoute(() => import('@/features/pomodoro/pages/PomodoroPage'));
    }, 2000); // 启动2秒后开始预加载
  });
}

// Lazy-loaded pages
const Dashboard = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const PomodoroPage = lazy(() => import('@/features/pomodoro/pages/PomodoroPage'));
const PomodoroStatsPage = lazy(() => import('@/features/pomodoro/pages/PomodoroStatsPage'));
const PomodoroSettingsPage = lazy(() => import('@/features/pomodoro/pages/PomodoroSettingsPage'));
const NotesPage = lazy(() => import('@/features/notes/pages/NotesPage'));
const NoteEditPage = lazy(() => import('@/features/notes/pages/NoteEditPage'));
const FlashcardsPage = lazy(() => import('@/features/flashcards/pages/FlashcardsPage'));
const DeckDetailPage = lazy(() => import('@/features/flashcards/pages/DeckDetailPage'));
const StudySessionPage = lazy(() => import('@/features/flashcards/pages/StudySessionPage'));
const GenerativeReviewPage = lazy(() => import('@/features/flashcards/pages/GenerativeReviewPage'));
const FeynmanPage = lazy(() => import('@/features/feynman/pages/FeynmanPage'));
const FeynmanSessionPage = lazy(() => import('@/features/feynman/pages/FeynmanSessionPage'));
const SocraticSessionPage = lazy(() => import('@/features/feynman/pages/SocraticSessionPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const AnalyticsPage = lazy(() => import('@/features/dashboard/pages/AnalyticsPage'));
const InspirationPage = lazy(() => import('@/features/inspiration/pages/InspirationPage'));
const ClassroomPage = lazy(() => import('@/features/classroom/pages/ClassroomPage'));
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/RegisterPage'));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPassword'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmail'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));

// Loading fallback
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-kb-md">
        <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-kb-full animate-spin" />
        <span className="text-b2 text-text-tertiary">加载中...</span>
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
      { path: '/notes/:id', element: <SuspenseWrapper><NoteEditPage /></SuspenseWrapper> },
      { path: '/flashcards', element: <SuspenseWrapper><FlashcardsPage /></SuspenseWrapper> },
      { path: '/flashcards/:deckId', element: <SuspenseWrapper><DeckDetailPage /></SuspenseWrapper> },
      { path: '/flashcards/:deckId/study', element: <SuspenseWrapper><StudySessionPage /></SuspenseWrapper> },
      { path: '/flashcards/:deckId/generative-review', element: <SuspenseWrapper><GenerativeReviewPage /></SuspenseWrapper> },
      { path: '/feynman', element: <SuspenseWrapper><FeynmanPage /></SuspenseWrapper> },
      { path: '/feynman/:sessionId', element: <SuspenseWrapper><FeynmanSessionPage /></SuspenseWrapper> },
      { path: '/socratic', element: <SuspenseWrapper><SocraticSessionPage /></SuspenseWrapper> },
      { path: '/settings', element: <SuspenseWrapper><SettingsPage /></SuspenseWrapper> },
      { path: '/analytics', element: <SuspenseWrapper><AnalyticsPage /></SuspenseWrapper> },
      { path: '/inspiration', element: <SuspenseWrapper><InspirationPage /></SuspenseWrapper> },
      { path: '/classroom', element: <SuspenseWrapper><ClassroomPage /></SuspenseWrapper> },
    ],
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
