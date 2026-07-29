/**
 * 平台检测工具
 * 支持 Electron / PWA / Browser 三种运行环境
 *
 * @ai-context: 与 lib/env/runtimeDetect.ts 存在功能重叠（历史遗留双实现），
 * 熵减迁移期间保留两者；整合计划见阶段16，新代码优先使用 runtimeDetect。
 */

export function isElectron(): boolean {
  return !!window.electronAPI;
}

export function isDesktop(): boolean {
  return isElectron();
}

export function isPWA(): boolean {
  return !isDesktop() && window.matchMedia('(display-mode: standalone)').matches;
}

export function isBrowser(): boolean {
  return !isDesktop() && !isPWA();
}

export function getPlatform(): 'electron' | 'pwa' | 'browser' {
  if (isElectron()) return 'electron';
  if (isPWA()) return 'pwa';
  return 'browser';
}
