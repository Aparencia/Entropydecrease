/**
 * UpgradePage — 独立充值/升级页
 *
 * @ai-context: 充值入口闭环（个人收款码模式）：套餐对比（6 会员 + 4 AI 额度包）
 * → 微信/支付宝收款码（public/qrcode/，点击放大）→ 联系客服获取激活码 →
 * 激活码输入（复用 LicenseActivation，锚点 license-activation-section）→
 * 已激活许可列表。所有入口（UpgradePrompt/QuotaBadge）统一跳转本页。
 * English: standalone upgrade page — plan comparison (6 memberships + 4 AI
 * quota packs) → personal wechat/alipay QR codes (click to enlarge) →
 * contact admin for a license code → activate in the anchored input →
 * active license list; single destination for all upgrade entry points.
 */
import { useState, useCallback, useEffect } from 'react';
import { Key, Shield, Zap, Sparkles, QrCode, X } from 'lucide-react';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useBetaStore } from '@/features/beta/betaStore';
import { useBetaProfile } from '@/features/beta/hooks/useBetaProfile';
import { LicenseActivation } from '@/features/beta/LicenseActivation';
import { AiQuotaCard } from '@/features/beta/AiQuotaCard';
import { TIER_LABELS, TIER_COLORS } from '@/types/beta';

/** 收款码图片（手动上传至 public/qrcode/；缺失时静默隐藏） */
const QR_IMAGES = [
  { key: 'wechat', label: '微信支付', src: '/qrcode/wechat.png' },
  { key: 'alipay', label: '支付宝', src: '/qrcode/alipay.png' },
] as const;

/** 套餐对比（与网关 GET /api/v1/license/plans 对齐；展示层静态，服务端为权威） */
const PLAN_COMPARISON = [
  { name: '体验日卡', price: '¥1', period: '1 天', kind: '会员', features: ['每日 80 次 AI', '基础+DeepSeek 模型'], featured: false },
  { name: '周卡', price: '¥6', period: '7 天', kind: '会员', features: ['每日 80 次 AI', '基础+DeepSeek 模型'], featured: false },
  { name: '月卡', price: '¥12', period: '30 天', kind: '会员', features: ['每日 80 次 AI', '基础+DeepSeek 模型'], featured: true },
  { name: '季卡', price: '¥30', period: '90 天', kind: '会员', features: ['每日 80 次 AI', '基础+DeepSeek 模型'], featured: false },
  { name: '年卡', price: '¥99', period: '365 天', kind: '会员', features: ['每日 80 次 AI', '基础+DeepSeek 模型'], featured: false },
  { name: '终身 Pro', price: '¥199', period: '一次买断', kind: '会员', features: ['每日 120 次 AI', '全部模型 · 多模态'], featured: false },
  { name: 'AI 50 次', price: '¥5', period: '次数包', kind: '额度', features: ['50 次 AI 调用', '不升级 tier'], featured: false },
  { name: 'AI 200 次', price: '¥16', period: '次数包', kind: '额度', features: ['200 次 AI 调用', '不升级 tier'], featured: true },
  { name: 'AI 500 次', price: '¥35', period: '次数包', kind: '额度', features: ['500 次 AI 调用', '不升级 tier'], featured: false },
  { name: 'AI 不限量', price: '¥99', period: '次数包', kind: '额度', features: ['不限量 AI 调用', '不升级 tier'], featured: false },
] as const;

export default function UpgradePage() {
  // 加载内测身份（tier/激活码状态）
  useBetaProfile();
  const { effectiveTier, activeLicenses } = useBetaStore();
  // 收款码放大弹窗
  const [zoomQr, setZoomQr] = useState<(typeof QR_IMAGES)[number] | null>(null);

  // ── 页面快捷键：L 聚焦激活码输入（原 B 打开面包多已随支付渠道移除）──
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>('input[placeholder*="ENTROPY"]');
      input?.focus();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 页头 */}
      <div className="px-kb-md py-kb-md">
        <h1 className="text-h1 font-semibold text-text-primary">升级 Pro</h1>
        <p className="text-b2 text-text-tertiary mt-1">
          解锁更多 AI 配额与高级模型；核心学习功能永久免费
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

        {/* 套餐对比（会员 6 档 + 额度包 4 档） */}
        <Card padding="md" className="flex flex-col gap-kb-md">
          <div className="flex items-center gap-2">
            <Zap className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            <h2 className="text-b1 font-semibold text-text-primary">套餐选择</h2>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PLAN_COMPARISON.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  'flex flex-col gap-1.5 p-3 rounded-kb-md border transition-colors',
                  plan.featured
                    ? 'bg-brand-50/50 dark:bg-brand-900/10 border-brand-300/50'
                    : 'bg-bg-tertiary/40 border-border-default',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-b3 font-semibold', plan.featured ? 'text-brand-600' : 'text-text-primary')}>
                    {plan.name}
                  </span>
                  {plan.featured && <Sparkles className="w-3 h-3 text-brand-500" strokeWidth={1.5} />}
                  <span className={cn(
                    'ml-auto text-c2 px-1.5 py-0.5 rounded-kb-sm',
                    plan.kind === '会员' ? 'bg-cyber/10 text-cyber' : 'bg-amber-500/10 text-amber-600',
                  )}>
                    {plan.kind}
                  </span>
                </div>
                <span className="text-b1 font-bold text-text-primary">{plan.price}</span>
                <span className="text-c1 text-text-tertiary">{plan.period}</span>
                <ul className="space-y-0.5 mt-0.5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-c1 text-text-secondary">{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        {/* 收款方式：个人收款码（扫码付款 → 联系客服获取激活码） */}
        <Card padding="md" className="flex flex-col gap-kb-md">
          <div className="flex items-center gap-2">
            <QrCode className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            <h2 className="text-b1 font-semibold text-text-primary">扫码付款</h2>
          </div>
          <p className="text-b3 text-text-tertiary">
            选择套餐扫码付款后，<strong className="text-text-secondary">联系客服（微信/QQ）</strong>
            提供付款截图获取对应激活码；在下方输入激活即可生效。初期限量发售，人工审核后手动发码。
          </p>
          <div className="flex items-center gap-4">
            {QR_IMAGES.map((qr) => (
              <button
                key={qr.key}
                type="button"
                onClick={() => setZoomQr(qr)}
                className="group flex flex-col items-center gap-1.5"
                title={`点击放大${qr.label}收款码`}
              >
                {/* 二维码图片缺失（未上传）时显示占位框，不阻断页面 */}
                <img
                  src={qr.src}
                  alt={`${qr.label}收款码`}
                  className="w-28 h-28 rounded-kb-md border border-border-default object-cover bg-bg-tertiary/50 group-hover:border-brand-300 transition-colors"
                  onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                />
                <span className="text-c1 text-text-secondary">{qr.label}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* 激活码输入（锚点：UpgradePrompt 跳转后定位） */}
        <div id="license-activation-section" className="scroll-mt-4">
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
                    {/* AI 额度包余额展示 */}
                    {typeof license.quotaBalance === 'number' && license.quotaBalance !== -1 && (
                      <span className="text-c2 text-brand-600">余额 {license.quotaBalance} 次</span>
                    )}
                    {license.quotaBalance === -1 && (
                      <span className="text-c2 text-brand-600">不限量</span>
                    )}
                  </div>
                  <span className="text-c1 text-text-tertiary">{TIER_LABELS[license.tier]}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* AI 用量卡（服务端权威配额 + 额度包余额） */}
        <AiQuotaCard />
      </div>

      {/* 收款码放大弹窗 */}
      {zoomQr && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setZoomQr(null)}
        >
          <div className="relative p-5 rounded-kb-xl bg-bg-elevated border border-border/40 shadow-kb-lg" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoomQr(null)}
              className="absolute top-2 right-2 p-1 rounded-kb-sm text-text-tertiary hover:text-text-secondary"
              aria-label="关闭"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
            <p className="text-b3 font-medium text-text-primary text-center mb-3">{zoomQr.label}收款码</p>
            <img src={zoomQr.src} alt={`${zoomQr.label}收款码`} className="w-56 h-56 rounded-kb-md object-cover bg-bg-tertiary/50" />
            <p className="text-c1 text-text-tertiary text-center mt-3">付款后联系客服获取激活码</p>
          </div>
        </div>
      )}
    </div>
  );
}
