/**
 * AI 余额查询与 API 密钥平台快捷入口区块
 *
 * @ai-context: 从 AIProviderSettings 拆出。余额查询四态（idle 未配网关/
 * loading/error/success），success 时按额度着色（>10 绿 / >0 黄 / =0 红），
 * fromCache 标记表示走了缓存未实时查询。部分服务商不支持余额查询，展示
 * reason 而非报错。密钥入口仅提供外链跳转，不在应用内收集密钥。
 */
import { Card } from '@/components/ui';
import { Shield, RefreshCw, AlertTriangle, Wallet, ExternalLink, KeyRound } from 'lucide-react';
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

/** 开放平台链接配置 */
const API_PLATFORM_LINKS = [
  {
    name: '阿里云百炼',
    description: '通义千问系列模型',
    url: 'https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key',
    color: 'text-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/15',
  },
  {
    name: '智谱 GLM',
    description: 'GLM-4 系列免费模型',
    url: 'https://open.bigmodel.cn/usercenter/apikeys',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-900/15',
  },
  {
    name: 'DeepSeek',
    description: '深度求索推理模型',
    url: 'https://platform.deepseek.com/api_keys',
    color: 'text-indigo-500',
    bg: 'bg-indigo-50 dark:bg-indigo-900/15',
  },
  {
    name: 'Google Gemini',
    description: 'Gemini 多模态模型',
    url: 'https://aistudio.google.com/app/apikey',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/15',
  },
];

export function ApiKeyLinksSection() {
  return (
    <Card padding="md" className="flex flex-col gap-kb-md mt-kb-md">
      <div className="flex items-center gap-2">
        <KeyRound className="w-icon-sm h-icon-sm text-text-secondary" strokeWidth={1.5} />
        <h2 className="text-b1 font-semibold text-text-primary">API 密钥管理</h2>
      </div>

      <p className="text-c1 text-text-tertiary -mt-2">
        快速访问各开放平台的 API Key 管理页面，用于查看、创建或更新密钥
      </p>

      {/* 平台链接网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {API_PLATFORM_LINKS.map((platform) => (
          <a
            key={platform.name}
            href={platform.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-3 p-3 rounded-kb-md',
              'border border-border-default bg-bg-elevated',
              'hover:border-brand-300 hover:shadow-kb-sm',
              'transition-all duration-kb-fast group',
            )}
          >
            <div className={cn(
              'w-8 h-8 rounded-kb-sm flex items-center justify-center flex-shrink-0',
              platform.bg,
            )}>
              <KeyRound className={cn('w-4 h-4', platform.color)} strokeWidth={1.5} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-b3 font-medium text-text-primary truncate">{platform.name}</p>
              <p className="text-c2 text-text-quaternary truncate">{platform.description}</p>
            </div>

            <ExternalLink
              className="w-3.5 h-3.5 text-text-quaternary group-hover:text-brand-500 transition-colors flex-shrink-0"
              strokeWidth={1.5}
            />
          </a>
        ))}
      </div>

      {/* 安全提示 */}
      <div className={cn(
        'flex items-start gap-2 p-2.5 rounded-kb-md',
        'bg-semantic-success/5 border border-semantic-success/20',
      )}>
        <Shield className="w-3.5 h-3.5 text-semantic-success flex-shrink-0 mt-0.5" strokeWidth={1.5} />
        <p className="text-c1 text-text-secondary leading-relaxed">
          API Key 仅保存在本地，不会上传到任何服务器。请定期轮换密钥以确保安全。
        </p>
      </div>
    </Card>
  );
}
