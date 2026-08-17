/**
 * 数字键快捷导航映射测试（H1 全局快捷键体系）
 *
 * @ai-context: 验证 0-9 全覆盖、路由唯一性、标签完整性、未知键降级。
 * English: 0-9 hotkey mapping tests — full coverage, unique routes,
 * complete labels, unknown-key fallback.
 */
import { describe, it, expect } from 'vitest';
import { HOTKEY_ROUTES, HOTKEY_LABELS, resolveHotkeyRoute, resolveHotkeyLabel } from './hotkeys';

describe('数字键快捷导航映射', () => {
  it('0-9 十键全覆盖，无遗漏', () => {
    for (let i = 0; i <= 9; i++) {
      const key = String(i);
      expect(HOTKEY_ROUTES[key], `键 ${key} 缺少路由映射`).toBeTruthy();
      expect(HOTKEY_LABELS[key], `键 ${key} 缺少标签`).toBeTruthy();
    }
    expect(Object.keys(HOTKEY_ROUTES)).toHaveLength(10);
    expect(Object.keys(HOTKEY_LABELS)).toHaveLength(10);
  });

  it('路由与标签一一对应（同键同目标）', () => {
    const expected: Array<[string, string]> = [
      ['0', '/settings'], ['1', '/'], ['2', '/classroom'], ['3', '/notes'],
      ['4', '/pomodoro'], ['5', '/feynman'], ['6', '/flashcards'],
      ['7', '/inspiration'], ['8', '/constellation'], ['9', '/upgrade'],
    ];
    for (const [key, route] of expected) {
      expect(resolveHotkeyRoute(key)).toBe(route);
    }
  });

  it('路由无重复（避免一键多模块歧义）', () => {
    const routes = Object.values(HOTKEY_ROUTES);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('未知键返回 null/空串（调用方忽略，不抛错）', () => {
    expect(resolveHotkeyRoute('x')).toBeNull();
    expect(resolveHotkeyRoute('')).toBeNull();
    expect(resolveHotkeyLabel('x')).toBe('');
  });

  it('升级充值页（9）与设置页（0）均为独立目标', () => {
    expect(resolveHotkeyRoute('9')).toBe('/upgrade');
    expect(resolveHotkeyRoute('0')).toBe('/settings');
  });
});
