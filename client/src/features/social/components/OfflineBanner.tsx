/**
 * 离线模式横幅 — 社交功能优雅降级提示
 * Offline banner — graceful degradation for social features
 *
 * @ai-context: 当 sync 未启用（local 模式）或网络离线时，社交页面显示
 * 此横幅而非报错——本地优先原则：功能不可用是常态，不打断本地学习流。
 * @ai-context: Shown when sync is disabled or offline; replaces error
 * states per the local-first principle.
 */
import { WifiOff, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineBannerProps {
  /** 离线原因：syncDisabled（local 模式）| offline（网络断开）| degraded（服务不可达） */
  reason: 'syncDisabled' | 'offline' | 'degraded';
  className?: string;
}

const COPY: Record<OfflineBannerProps['reason'], { icon: typeof WifiOff; title: string; desc: string }> = {
  syncDisabled: {
    icon: WifiOff,
    title: '本地模式',
    desc: '当前为纯本地模式，社交功能暂不可用。切换到联网/云端模式即可开启。',
  },
  offline: {
    icon: WifiOff,
    title: '离线模式',
    desc: '网络已断开。你的学习不受影响，重新联网后社交功能自动恢复。',
  },
  degraded: {
    icon: Wifi,
    title: '服务暂不可达',
    desc: '同步服务暂时无法连接，正在为你保留本地模式。稍后自动重试。',
  },
};

export default function OfflineBanner({ reason, className }: OfflineBannerProps) {
  const { icon: Icon, title, desc } = COPY[reason];
  return (
    <div
      className={cn(
        'flex items-start gap-kb-sm rounded-kb-lg border border-border/40 bg-bg-elevated/40 px-kb-md py-kb-sm backdrop-blur-sm',
        className,
      )}
    >
      <Icon className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
      <div>
        <p className="text-b2 font-medium text-text-secondary">{title}</p>
        <p className="text-c1 text-text-tertiary mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
