/**
 * 首潜状态持久化（localStorage）+ 旧引导 key 迁移
 *
 * @ai-context: 副作用仅限 localStorage 读写。旧 key（kb-onboarding-done /
 * kb-3d-guide-done）只读不删——保留给尚未退役的 3D 引导（P2 统一清理）。
 * @ai-context: 老用户判定不在此处（需查 IndexedDB），见 useFirstDiveStore.bootstrap。
 */
import type { FirstDiveStateV2 } from './types';

export const FIRST_DIVE_STORAGE_KEY = 'kb-onboarding-v2';

/** 旧版引导完成标记（任一存在即视为老用户，跳过 L0/L1） */
const LEGACY_KEYS = ['kb-onboarding-done', 'kb-3d-guide-done'] as const;

export const createInitialState = (): FirstDiveStateV2 => ({
  version: 1,
  stage: 'landing',
  profile: null,
  completedSteps: [],
  baselines: {},
});

/** 是否存在旧版引导完成标记 */
export function hasLegacyOnboardingMark(): boolean {
  try {
    return LEGACY_KEYS.some((k) => localStorage.getItem(k) === 'true');
  } catch {
    return false;
  }
}

/**
 * 读取首潜状态。
 * 无记录时：旧标记存在 → 直接视为 done（老用户不打扰）；否则返回初始态。
 */
export function loadFirstDiveState(): FirstDiveStateV2 {
  try {
    const raw = localStorage.getItem(FIRST_DIVE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<FirstDiveStateV2>;
      // 结构校验：字段缺失时回退默认值，保证向后兼容
      return {
        version: 1,
        stage: parsed.stage ?? 'landing',
        profile: parsed.profile ?? null,
        completedSteps: Array.isArray(parsed.completedSteps) ? parsed.completedSteps : [],
        baselines: parsed.baselines ?? {},
      };
    }
    if (hasLegacyOnboardingMark()) {
      const migrated: FirstDiveStateV2 = { ...createInitialState(), stage: 'done' };
      saveFirstDiveState(migrated);
      return migrated;
    }
    return createInitialState();
  } catch {
    // localStorage 不可用（隐私模式等）时降级为已完成，避免反复弹引导
    return { ...createInitialState(), stage: 'done' };
  }
}

export function saveFirstDiveState(state: FirstDiveStateV2): void {
  try {
    localStorage.setItem(FIRST_DIVE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 写入失败静默：引导状态丢失的代价仅是重新展示
  }
}
