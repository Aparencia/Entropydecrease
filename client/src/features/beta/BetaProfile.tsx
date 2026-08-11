/**
 * 内测身份卡片 — 设置页嵌入
 *
 * @ai-context: 展示用户的内测层级、加入时间、徽章、权益摘要。
 * 核心层用户可在此查看/复制邀请码。
 * 所有用户可在此输入激活码升级 Pro。
 */
import { useState } from 'react';
import { Shield, Gift, Key, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, Button, Input, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/AuthContext';
import { useBetaStore } from '@/features/beta/betaStore';
import { TIER_LABELS, TIER_COLORS, type UserTier } from '@/types/beta';
import { InviteCodeSection } from './InviteCodeSection';
import { LicenseActivation } from './LicenseActivation';

export function BetaProfile() {
  const { user } = useAuth();
  const {
    betaProfile,
    effectiveTier,
    activeLicenses,
    paidStatus,
  } = useBetaStore();

  const [expanded, setExpanded] = useState(false);

  // 是否显示内测面板：有内测身份 或 有付费许可
  const hasBeta = !!betaProfile;
  const hasLicense = activeLicenses.length > 0;

  if (!user) return null;

  // 既不是内测用户也没有付费许可 → 显示邀请码输入（轻量版）
  if (!hasBeta && !hasLicense) {
    return <BetaInvitePrompt />;
  }

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
          <h2 className="text-b1 font-semibold text-text-primary">我的身份</h2>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-b3 text-text-tertiary hover:text-text-secondary transition-colors"
        >
          {expanded ? '收起' : '展开'}
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* 身份摘要 */}
      <div className="flex items-center gap-3 p-3 rounded-kb-md bg-bg-elevated border border-border-default">
        {/* Tier 层级标识 */}
        <div className={cn(
          'w-10 h-10 rounded-kb-full flex items-center justify-center flex-shrink-0',
          effectiveTier === 'lifetime' || effectiveTier === 'core'
            ? 'bg-semantic-warning/10'
            : effectiveTier === 'pro'
              ? 'bg-brand-50 dark:bg-brand-900/20'
              : 'bg-bg-tertiary',
        )}>
          <Shield className={cn(
            'w-5 h-5',
            effectiveTier === 'lifetime' || effectiveTier === 'core'
              ? 'text-semantic-warning'
              : effectiveTier === 'pro'
                ? 'text-brand-500'
                : 'text-text-tertiary',
          )} strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn('text-b1 font-semibold', TIER_COLORS[effectiveTier])}>
            {TIER_LABELS[effectiveTier]}
          </p>
          <p className="text-c1 text-text-tertiary">
            {betaProfile?.joinedAt
              ? `加入于 ${new Date(betaProfile.joinedAt).toLocaleDateString('zh-CN')}`
              : activeLicenses.length > 0
                ? '付费用户'
                : ''}
            {betaProfile?.cohort && ` · 第 ${betaProfile.cohort} 批`}
          </p>
        </div>
        {/* 徽章 */}
        {betaProfile && betaProfile.badges.length > 0 && (
          <div className="flex items-center gap-1">
            {betaProfile.badges.slice(0, 3).map((badge) => (
              <span
                key={badge}
                className="w-6 h-6 rounded-kb-full bg-brand-50 dark:bg-brand-900/20 flex items-center justify-center text-c1"
                title={badge}
              >
                {badge === 'founder' ? '🪼' : badge === 'bug-hunter' ? '🐛' : badge === 'idea-lighthouse' ? '💡' : '🌟'}
              </span>
            ))}
            {betaProfile.badges.length > 3 && (
              <span className="text-c1 text-text-tertiary">+{betaProfile.badges.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* 展开面板 */}
      {expanded && (
        <div className="space-y-4">
          {/* 付费状态（服务端 user_metadata.paid 快照，跨设备同步） */}
          {paidStatus && (
            <div className="flex items-center justify-between p-2 rounded-kb-sm bg-brand-50/50 dark:bg-brand-900/10">
              <span className="text-b3 font-medium text-brand-500">
                {paidStatus.tier === 'lifetime' ? '✨ 终身 Pro（服务端确认）' : '✨ Pro 订阅（服务端确认）'}
              </span>
              {paidStatus.expiresAt && (
                <span className="text-c1 text-text-tertiary">
                  至 {new Date(paidStatus.expiresAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </div>
          )}

          {/* 权益摘要 */}
          <div className="grid grid-cols-2 gap-2">
            <PerkBadge
              label="每日 AI 配额"
              value={effectiveTier === 'lifetime' || effectiveTier === 'core' ? '120次' : effectiveTier === 'pro' || effectiveTier === 'active' ? '80次' : '50次'}
            />
            <PerkBadge
              label="可用模型"
              value={effectiveTier === 'lifetime' || effectiveTier === 'core' ? '全部模型' : effectiveTier === 'pro' || effectiveTier === 'active' ? '高级模型' : '基础模型'}
            />
            <PerkBadge
              label="多模态"
              value={effectiveTier === 'lifetime' || effectiveTier === 'core' || effectiveTier === 'active' ? '✅ 已开启' : '❌ 未开启'}
            />
            <PerkBadge
              label="抢先体验"
              value={effectiveTier === 'lifetime' || effectiveTier === 'core' ? '提前5天' : effectiveTier === 'active' ? '提前3天' : '同步发布'}
            />
          </div>

          {/* 内测用户专属：邀请码管理 */}
          {betaProfile && (betaProfile.tier === 'core' || betaProfile.tier === 'active') && (
            <InviteCodeSection />
          )}

          {/* 激活码输入（所有用户可见） */}
          <LicenseActivation />

          {/* 已有激活码列表 */}
          {activeLicenses.length > 0 && (
            <div className="space-y-1">
              <p className="text-b3 text-text-tertiary">已激活的许可</p>
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
          )}
        </div>
      )}
    </Card>
  );
}

/** 权益小标签 */
function PerkBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded-kb-sm bg-bg-tertiary/50">
      <span className="text-c1 text-text-tertiary">{label}</span>
      <span className="text-b3 font-medium text-text-primary">{value}</span>
    </div>
  );
}

/** 非内测用户的邀请码输入提示 */
function BetaInvitePrompt() {
  const { toast } = useToast();
  const { getAccessToken } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [activating, setActivating] = useState(false);

  async function handleActivate() {
    if (!inviteCode.trim()) {
      toast({ type: 'error', message: '请输入邀请码' });
      return;
    }
    setActivating(true);
    try {
      const code = inviteCode.trim().toUpperCase();

      // 调服务端验证邀请码
      const token = await getAccessToken();
      const resp = await fetch('/api/v1/beta/use-invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code }),
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ detail: '验证失败' }));
        throw new Error(errBody.detail || '邀请码无效');
      }

      const data = await resp.json();

      // 服务端验证成功 → 更新本地身份
      const { addInviteCode, setBetaProfile } = useBetaStore.getState();
      addInviteCode({
        id: crypto.randomUUID(),
        code,
        issuerUserId: 'pending',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setBetaProfile({
        id: crypto.randomUUID(),
        userId: 'local',
        tier: (data.tier || 'observer') as UserTier,
        cohort: data.cohort || 1,
        joinedAt: new Date().toISOString(),
        lifetimePro: false,
        badges: [],
        perksConfig: '{}',
      });
      toast({ type: 'success', message: data.message || '欢迎加入内测！' });
      setInviteCode('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '邀请码验证失败';
      toast({ type: 'error', message: msg });
    } finally {
      setActivating(false);
    }
  }

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <div className="flex items-center gap-2">
        <Gift className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
        <h2 className="text-b1 font-semibold text-text-primary">内测邀请</h2>
      </div>
      <p className="text-b3 text-text-tertiary">
        你已获得内测邀请码？输入后即可加入内测，享受专属权益
      </p>
      <div className="flex items-center gap-2">
        <Input
          placeholder="输入邀请码，如 INVITE-XXXX-XXXX"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          className="flex-1"
        />
        <Button
          variant="primary"
          size="sm"
          loading={activating}
          onClick={handleActivate}
          icon={<Gift className="w-3.5 h-3.5" strokeWidth={1.5} />}
        >
          激活
        </Button>
      </div>
    </Card>
  );
}