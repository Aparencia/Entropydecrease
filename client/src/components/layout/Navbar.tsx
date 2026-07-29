/**
 * @ai-context: 布局组件：Navbar。
 */
import { ArrowLeft, Sun, Moon, Wifi, WifiOff, Signal, RefreshCw, CheckCircle2, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useBreadcrumb } from '@/hooks/usePageTitle';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useSync } from '@/lib/sync/SyncContext';
import { useAuth } from '@/lib/auth/AuthContext';
import ModeIndicator from '@/components/ui/ModeIndicator';
import { cn } from '@/lib/utils';

function formatLastSync(date: Date | null): string {
  if (!date) return '从未同步';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return '刚刚同步';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return date.toLocaleDateString();
}

const networkStatusConfig = {
  online: { color: 'bg-semantic-success', label: '在线', icon: Wifi, iconColor: 'text-text-secondary' },
  weak: { color: 'bg-semantic-warning', label: '弱网', icon: Signal, iconColor: 'text-semantic-warning' },
  offline: { color: 'bg-semantic-danger', label: '离线', icon: WifiOff, iconColor: 'text-text-tertiary' },
} as const;

/** 根路由（无返回按钮） */
const ROOT_PATHS = new Set(['/', '/pomodoro', '/notes', '/flashcards', '/feynman', '/settings', '/analytics', '/inspiration']);

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { crumbs } = useBreadcrumb();
  const { status: netStatus } = useNetworkStatus();
  const { isSyncing, lastSyncAt, pendingCount } = useSync();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const netConfig = networkStatusConfig[netStatus];
  const NetIcon = netConfig.icon;

  // 仅在子页面显示返回按钮（不在根路由上）
  const showBack = !ROOT_PATHS.has(pathname) && pathname !== '/';

  return (
    <header
      className={cn(
        'sticky top-0 z-20',
        'bg-bg-primary/80 backdrop-blur-md',
        'border-b border-border/30',
        'h-14 flex items-center justify-between px-kb-lg',
      )}
    >
      {/* Left: Back button + Breadcrumb */}
      <div className="flex items-center gap-kb-sm min-w-0">
        {/* Back button — only shown on sub-pages */}
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className={cn(
              'flex items-center justify-center',
              'w-8 h-8 rounded-kb-md flex-shrink-0',
              'text-text-secondary hover:text-text-primary',
              'hover:bg-bg-secondary',
              'transition-all duration-kb-normal ease-kb-default',
              'active:scale-95',
            )}
            aria-label="返回上一页"
            title="返回上一页"
          >
            <ArrowLeft className="w-icon-md h-icon-md" />
          </button>
        )}

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 min-w-0" aria-label="面包屑导航">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <span key={index} className="flex items-center gap-1 min-w-0">
                {index > 0 && (
                  <ChevronRight className="w-icon-xs h-icon-xs text-text-tertiary flex-shrink-0" />
                )}
                {crumb.path && !isLast ? (
                  <Link
                    to={crumb.path}
                    className={cn(
                      'text-b2 text-text-secondary hover:text-text-primary',
                      'transition-colors duration-kb-fast truncate',
                    )}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-b2 text-text-primary font-medium truncate">
                    {crumb.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      {/* Right: Mode + Sync + Network + Theme toggle */}
      <div className="flex items-center gap-kb-md flex-shrink-0 ml-kb-md">
        {/* Mode indicator */}
        <ModeIndicator className="hidden sm:inline-flex" />
        {/* Sync status */}
        <div
          className="flex items-center gap-kb-xs text-caption text-text-tertiary"
          title={
            isSyncing
              ? '正在同步...'
              : pendingCount > 0
                ? `${pendingCount} 项待同步`
                : formatLastSync(lastSyncAt)
          }
        >
          {isSyncing ? (
            <RefreshCw className="w-icon-xs h-icon-xs animate-spin text-semantic-info" />
          ) : pendingCount > 0 ? (
            <span className="text-caption text-semantic-warning">{pendingCount}</span>
          ) : (
            <CheckCircle2 className="w-icon-xs h-icon-xs text-semantic-success" />
          )}
        </div>

        {/* Network status */}
        <div className="flex items-center gap-kb-xs" title={netConfig.label}>
          <NetIcon className={cn('w-icon-sm h-icon-sm', netConfig.iconColor)} />
          <span className={cn('w-2 h-2 rounded-kb-full', netConfig.color)} />
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className={cn(
            'p-kb-xs rounded-kb-md',
            'text-text-secondary hover:text-text-primary',
            'hover:bg-bg-secondary',
            'transition-all duration-kb-normal ease-kb-default',
            'active:scale-95',
          )}
          aria-label="切换主题"
        >
          {theme === 'light' ? (
            <Moon className="w-icon-md h-icon-md" />
          ) : (
            <Sun className="w-icon-md h-icon-md" />
          )}
        </button>

        {/* 未登录时显示登录按钮 */}
        {!user && (
          <Link
            to="/login"
            className={cn(
              'px-3 py-1.5 rounded-kb-md text-b2 font-medium',
              'bg-brand-500 text-white hover:bg-brand-600',
              'transition-colors duration-kb-fast',
            )}
          >
            登录
          </Link>
        )}
      </div>
    </header>
  );
}
