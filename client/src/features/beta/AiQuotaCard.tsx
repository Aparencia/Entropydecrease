/**
 * AI 用量卡 — 设置页展示当日配额使用情况
 *
 * @ai-context: 数据来自服务端权威计数（GET /api/v1/license/quota），
 * 展示今日调用次数与费用双进度条；网关不可达时静默隐藏（增强信息不阻塞）。
 */
import { Gauge, Coins } from 'lucide-react';
import { useQuota } from '@/features/beta/hooks/useQuota';
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
  const { quota } = useQuota();

  // 网关不可达或未登录时不展示（增强信息）
  if (!quota || quota.totalCalls <= 0) return null;

  const callPct = quota.totalCalls > 0 ? quota.usedCalls / quota.totalCalls : 0;
  const costPct = quota.costLimit > 0 ? quota.usedCost / quota.costLimit : 0;
  const callsNearlyDone = callPct >= 0.8;

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
            {quota.usedCalls}/{quota.totalCalls} 次
          </span>
        </div>
        <UsageBar used={quota.usedCalls} total={quota.totalCalls} tone={callsNearlyDone ? 'warning' : 'brand'} />
      </div>

      {/* 费用 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-c1">
          <span className="inline-flex items-center gap-1 text-text-tertiary">
            <Coins className="w-3 h-3" strokeWidth={1.5} />
            今日费用
          </span>
          <span className="font-medium text-text-secondary">
            ¥{quota.usedCost.toFixed(2)}/¥{quota.costLimit.toFixed(1)}
          </span>
        </div>
        <UsageBar used={quota.usedCost} total={quota.costLimit} tone={costPct >= 0.8 ? 'warning' : 'brand'} />
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
