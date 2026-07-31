/**
 * @ai-context: LoginPage 回归测试——"跳过登录"必须降级到 local 模式，
 * 否则 AuthGuard 会在 hybrid/full 模式下把未登录用户弹回登录页（死循环）。
 * @ai-context: Regression test — "skip login" must downgrade to local mode,
 * otherwise AuthGuard keeps redirecting unauthenticated users back to /login.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from './LoginPage';
import { modeManager } from '@/lib/mode/ModeManager';

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({
    signIn: vi.fn().mockResolvedValue({ error: null }),
  }),
}));

describe('LoginPage - 跳过登录', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('点击"跳过登录"应将模式降级为 local，避免 AuthGuard 循环重定向', () => {
    // 模拟内测用户此前开启过云同步（hybrid 模式已持久化）
    modeManager.setMode('hybrid');

    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText(/跳过登录/));

    // 核心断言：模式必须降级，否则回到 / 会被 AuthGuard 再次踢回 /login
    expect(modeManager.getMode()).toBe('local');
  });
});
