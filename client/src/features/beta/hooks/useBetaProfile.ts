/**
 * 内测身份数据加载 Hook
 *
 * @ai-context: 从本地 SQLite 加载 beta_profile 数据到 Zustand store。
 * 若 Supabase 有配置，联网时同步服务端身份数据。
 * 同时解析 user_metadata.paid 付费快照（跨设备同步订阅状态）。
 */
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { useBetaStore } from '@/features/beta/betaStore';
import type { BetaProfile, PaidStatus, UserTier } from '@/types/beta';

/**
 * 加载内测身份数据
 * 本地优先：从 SQLite 读取缓存，联网时同步服务端
 */
export function useBetaProfile() {
  const { user } = useAuth();
  const {
    betaProfile,
    setBetaProfile,
    setPaidStatus,
    setLoading,
    loading,
    initialized,
  } = useBetaStore();

  useEffect(() => {
    if (!user) {
      setBetaProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    // 从 Supabase user_metadata 初始化内测身份
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const betaMeta = meta?.beta as Record<string, unknown> | undefined;

    if (betaMeta && !betaProfile) {
      const profile: BetaProfile = {
        id: crypto.randomUUID(),
        userId: user.id,
        tier: (betaMeta.tier as UserTier) ?? 'observer',
        cohort: typeof betaMeta.cohort === 'number' ? betaMeta.cohort : parseInt(String(betaMeta.cohort), 10) || 1,
        joinedAt: (betaMeta.joined_at as string) ?? new Date().toISOString(),
        lifetimePro: (betaMeta.lifetime_pro as boolean) ?? false,
        badges: Array.isArray(betaMeta.badges) ? betaMeta.badges as string[] : [],
        perksConfig: '{}',
        syncedAt: new Date().toISOString(),
      };
      setBetaProfile(profile);
    }

    // 解析付费身份快照（user_metadata.paid）——每次登录刷新，供跨设备同步
    const paidMeta = meta?.paid as Record<string, unknown> | undefined;
    if (paidMeta && typeof paidMeta.tier === 'string' && (paidMeta.tier === 'pro' || paidMeta.tier === 'lifetime')) {
      const paid: PaidStatus = {
        tier: paidMeta.tier,
        expiresAt: typeof paidMeta.expires_at === 'string' ? paidMeta.expires_at : undefined,
        updatedAt: (paidMeta.updated_at as string) ?? new Date().toISOString(),
      };
      setPaidStatus(paid);
    } else {
      setPaidStatus(null);
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return {
    betaProfile,
    loading,
    initialized,
  };
}