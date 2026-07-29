/**
 * AI 网关健康状态指示器
 *
 * @ai-context: 从 AIProviderSettings 拆出。四态展示 online/degraded/
 * offline/checking；offline 时按 errorType 给出可操作诊断文案（网络断开/
 * 网关未启动/超时/CORS/服务端/DNS），degraded 时展开各 provider 明细，
 * 便于用户判断是自身网络还是某个模型服务的问题。
 */
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { useAIGatewayHealth } from '@/hooks/useAIGatewayHealth';

type HealthResult = ReturnType<typeof useAIGatewayHealth>;

export interface GatewayHealthIndicatorProps {
  status: HealthResult['status'];
  latency: HealthResult['latency'];
  errorType: HealthResult['errorType'];
  healthyCount: HealthResult['healthyCount'];
  totalCount: HealthResult['totalCount'];
  onRecheck: () => void;
}

/** offline 时按错误类型给出可操作提示 */
function offlineLabel(errorType: HealthResult['errorType']): string {
  switch (errorType) {
    case 'network_disconnected': return '网络已断开';
    case 'connection_refused': return 'AI 网关服务未启动';
    case 'timeout': return '连接超时';
    case 'cors_error': return 'CORS 配置错误';
    case 'server_error': return '服务端错误';
    case 'dns_error': return 'DNS 解析错误';
    default: return '未连接';
  }
}

export function GatewayHealthIndicator({
  status, latency, errorType, healthyCount, totalCount, onRecheck,
}: GatewayHealthIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {/* 状态圆点 */}
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            status === 'online' && 'bg-semantic-success',
            status === 'degraded' && 'bg-semantic-warning',
            status === 'offline' && 'bg-semantic-error',
            status === 'checking' && 'bg-text-quaternary animate-pulse',
          )}
        />
        {/* 状态文字 */}
        <span
          className={cn(
            'text-c1',
            status === 'online' && 'text-semantic-success',
            status === 'degraded' && 'text-semantic-warning',
            status === 'offline' && 'text-semantic-error',
            status === 'checking' && 'text-text-quaternary',
          )}
        >
          {status === 'online' && '已连接'}
          {status === 'degraded' && (
            healthyCount !== undefined && totalCount !== undefined
              ? `部分可用（${healthyCount}/${totalCount} 服务在线）`
              : '部分可用'
          )}
          {status === 'offline' && offlineLabel(errorType)}
          {status === 'checking' && '检测中...'}
        </span>
        {/* 延迟显示 */}
        {(status === 'online' || status === 'degraded') && latency !== undefined && (
          <span className="text-c1 text-text-quaternary">{latency}ms</span>
        )}
      </div>
      {/* 重新检测按钮 */}
      <button
        type="button"
        onClick={onRecheck}
        disabled={status === 'checking'}
        className={cn(
          'p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated',
          'transition-colors duration-kb-fast',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          status === 'checking' && 'animate-spin',
        )}
        title="重新检测"
      >
        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    </div>
  );
}

/** degraded 状态下各 Provider 可用性明细 */
export function ProviderHealthDetails({ providers }: { providers: HealthResult['providers'] }) {
  if (!providers) return null;
  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-kb-md bg-semantic-warning/5 border border-semantic-warning/20">
      <p className="text-c1 font-medium text-semantic-warning mb-0.5">服务可用性详情</p>
      {Object.entries(providers).map(([name, info]) => (
        <div key={name} className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                info.status === 'healthy' ? 'bg-semantic-success' : 'bg-semantic-error',
              )}
            />
            <span className="text-c1 text-text-secondary">{name}</span>
          </div>
          <span className={cn(
            'text-c2',
            info.status === 'healthy' ? 'text-text-tertiary' : 'text-semantic-error',
          )}>
            {info.status === 'healthy' ? `${info.latency_ms}ms` : info.error ?? '不可用'}
          </span>
        </div>
      ))}
    </div>
  );
}
