/**
 * 路由守卫：未登录时重定向到登录页
 *
 * @ai-context: 本地优先原则下 Supabase 为可选依赖——占位配置（isPlaceholder）
 * 时直接放行，保证纯离线用户不被登录页拦住。仅在云端已配置且确无会话时才跳转，
 * 并携带 from 供登录后回跳。
 */
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isPlaceholder } from './supabaseClient';
import { useAuth } from './AuthContext';
import { modeManager } from '@/lib/mode/ModeManager';

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * 登录路由守卫（软模式）
 *
 * 默认 pass-through，仅在以下条件全部满足时才重定向到登录页：
 * 1. Supabase 凭证有效（非占位符）
 * 2. 用户选择了需要云同步的模式（hybrid / full）
 * 3. 用户尚未登录
 *
 * 离线或 Supabase 请求失败时降级为 pass-through
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 占位符凭证 → 完全跳过，不做任何拦截
    if (isPlaceholder) return;

    // 认证状态仍在加载中 → 等待
    if (loading) return;

    // 已登录 → 无需拦截
    if (isAuthenticated) return;

    // 用户选择了云同步模式（hybrid / full）才视为"主动选择登录"
    const currentMode = modeManager.getMode();
    const requiresAuth = currentMode === 'hybrid' || currentMode === 'full';

    if (!requiresAuth) return;

    // 已在登录/注册页 → 不要循环重定向
    if (location.pathname === '/login' || location.pathname === '/register') return;

    navigate('/login', { replace: true });
  }, [
	loading,
	isAuthenticated,
	location.pathname,
	navigate
]);

  return <>{children}</>;
}
