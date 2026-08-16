/**
 * AI 用量卡 — 设置页展示当日配额使用情况
 *
 * @ai-context: 数据来自服务端权威计数（GET /api/v1/license/quota），
 * 展示今日调用次数与费用双进度条；网关不可达时静默隐藏（增强信息不阻塞）。
 * 配额状态由全局 useQuotaStore 持有（与标题栏胶囊共用，30s 去抖拉取），
 * 挂载时兜底刷新一次（30s 窗口内不重复请求）；开发者白名单账户
 * （total_calls=-1）展示 ∞ 不限量。
 */
import { useEffect } from 'react';
import { Gauge, Coins } from 'lucide-react';
import { useQuotaStore } from '@/features/beta/useQuotaStore';
import { useAuth } from '@/lib/auth/AuthContext';
import { TIER_LABELS } from '@/types/beta';
import { cn } from '@/lib/utils';

/** 用量条（百分比钳制 0-100） */
function UsageBar({ used, total, tone }: { used: number; total: number; tone: 'brand' | 'warning' }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className="h-1.5 rounded-kb-full bg-bg-tertiary overflow-hidden">
      <div
        className={cn(
          'h-full rounded-kb-full transition-all duration-kb-fast',
          tone === 'brand' ? 'bg-brand-500' : 'bg-semantic-warning',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** AI 用量卡（设置页内嵌） */
export function AiQuotaCard() {
  const quota = useQuotaStore((s) => s.quota);
  const refresh = useQuotaStore((s) => s.refresh);
  const { getAccessToken } = useAuth();

  // 挂载时兜底刷新一次（30s 去抖窗口内与标题栏胶囊不重复请求）
  useEffect(() => {
    getAccessToken()
      .then((token) => refresh(token ?? undefined))
      .catch(() => {
        // 未登录静默（本地模式不展示配额）
      });
  }, [getAccessToken, refresh]);

  // 网关不可达或未登录时不展示（增强信息）；total_calls=0 视为数据异常；
  // -1（开发者无限配额）为合法值，不得在此过滤
  if (!quota || quota.totalCalls === 0) return null;

  // 开发者白名单账户：服务端返回 total_calls=-1（完全豁免限流/费用）
  const isUnlimited = quota.totalCalls === -1;
  const callPct = quota.totalCalls > 0 ? quota.usedCalls / quota.totalCalls : 0;
  const costPct = quota.costLimit > 0 ? quota.usedCost / quota.costLimit : 0;
  const callsNearlyDone = isUnlimited ? false : callPct >= 0.8;
  const callsExhausted = !isUnlimited && quota.usedCalls >= quota.totalCalls;

  return (
    <div className="flex flex-col gap-3 p-3 rounded-kb-md bg-bg-elevated border border-border-default">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-b3 font-medium text-text-primary">今日 AI 用量</span>
        </div>
        <span className="text-c1 text-text-tertiary">{TIER_LABELS[quota.tier]}</span>
      </div>

      {/* 调用次数 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-c1">
          <span className="text-text-tertiary">AI 调用</span>
          <span className={cn('font-medium', callsNearlyDone ? 'text-semantic-warning' : 'text-text-secondary')}>
            {isUnlimited ? '∞ 次（开发者不限量）' : callsExhausted ? '今日额度已用完' : `${quota.usedCalls}/${quota.totalCalls} 次`}
          </span>
        </div>
        {isUnlimited ? (
          <p className="text-c1 text-text-tertiary">开发者白名单账户，完全豁免配额限制</p>
        ) : (
          <UsageBar used={quota.usedCalls} total={quota.totalCalls} tone={callsNearlyDone ? 'warning' : 'brand'} />
        )}
      </div>

      {/* 费用（开发者豁免时同样展示 ∞） */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-c1">
          <span className="inline-flex items-center gap-1 text-text-tertiary">
            <Coins className="w-3 h-3" strokeWidth={1.5} />
            今日费用
          </span>
          <span className="font-medium text-text-secondary">
            {isUnlimited ? '∞（开发者豁免）' : `¥${quota.usedCost.toFixed(2)}/¥${quota.costLimit.toFixed(1)}`}
          </span>
        </div>
        {!isUnlimited && <UsageBar used={quota.usedCost} total={quota.costLimit} tone={costPct >= 0.8 ? 'warning' : 'brand'} />}
      </div>

      {/* 到期时间（订阅用户） */}
      {quota.expiresAt && quota.tier !== 'free' && (
        <p className="text-c1 text-text-tertiary">
          订阅至 {new Date(quota.expiresAt).toLocaleDateString('zh-CN')}
        </p>
      )}
    </div>
  );
}
