/**
 * betaStore — effectiveTier 计算测试
 *
 * @ai-context: 覆盖 paidStatus（服务端 user_metadata.paid 快照）纳入
 * effectiveTier 计算的行为：跨设备订阅同步、过期降级、与本地激活码/内测身份取最高者。
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { useBetaStore } from './betaStore';
import type { License, PaidStatus } from '@/types/beta';

/** 构造一条本地激活码记录 */
function makeLicense(tier: License['tier'], status: License['status'] = 'active'): License {
  return {
    id: `lic-${tier}-${status}`,
    code: `ENTROPY-${tier.toUpperCase()}-AAAA-BBBB`,
    type: tier === 'lifetime' ? 'lifetime' : tier === 'pro' ? 'pro' : 'snd1',
    tier,
    status,
    machineId: 'm1',
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    syncedAt: new Date().toISOString(),
  };
}

/** 构造服务端付费快照 */
function makePaidStatus(tier: 'pro' | 'lifetime', expiresInDays?: number): PaidStatus {
  return {
    tier,
    ...(expiresInDays !== undefined
      ? { expiresAt: new Date(Date.now() + expiresInDays * 86_400_000).toISOString() }
      : {}),
    updatedAt: new Date().toISOString(),
  };
}

beforeEach(() => {
  useBetaStore.getState().reset();
});

describe('betaStore.recalcEffectiveTier', () => {
  it('服务端 paid 快照（lifetime）无本地激活码时提升 tier', () => {
    // Arrange：仅登录快照（跨设备场景，本机无激活记录）
    useBetaStore.getState().setPaidStatus(makePaidStatus('lifetime'));

    // Act
    const tier = useBetaStore.getState().effectiveTier;

    // Assert
    expect(tier).toBe('lifetime');
  });

  it('服务端 paid 快照（pro 未过期）生效', () => {
    useBetaStore.getState().setPaidStatus(makePaidStatus('pro', 30));
    expect(useBetaStore.getState().effectiveTier).toBe('pro');
  });

  it('服务端 paid 快照过期后不提升 tier', () => {
    // Arrange：已过期的 pro 快照
    useBetaStore.getState().setPaidStatus(makePaidStatus('pro', -1));
    expect(useBetaStore.getState().effectiveTier).toBe('free');
  });

  it('本地激活码 pro 优先于 paid 快照（两者同等级取本地）', () => {
    useBetaStore.getState().addLicense(makeLicense('pro'));
    expect(useBetaStore.getState().effectiveTier).toBe('pro');
  });

  it('内测 core + 本地 pro → 取 core（rank 最高者）', () => {
    useBetaStore.getState().setBetaProfile({
      id: 'p1', userId: 'u1', tier: 'core', cohort: 1,
      joinedAt: new Date().toISOString(), lifetimePro: false,
      badges: [], perksConfig: '{}',
    });
    useBetaStore.getState().addLicense(makeLicense('pro'));
    expect(useBetaStore.getState().effectiveTier).toBe('core');
  });

  it('内测 observer + 服务端 lifetime → 取 lifetime', () => {
    useBetaStore.getState().setBetaProfile({
      id: 'p2', userId: 'u1', tier: 'observer', cohort: 1,
      joinedAt: new Date().toISOString(), lifetimePro: false,
      badges: [], perksConfig: '{}',
    });
    useBetaStore.getState().setPaidStatus(makePaidStatus('lifetime'));
    expect(useBetaStore.getState().effectiveTier).toBe('lifetime');
  });

  it('失效激活码（expired）不计入付费 tier', () => {
    useBetaStore.getState().addLicense(makeLicense('pro', 'expired'));
    expect(useBetaStore.getState().effectiveTier).toBe('free');
  });
});
