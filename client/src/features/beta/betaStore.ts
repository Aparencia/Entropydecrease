/**
 * 内测/付费身份状态管理
 *
 * @ai-context: 管理用户 tier 身份、激活码、邀请码的全局状态。
 * 本地优先：离线时使用本地缓存，联网时同步服务端。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserTier, BetaProfile, License, InviteCode, PaidStatus } from '@/types/beta';
import { resolveEffectiveTier, TIER_RANK } from '@/types/beta';

// ============================================================
// 状态类型
// ============================================================

interface BetaState {
  // 内测身份
  betaProfile: BetaProfile | null;
  // 付费身份（服务端 user_metadata.paid 快照，跨设备同步订阅状态）
  paidStatus: PaidStatus | null;
  // 有效激活码列表
  activeLicenses: License[];
  // 我的邀请码
  myInviteCodes: InviteCode[];
  // 有效 tier（取 beta + paid 最高者）
  effectiveTier: UserTier;
  // 加载状态
  loading: boolean;
  // 初始化标记
  initialized: boolean;
}

interface BetaActions {
  /** 设置内测身份 */
  setBetaProfile: (profile: BetaProfile | null) => void;
  /** 设置付费身份（服务端快照；null = 无付费身份） */
  setPaidStatus: (status: PaidStatus | null) => void;
  /** 添加激活码 */
  addLicense: (license: License) => void;
  /** 移除过期/失效激活码 */
  removeLicense: (licenseId: string) => void;
  /** 设置邀请码列表 */
  setInviteCodes: (codes: InviteCode[]) => void;
  /** 添加一条邀请码 */
  addInviteCode: (code: InviteCode) => void;
  /** 使用一条邀请码 */
  useInviteCode: (codeId: string) => void;
  /** 重新计算有效 tier */
  recalcEffectiveTier: () => void;
  /** 重置所有状态（登出时） */
  reset: () => void;
  /** 设置加载状态 */
  setLoading: (loading: boolean) => void;
}

type BetaStore = BetaState & BetaActions;

// ============================================================
// 初始状态
// ============================================================

const initialState: BetaState = {
  betaProfile: null,
  paidStatus: null,
  activeLicenses: [],
  myInviteCodes: [],
  effectiveTier: 'free',
  loading: false,
  initialized: false,
};

// ============================================================
// Store
// ============================================================

export const useBetaStore = create<BetaStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setBetaProfile: (profile) => {
        set({ betaProfile: profile });
        get().recalcEffectiveTier();
      },

      setPaidStatus: (status) => {
        set({ paidStatus: status });
        get().recalcEffectiveTier();
      },

      addLicense: (license) => {
        const { activeLicenses } = get();
        // 避免重复添加
        if (activeLicenses.some((l) => l.code === license.code)) return;
        const updated = [...activeLicenses, license];
        set({ activeLicenses: updated });
        get().recalcEffectiveTier();
      },

      removeLicense: (licenseId) => {
        const updated = get().activeLicenses.filter((l) => l.id !== licenseId);
        set({ activeLicenses: updated });
        get().recalcEffectiveTier();
      },

      setInviteCodes: (codes) => set({ myInviteCodes: codes }),

      addInviteCode: (code) => {
        const { myInviteCodes } = get();
        if (myInviteCodes.some((c) => c.code === code.code)) return;
        set({ myInviteCodes: [...myInviteCodes, code] });
      },

      useInviteCode: (codeId) => {
        const updated = get().myInviteCodes.map((c) =>
          c.id === codeId ? { ...c, status: 'used' as const } : c,
        );
        set({ myInviteCodes: updated });
      },

      recalcEffectiveTier: () => {
        const { betaProfile, activeLicenses, paidStatus } = get();
        const betaTier = betaProfile?.tier;
        // 取最高优先级的付费 tier：本地激活码 + 服务端 paid 快照（跨设备同步）
        const licenseTier = activeLicenses
          .filter((l) => l.status === 'active')
          .map((l) => l.tier)
          .sort((a, b) => (TIER_RANK[b] ?? 0) - (TIER_RANK[a] ?? 0))[0];
        // 服务端 paid 快照过期判定（lifetime 无过期）
        let paidTier: UserTier | undefined = undefined;
        if (paidStatus) {
          if (paidStatus.tier === 'lifetime') {
            paidTier = 'lifetime';
          } else if (paidStatus.expiresAt && new Date(paidStatus.expiresAt) > new Date()) {
            paidTier = paidStatus.tier;
          }
        }
        const effective = resolveEffectiveTier(
          betaTier,
          [licenseTier, paidTier].filter(Boolean).sort((a, b) => (TIER_RANK[b as UserTier] ?? 0) - (TIER_RANK[a as UserTier] ?? 0))[0],
        );
        set({ effectiveTier: effective });
      },

      setLoading: (loading) => set({ loading }),

      reset: () => {
        set({ ...initialState, activeLicenses: [], myInviteCodes: [] });
      },
    }),
    {
      name: 'beta-store',
      partialize: (state) => ({
        betaProfile: state.betaProfile,
        paidStatus: state.paidStatus,
        activeLicenses: state.activeLicenses,
        myInviteCodes: state.myInviteCodes,
        effectiveTier: state.effectiveTier,
      }),
    },
  ),
);