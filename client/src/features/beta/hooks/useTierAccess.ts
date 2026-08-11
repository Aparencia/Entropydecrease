/**
 * Tier 权限控制 Hook
 *
 * @ai-context: 提供基于用户 tier 的功能访问权限检查。
 * 用于控制 AI 功能、多模态、抢先体验等功能的可见性和可用性。
 * 本地优先：权限检查完全在客户端完成，无需联网。
 */
import { useMemo } from 'react';
import { useBetaStore } from '@/features/beta/betaStore';
import { TIER_PERKS, TIER_RANK, type UserTier } from '@/types/beta';

interface TierAccess {
  /** 当前有效 tier */
  tier: UserTier;
  /** 是否付费用户（pro 或 lifetime） */
  isPaid: boolean;
  /** 是否内测用户 */
  isBeta: boolean;
  /** 每日 AI 调用配额 */
  dailyAiCalls: number;
  /** 日费用上限 */
  dailyCostLimit: number;
  /** 是否可访问多模态 */
  canUseMultimodal: boolean;
  /** 抢先体验天数 */
  earlyAccessDays: number;
  /** 检查某个功能是否可用 */
  canAccess: (requiredTier: UserTier) => boolean;
  /** 获取 AI 配额详情（需传入已使用次数） */
  getQuotaInfo: (usedCount: number) => { used: number; total: number; tier: UserTier };
  /** 检查是否可访问指定模型 */
  canAccessModel: (modelName: string) => boolean;
}

/**
 * 检查用户是否有权访问指定 tier 的功能
 */
export function useTierAccess(): TierAccess {
  const { effectiveTier, betaProfile } = useBetaStore();

  return useMemo(() => {
    const perks = TIER_PERKS[effectiveTier] ?? TIER_PERKS.free;
    const rank = TIER_RANK[effectiveTier] ?? 0;

    return {
      tier: effectiveTier,
      isPaid: effectiveTier === 'pro' || effectiveTier === 'lifetime',
      isBeta: !!betaProfile,

      dailyAiCalls: perks.dailyAiCalls,
      dailyCostLimit: perks.dailyCostLimit,
      canUseMultimodal: perks.multimodal,
      earlyAccessDays: perks.earlyAccess,

      canAccess: (requiredTier: UserTier): boolean => {
        const requiredRank = TIER_RANK[requiredTier] ?? 0;
        return rank >= requiredRank;
      },

      getQuotaInfo: (usedCount: number) => ({
        used: usedCount,
        total: perks.dailyAiCalls,
        tier: effectiveTier,
      }),

      canAccessModel: (modelName: string): boolean => {
        if (perks.models.includes('all')) return true;
        return perks.models.includes(modelName);
      },
    };
  }, [effectiveTier, betaProfile]);
}