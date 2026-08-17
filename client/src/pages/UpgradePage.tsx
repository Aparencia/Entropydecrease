/**
 * UpgradePage — 独立充值/升级页
 *
 * @ai-context: 充值入口闭环：购买引导（面包多外部链接）→ 激活码输入
 * （复用 LicenseActivation，锚点 license-activation-section）→ 已激活许可
 * 列表。展示当前 tier 与三档权益对比（免费/Pro/终身）。所有入口
 * （UpgradePrompt/QuotaBadge）统一跳转本页，替代此前设置页内滚动断链。
 * English: standalone upgrade page — purchase guide → license activation
 * (reused LicenseActivation, anchored) → active license list with tier
 * perks comparison; single destination for all upgrade entry points.
 */
import { ExternalLink, Key, Shield, Zap, Sparkles } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useBetaStore } from '@/features/beta/betaStore';
import { useBetaProfile } from '@/features/beta/hooks/useBetaProfile';
import { LicenseActivation } from '@/features/beta/LicenseActivation';
import { AiQuotaCard } from '@/features/beta/AiQuotaCard';
import { TIER_LABELS, TIER_COLORS } from '@/types/beta';

/** 三档权益对比（产品定价信息；激活后以 useBetaStore.effectiveTier 为准） */
const PLAN_COMPARISON = [
  {
    name: '免费',
    price: '¥0',
    period: '永久',
    features: ['每日 50 次 AI 调用', '基础模型', '多模态 ❌', '同步发布'],
    featured: false,
  },
  {
    name: 'Pro',
    price: '¥12/月',
    period: '或 ¥99/年',
    features: ['每日 80 次 AI 调用', '高级模型', '多模态 ✅', '同步发布'],
    featured: true,
  },
  {
    name: '终身',
    price: '¥199',
    period: '一次买断',
    features: ['每日 120 次 AI 调用', '全部模型', '多模态 ✅', '抢先体验 5 天'],
    featured: false,
  },
] as const;

export default function UpgradePage() {
  // 加载内测身份（tier/激活码状态）
  useBetaProfile();
  const { effectiveTier, activeLicenses } = useBetaStore();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 页头 */}
      <div className="px-kb-md py-kb-md">
        <h1 className="text-h1 font-semibold text-text-primary">升级 Pro</h1>
        <p className="text-b2 text-text-tertiary mt-1">
          解锁更多 AI 配额与高级模型，支持熵减持续进化
        </p>
      </div>

      <div className="flex-1 px-kb-md pb-kb-lg space-y-[var(--kb-beat)] max-w-2xl w-full mx-auto">
        {/* 当前身份 */}
        <Card padding="md" className="flex flex-col gap-kb-md">
          <div className="flex items-center gap-2">
            <Shield className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            <h2 className="text-b1 font-semibold text-text-primary">当前身份</h2>
          </div>
          <div className="flex items-center justify-between p-3 rounded-kb-md bg-bg-elevated border border-border-default">
            <div className="flex items-center gap-2">
              <Shield className={cn('w-4 h-4', TIER_COLORS[effectiveTier])} strokeWidth={1.5} />
              <span className={cn('text-b1 font-semibold', TIER_COLORS[effectiveTier])}>
                {TIER_LABELS[effectiveTier]}
              </span>
            </div>
            {activeLicenses.length > 0 && (
              <span className="text-c1 text-text-tertiary">{activeLicenses.length} 个激活许可</span>
            )}
          </div>
        </Card>

        {/* 权益对比 */}
        <Card padding="md" className="flex flex-col gap-kb-md">
          <div className="flex items-center gap-2">
            <Zap className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            <h2 className="text-b1 font-semibold text-text-primary">权益对比</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {PLAN_COMPARISON.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'flex flex-col gap-2 p-3 rounded-kb-md border transition-colors',
                  plan.featured
                    ? 'bg-brand-50/50 dark:bg-brand-900/10 border-brand-300/50'
                    : 'bg-bg-tertiary/40 border-border-default',
                )}
              >
                <span className={cn('text-b3 font-semibold', plan.featured ? 'text-brand-600' : 'text-text-primary')}>
                  {plan.name}
                  {plan.featured && <Sparkles className="inline w-3 h-3 ml-1" strokeWidth={1.5} />}
                </span>
                <span className="text-b1 font-bold text-text-primary">{plan.price}</span>
                <span className="text-c1 text-text-tertiary">{plan.period}</span>
                <ul className="space-y-1 mt-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-c1 text-text-secondary">{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        {/* 购买引导 + 激活码输入（锚点：UpgradePrompt 跳转后定位） */}
        <div id="license-activation-section" className="scroll-mt-4">
          <Card padding="md" className="flex flex-col gap-kb-md">
            <div className="flex items-center gap-2">
              <Key className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
              <h2 className="text-b1 font-semibold text-text-primary">激活码升级</h2>
            </div>
            <p className="text-b3 text-text-tertiary">
              三步完成升级：① 在面包多购买 Pro/终身激活码 → ② 复制激活码 → ③ 在下方输入激活。
              激活后本地缓存 7 天宽限期，离线不影响核心功能。
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => window.open('https://mianbaoduo.com', '_blank', 'noopener,noreferrer')}
                icon={<ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} />}
              >
                前往面包多购买
              </Button>
              <a
                href="https://mianbaoduo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-b3 text-text-tertiary hover:text-text-secondary transition-colors"
              >
                了解详情
              </a>
            </div>
          </Card>
          {/* 激活码输入（含格式校验/状态展示） */}
          <LicenseActivation />
        </div>

        {/* 已激活许可列表 */}
        {activeLicenses.length > 0 && (
          <Card padding="md" className="flex flex-col gap-kb-md">
            <div className="flex items-center gap-2">
              <Shield className="w-icon-sm h-icon-sm text-emerald-500" strokeWidth={1.5} />
              <h2 className="text-b1 font-semibold text-text-primary">已激活的许可</h2>
            </div>
            <div className="space-y-1">
              {activeLicenses.map((license) => (
                <div
                  key={license.id}
                  className="flex items-center justify-between p-2 rounded-kb-sm bg-bg-tertiary/50"
                >
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-text-tertiary" strokeWidth={1.5} />
                    <span className="text-c1 text-text-secondary font-mono text-xs">
                      {license.code.slice(0, 12)}...
                    </span>
                    <span className={cn(
                      'text-c2 px-1.5 py-0.5 rounded-kb-sm',
                      license.status === 'active' ? 'bg-semantic-success/10 text-semantic-success' : 'bg-semantic-error/10 text-semantic-error',
                    )}>
                      {license.status === 'active' ? '有效' : '已失效'}
                    </span>
                  </div>
                  <span className="text-c1 text-text-tertiary">{TIER_LABELS[license.tier]}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* AI 用量卡（服务端权威配额） */}
        <AiQuotaCard />
      </div>
    </div>
  );
}
