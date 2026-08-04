/**
 * 内测/付费/Tier 身份类型定义
 *
 * @ai-context: 与 client/electron/db/schema.ts 中的 beta_profile/licenses/invite_codes 表对应。
 * tier 层级：free(0) < observer(1) < active(2) < pro(3) < core(4) < lifetime(5)
 */

// ============================================================
// Tier 层级系统
// ============================================================

/** 用户层级枚举 */
export type UserTier = 'free' | 'observer' | 'active' | 'core' | 'pro' | 'lifetime';

/** Tier 优先级排序（数字越大优先级越高） */
export const TIER_RANK: Record<UserTier, number> = {
  free: 0,
  observer: 1,
  active: 2,
  pro: 3,
  core: 4,
  lifetime: 5,
};

/** Tier 显示名称 */
export const TIER_LABELS: Record<UserTier, string> = {
  free: '免费用户',
  observer: '内测观察者',
  active: '内测活跃者',
  core: '核心共创者',
  pro: 'Pro 订阅',
  lifetime: '终身 Pro',
};

/** Tier 颜色映射 */
export const TIER_COLORS: Record<UserTier, string> = {
  free: 'text-text-tertiary',
  observer: 'text-semantic-info',
  active: 'text-semantic-success',
  core: 'text-semantic-warning',
  pro: 'text-brand-500',
  lifetime: 'text-semantic-warning',
};

/** 解析最高有效 tier */
export function resolveEffectiveTier(betaTier?: string, paidTier?: string): UserTier {
  const beta = TIER_RANK[betaTier as UserTier] ?? 0;
  const paid = TIER_RANK[paidTier as UserTier] ?? 0;
  const effective = Math.max(beta, paid);
  return (Object.entries(TIER_RANK).find(([, v]) => v === effective)?.[0] as UserTier) ?? 'free';
}

// ============================================================
// 内测身份（beta_profile）
// ============================================================

/** 内测身份本地缓存 */
export interface BetaProfile {
  id: string;
  userId: string;
  tier: UserTier;
  cohort: number;
  joinedAt: string;       // ISO 8601
  lifetimePro: boolean;
  badges: string[];        // JSON array
  perksConfig: string;     // JSON
  syncedAt?: string;       // ISO 8601
}

// ============================================================
// 激活码（licenses）
// ============================================================

/** 激活码类型 */
export type LicenseType = 'pro' | 'lifetime' | 'snd1' | 'thm1';

/** 激活码状态 */
export type LicenseStatus = 'active' | 'expired' | 'revoked';

/** 激活码本地缓存 */
export interface License {
  id: string;
  code: string;
  type: LicenseType;
  tier: UserTier;
  status: LicenseStatus;
  machineId?: string;
  activatedAt?: string;    // ISO 8601
  expiresAt?: string;      // ISO 8601
  syncedAt?: string;       // ISO 8601
}

// ============================================================
// 邀请码（invite_codes）
// ============================================================

/** 邀请码状态 */
export type InviteCodeStatus = 'pending' | 'used' | 'expired';

/** 邀请码本地缓存 */
export interface InviteCode {
  id: string;
  code: string;
  issuerUserId: string;
  status: InviteCodeStatus;
  usedByUserId?: string;
  usedAt?: string;         // ISO 8601
  createdAt: string;       // ISO 8601
}

// ============================================================
// 权益配置
// ============================================================

/** 各 tier 的 AI 权益配置 */
export interface TierPerks {
  dailyAiCalls: number;
  dailyCostLimit: number;
  models: string[];
  multimodal: boolean;
  earlyAccess: number;     // 提前天数，0=无
}

/** 按 tier 的权益配置表 */
export const TIER_PERKS: Record<UserTier, TierPerks> = {
  free:     { dailyAiCalls: 15,  dailyCostLimit: 0.5,  models: ['glm-4.6v-flash'],             multimodal: false, earlyAccess: 0 },
  observer: { dailyAiCalls: 50,  dailyCostLimit: 1.5,  models: ['glm-4.6v-flash', 'qwen-plus'],  multimodal: false, earlyAccess: 0 },
  active:   { dailyAiCalls: 80,  dailyCostLimit: 2.0,  models: ['glm-4.6v-flash', 'qwen-plus', 'deepseek-chat'], multimodal: true, earlyAccess: 3 },
  core:     { dailyAiCalls: 120, dailyCostLimit: 3.0,  models: ['all'],                         multimodal: true, earlyAccess: 5 },
  pro:      { dailyAiCalls: 80,  dailyCostLimit: 2.0,  models: ['glm-4.6v-flash', 'qwen-plus', 'deepseek-chat'], multimodal: false, earlyAccess: 0 },
  lifetime: { dailyAiCalls: 120, dailyCostLimit: 3.0,  models: ['all'],                         multimodal: true, earlyAccess: 5 },
};