/**
 * 熵减 — 运行时环境检测层
 *
 * 提供 Electron / PWA / 普通浏览器 / 移动端等运行时环境判断。
 * 纯函数，无副作用，可安全在任何上下文中引用。
 *
 * @ai-context 用于 Store 层环境分支、3D 场景降级、移动端导航切换等场景。
 */

// ─── 缓存检测结果，避免重复计算 ──────────────────────────────

let _isElectron: boolean | null = null;
let _isPWA: boolean | null = null;
let _isMobile: boolean | null = null;

/**
 * 是否在 Electron 桌面端运行
 * 检测 `window.electronAPI`（由 preload 脚本注入）
 */
export function isElectron(): boolean {
  if (_isElectron === null) {
    _isElectron = !!(window as unknown as Record<string, unknown>).electronAPI;
  }
  return _isElectron;
}

/**
 * 是否以 PWA（独立应用）模式运行
 * 检测 CSS `display-mode: standalone` 媒体查询
 */
export function isPWA(): boolean {
  if (_isPWA === null) {
    _isPWA = window.matchMedia('(display-mode: standalone)').matches;
    // 监听变化（用户可以从浏览器切换到 PWA 模式）
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
      _isPWA = e.matches;
    });
  }
  return _isPWA;
}

/**
 * 是否在普通浏览器中运行（非 Electron，非 PWA）
 */
export function isBrowser(): boolean {
  return !isElectron() && !isPWA();
}

/**
 * 是否为移动设备（屏幕宽度 < 768px 或移动端 UA）
 * 注意：此值会随窗口大小变化而更新
 */
export function isMobile(): boolean {
  // 每次调用都重新检测，以响应窗口大小变化
  if (typeof window === 'undefined') return false;
  const isSmallScreen = window.innerWidth < 768;
  const isMobileUA = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
  return isSmallScreen || isMobileUA;
}

/**
 * 是否支持触摸操作
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 是否支持 WebGL（用于判断是否可以运行 3D 场景）
 *
 * 结果模块级缓存：探测会创建真实 WebGL 上下文，浏览器每页上限约 16 个，
 * 若每次渲染都重新探测会堆积上下文，触发 "Too many active WebGL contexts"
 * 并导致主 3D Canvas 被强制 Context Lost。探测完毕后主动释放上下文。
 */
let webglSupportCache: boolean | null = null;

export function isWebGLSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (webglSupportCache !== null) return webglSupportCache;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    webglSupportCache = !!(window.WebGLRenderingContext && ctx);
    // 探测完成后立即释放上下文，避免占用浏览器 WebGL 上下文配额
    if (ctx) {
      (ctx as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webglSupportCache = false;
  }
  return webglSupportCache;
}

/**
 * 获取当前运行环境的综合描述
 */
export function getRuntimeEnv() {
  return {
    electron: isElectron(),
    pwa: isPWA(),
    browser: isBrowser(),
    mobile: isMobile(),
    touch: isTouchDevice(),
    webgl: isWebGLSupported(),
  };
}
