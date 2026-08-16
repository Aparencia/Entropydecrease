/**
 * 平台检测工具单元测试
 * Unit tests for platform detection utilities
 *
 * @ai-context: jsdom 默认既无 electronAPI 也无独立显示模式；测试通过
 * defineProperty 注入 electronAPI / matchMedia 模拟 Electron 与 PWA 环境，
 * 覆盖 isElectron/isDesktop/isPWA/isBrowser/getPlatform 的判定与优先级。
 * @ai-context: jsdom has neither electronAPI nor standalone display mode;
 * tests inject them via defineProperty to cover Electron/PWA/browser
 * detection and the desktop-first priority ordering.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isElectron, isDesktop, isPWA, isBrowser, getPlatform } from './platform';

interface MockMatchMedia {
  matches: boolean;
  media: string;
  onchange: null;
  addListener: () => void;
  removeListener: () => void;
  addEventListener: () => void;
  removeEventListener: () => void;
  dispatchEvent: () => boolean;
}

function stubMatchMedia(matches: boolean): void {
  const mock: MockMatchMedia = {
    matches,
    media: '(display-mode: standalone)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({ ...mock, media: query }),
  });
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).electronAPI;
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe('platform detection', () => {
  it('should detect browser when nothing is present', () => {
    // Arrange：默认 jsdom 无 electronAPI、无独立显示模式
    stubMatchMedia(false);
    // Act/Assert
    expect(isElectron()).toBe(false);
    expect(isDesktop()).toBe(false);
    expect(isPWA()).toBe(false);
    expect(isBrowser()).toBe(true);
    expect(getPlatform()).toBe('browser');
  });

  it('should detect PWA when display-mode is standalone', () => {
    // Arrange
    stubMatchMedia(true);
    // Act/Assert：无 electronAPI + standalone → PWA
    expect(isPWA()).toBe(true);
    expect(isBrowser()).toBe(false);
    expect(getPlatform()).toBe('pwa');
  });

  it('should detect Electron when electronAPI is present', () => {
    // Arrange：即使 standalone 为 true，Electron 优先
    stubMatchMedia(true);
    (window as unknown as Record<string, unknown>).electronAPI = { invoke: async () => undefined };
    // Act/Assert
    expect(isElectron()).toBe(true);
    expect(isDesktop()).toBe(true);
    expect(isPWA()).toBe(false);
    expect(isBrowser()).toBe(false);
    expect(getPlatform()).toBe('electron');
  });
});
