/**
 * AI 余额查询区块
 *
 * @ai-context: 从 AIProviderSettings 拆出。余额查询四态（idle 未配网关/
 * loading/error/success），success 时按额度着色（>10 绿 / >0 黄 / =0 红），
 * fromCache 标记表示走了缓存未实时查询。部分服务商不支持余额查询，展示
 * reason 而非报错。余额为服务端网关配置 Key 的额度（非用户自定义 Key）。
 */
import { Card } from '@/components/ui';
import { RefreshCw, AlertTriangle, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAIBalance } from '@/hooks/useAIBalance';

export function AIBalanceSection() {
  const { status, providers, fromCache, queriedAt, error, refresh } = useAIBalance();

  return (
    <Card padding="md" className="flex flex-col gap-kb-md mt-kb-md">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-icon-sm h-icon-sm text-text-secondary" strokeWidth={1.5} />
          <h2 className="text-b1 font-semibold text-text-primary">API 余额</h2>
        </div>
        <div className="flex items-center gap-2">
          {status === 'success' && fromCache && (
            <span className="text-c2 text-text-quaternary">缓存</span>
          )}
          {status === 'success' && queriedAt && (
            <span className="text-c2 text-text-quaternary">
              {new Date(queriedAt * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={status === 'loading'}
            className={cn(
              'p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated',
              'transition-colors duration-kb-fast',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            title="刷新余额"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', status === 'loading' && 'animate-spin')} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <div className="flex items-center justify-center py-4">
          <div className="w-5 h-5 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <span className="ml-2 text-b3 text-text-tertiary">正在查询余额...</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2 p-3 rounded-kb-md bg-semantic-error/5 border border-semantic-error/20">
          <AlertTriangle className="w-icon-sm h-icon-sm text-semantic-error flex-shrink-0" strokeWidth={1.5} />
          <span className="text-b3 text-semantic-error">{error || '查询失败'}</span>
        </div>
      )}

      {/* 空闲状态（未配置网关） */}
      {status === 'idle' && (
        <p className="text-b3 text-text-tertiary py-2">
          配置 AI 网关后将自动显示各服务商的 API 余额
        </p>
      )}

      {/* 余额列表 */}
      {status === 'success' && providers.length > 0 && (
        <div className="space-y-2">
          {providers.map((p) => (
            <div
              key={p.provider}
              className="flex items-center justify-between p-3 rounded-kb-md bg-bg-elevated border border-border-default"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    p.status === 'ok' && p.supported && 'bg-semantic-success',
                    p.status === 'ok' && !p.supported && 'bg-text-quaternary',
                    p.status === 'error' && 'bg-semantic-error',
                  )}
                />
                <span className="text-b3 text-text-primary">{p.display_name}</span>
              </div>

              {/* 余额数值 */}
              {p.status === 'ok' && p.supported && p.total_balance !== null && p.total_balance !== undefined ? (
                <div className="text-right">
                  <span className={cn(
                    'text-b2 font-semibold tabular-nums',
                    p.total_balance > 10 ? 'text-semantic-success' :
                    p.total_balance > 0 ? 'text-semantic-warning' : 'text-semantic-error',
                  )}>
                    ¥{p.total_balance.toFixed(2)}
                  </span>
                  {/* 赠送/充值明细 */}
                  {p.granted_balance != null && p.topped_up_balance != null && (
                    <p className="text-c2 text-text-quaternary mt-0.5">
                      赠送 ¥{p.granted_balance.toFixed(2)} · 充值 ¥{p.topped_up_balance.toFixed(2)}
                    </p>
                  )}
                </div>
              ) : p.status === 'ok' && !p.supported ? (
                <span className="text-c1 text-text-quaternary">{p.reason || '暂不支持查询'}</span>
              ) : (
                <span className="text-c1 text-semantic-error">{p.error || '查询失败'}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 成功但无 Provider */}
      {status === 'success' && providers.length === 0 && (
        <p className="text-b3 text-text-tertiary py-2">
          未检测到已配置的 AI 服务商，请检查服务端环境变量
        </p>
      )}
    </Card>
  );
}
