/**
 * @ai-context: 设置页组件：ModeSettings。
 */
import { motion } from 'framer-motion';
import { Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useModeState } from '@/hooks/useMode';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { modeManager, type AppMode } from '@/lib/mode/ModeManager';
import { useAuth } from '@/lib/auth/AuthContext';
import { useTierAccess } from '@/features/beta/hooks/useTierAccess';
import { TIER_PERKS } from '@/types/beta';
import {
  Monitor, Wifi, Cloud, Check, WifiOff, Signal,
  Sparkles, RefreshCw, HardDrive, Shield,
} from 'lucide-react';

/**
 * 三模式设置卡片
 * v0.9.0: 本地模式 / 联网模式(hybrid) / 云端模式(full)
 */

interface ModeCardData {
  mode: AppMode;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  activeBg: string;
  activeBorder: string;
  features: { label: string; enabled: boolean }[];
}

const modeCards: ModeCardData[] = [
  {
    mode: 'local',
    name: '本地模式',
    description: '纯离线运行，所有数据仅存储在本地设备',
    icon: <Monitor className="w-6 h-6" strokeWidth={1.5} />,
    color: 'text-slate-500',
    activeBg: 'bg-slate-500/10',
    activeBorder: 'border-slate-400/50',
    features: [
      { label: '离线使用', enabled: true },
      { label: 'AI 功能', enabled: false },
      { label: '云端同步', enabled: false },
      { label: '自动备份', enabled: false },
    ],
  },
  {
    mode: 'hybrid',
    name: '联网模式',
    description: '本地优先，联网时自动同步，离线时降级为本地',
    icon: <Wifi className="w-6 h-6" strokeWidth={1.5} />,
    color: 'text-blue-500',
    activeBg: 'bg-blue-500/10',
    activeBorder: 'border-blue-400/50',
    features: [
      { label: '离线使用', enabled: true },
      { label: 'AI 功能', enabled: true },
      { label: '云端同步', enabled: false },
      { label: '自动备份', enabled: false },
    ],
  },
  {
    mode: 'full',
    name: '云端模式',
    description: '完全云端，所有操作实时同步至服务器',
    icon: <Cloud className="w-6 h-6" strokeWidth={1.5} />,
    color: 'text-brand-500',
    activeBg: 'bg-brand-500/10',
    activeBorder: 'border-brand-400/50',
    features: [
      { label: '离线使用', enabled: true },
      { label: 'AI 功能', enabled: true },
      { label: '云端同步', enabled: true },
      { label: '实时备份', enabled: true },
    ],
  },
];

export default function ModeSettings() {
  const { mode } = useModeState();
  const { isOnline, isWeak, isOffline } = useNetworkStatus();
  const prefersReduced = useReducedMotion();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { tier } = useTierAccess();
  const multiDeviceSync = TIER_PERKS[tier]?.multiDeviceSync ?? false;

  const handleChangeMode = (newMode: AppMode) => {
    if (mode === newMode) return;
    if ((newMode === 'hybrid' || newMode === 'full') && !isAuthenticated) {
      toast({ type: 'warning', message: '请先登录后再开启云同步功能' });
      return;
    }
    modeManager.setMode(newMode);
    const labels: Record<AppMode, string> = { local: '本地模式', hybrid: '联网模式', full: '云端模式' };
    toast({ type: 'success', message: `已切换到${labels[newMode]}` });
  };

  const springTransition = prefersReduced
    ? { duration: 0.01 }
    : { type: 'spring' as const, stiffness: 300, damping: 28 };

  // 网络状态指示器
  const networkStatus = isOffline
    ? { label: '离线', color: 'text-semantic-error', bg: 'bg-semantic-error/10', icon: <WifiOff className="w-3.5 h-3.5" /> }
    : isWeak
      ? { label: '弱网', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: <Signal className="w-3.5 h-3.5" /> }
      : { label: '在线', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: <Wifi className="w-3.5 h-3.5" /> };

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-b1 font-semibold text-text-primary">运行模式</h2>
          <p className="text-c1 text-text-tertiary mt-0.5">选择数据存储和同步方式</p>
        </div>
        <div className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-c1 font-medium',
          networkStatus.bg, networkStatus.color,
        )}>
          {networkStatus.icon}
          {networkStatus.label}
        </div>
      </div>

      <div className="grid gap-3">
        {modeCards.map((card, idx) => {
          const isActive = mode === card.mode;
          const isLocked = (card.mode === 'hybrid' || card.mode === 'full') && !isAuthenticated;

          return (
            <motion.button
              key={card.mode}
              onClick={() => handleChangeMode(card.mode)}
              initial={prefersReduced ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={
                prefersReduced
                  ? { duration: 0.01 }
                  : { type: 'spring', stiffness: 350, damping: 28, delay: idx * 0.06 }
              }
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={cn(
                'relative flex items-start gap-4 p-4 rounded-kb-lg border-2 text-left transition-all duration-200',
                isActive
                  ? `${card.activeBg} ${card.activeBorder}`
                  : 'bg-bg-secondary border-border/40 hover:bg-bg-tertiary/30 hover:border-border/60',
                isLocked && 'opacity-60 cursor-not-allowed',
              )}
            >
              {/* 当前模式指示 */}
              {isActive && (
                <motion.div
                  layoutId="mode-active-ring"
                  className={cn('absolute inset-0 rounded-kb-lg border-2', card.activeBorder)}
                  transition={springTransition}
                />
              )}

              {/* 图标 */}
              <div className={cn(
                'relative z-10 w-12 h-12 rounded-kb-lg flex items-center justify-center flex-shrink-0',
                isActive ? card.activeBg : 'bg-bg-tertiary/50',
                isActive ? card.color : 'text-text-tertiary',
              )}>
                {card.icon}
              </div>

              {/* 内容 */}
              <div className="relative z-10 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={cn(
                    'text-b2 font-semibold',
                    isActive ? 'text-text-primary' : 'text-text-secondary',
                  )}>
                    {card.name}
                  </h3>
                  {isActive && (
                    <motion.div
                      layoutId="mode-check"
                      className={cn('w-5 h-5 rounded-full flex items-center justify-center', card.activeBg)}
                      transition={springTransition}
                    >
                      <Check className={cn('w-3 h-3', card.color)} strokeWidth={2.5} />
                    </motion.div>
                  )}
                  {isLocked && (
                    <span className="text-c1 text-text-tertiary bg-bg-tertiary px-1.5 py-0.5 rounded">需登录</span>
                  )}
                </div>
                <p className="text-c1 text-text-tertiary mt-0.5">{card.description}</p>

                {/* 功能列表 */}
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {card.features.map((feat) => (
                    <span
                      key={feat.label}
                      className={cn(
                        'inline-flex items-center gap-1 text-c1 px-2 py-0.5 rounded-full',
                        feat.enabled
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-bg-tertiary/50 text-text-tertiary line-through',
                      )}
                    >
                      {feat.enabled ? (
                        <Check className="w-2.5 h-2.5" strokeWidth={2.5} />
                      ) : (
                        <span className="w-2.5 h-2.5" />
                      )}
                      {feat.label}
                    </span>
                  ))}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* 多设备同步权益提示（D4：免费层单设备，Pro/内测多设备） */}
      <div className={cn(
        'flex items-center gap-2 rounded-kb-lg px-3 py-2 text-c1',
        multiDeviceSync
          ? 'bg-emerald-500/10 text-emerald-600'
          : 'bg-bg-tertiary/40 text-text-tertiary',
      )}>
        <Shield className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
        {multiDeviceSync ? (
          <span>多设备同步已解锁——学习数据可在你的多台设备间保持一致</span>
        ) : (
          <span>免费层为单设备同步——升级 Pro 可解锁多设备数据同步</span>
        )}
      </div>
    </Card>
  );
}
