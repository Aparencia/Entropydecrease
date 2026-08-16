/**
 * 标题栏 AI 配额胶囊 — 全页面常驻的配额可见入口
 *
 * @ai-context: 市场惯例（Kimi/DeepSeek/豆包等）的"常驻可见剩余额度"：
 * 标题栏展示剩余次数并随阈值变色（≥80% 琥珀预警、100% 红色耗尽），
 * 点击跳转设置页查看完整用量；未登录/网关不可达时隐藏；开发者账户
 * （服务端返回 total_calls=-1）显示 ∞ 品牌色。数据源为 useQuotaStore
 * 全局配额状态（30s 去抖拉取，429 事件强制刷新）。
 * @ai-context: Persistent AI quota pill in the titlebar — threshold-tinted
 * (amber ≥80%, red exhausted), navigates to settings on click.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useQuotaStore } from '@/features/beta/useQuotaStore';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils';

export function QuotaBadge() {
  const navigate = useNavigate();
  const { getAccessToken } = useAuth();
  const quota = useQuotaStore((s) => s.quota);
  const refresh = useQuotaStore((s) => s.refresh);

  // 首次挂载拉取一次（后续由 429 事件 / 设置页用量卡驱动刷新）
  useEffect(() => {
    getAccessToken()
      .then((token) => refresh(token ?? undefined))
      .catch(() => {
        // 未登录静默（本地模式不展示配额）
      });
  }, [getAccessToken, refresh]);

  // 未登录 / 网关不可达 / 数据异常（total_calls=0）→ 隐藏（增强信息不阻塞）；
  // 注意：total_calls=-1（开发者无限配额）是合法值，不得在此过滤
  if (!quota || quota.totalCalls === 0) return null;

  const isUnlimited = quota.totalCalls === -1;
  const remaining = Math.max(0, quota.totalCalls - quota.usedCalls);
  const exhausted = !isUnlimited && remaining <= 0;
  const nearlyDone = !isUnlimited && !exhausted && quota.usedCalls / quota.totalCalls >= 0.8;

  return (
    <button
      onClick={() => navigate('/settings')}
      className={cn(
        'no-drag flex items-center gap-1.5 h-6 px-2.5 mr-1 rounded-kb-full text-c1 font-medium',
        'border transition-colors',
        exhausted
          ? 'border-error/40 bg-error/10 text-error'
          : nearlyDone
            ? 'border-semantic-warning/40 bg-semantic-warning/10 text-semantic-warning'
            : 'border-border-default/60 bg-bg-elevated/60 text-text-secondary hover:text-brand-500 hover:border-brand-500/40',
      )}
      aria-label="AI 配额"
      title="今日 AI 配额，点击查看详情"
    >
      <Sparkles className="w-3 h-3" strokeWidth={1.5} />
      <span>{isUnlimited ? 'AI ∞' : exhausted ? 'AI 已用完' : `AI ${remaining} 次`}</span>
    </button>
  );
}
