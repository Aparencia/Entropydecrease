/**
 * 熵减 — React 运行时环境 Hook
 *
 * 提供响应式的环境检测，监听窗口大小变化等事件。
 *
 * @ai-context: 本 Hook 是 runtimeDetect 纯函数层的响应式包装（分工：纯函数可在任意上下文调用，本 Hook 仅供 React 组件）。shouldDegrade3D 是 3D 场景降级的唯一判据，改动会影响全部 3D 入口。
 */
import { useState, useEffect } from 'react';
import {
  isElectron,
  isPWA,
  isBrowser,
  isMobile as _isMobile,
  isTouchDevice,
  isWebGLSupported,
} from './runtimeDetect';

interface RuntimeEnv {
  electron: boolean;
  pwa: boolean;
  browser: boolean;
  mobile: boolean;
  touch: boolean;
  webgl: boolean;
  /** 移动端且非 Electron —— 用于 3D 场景降级判断 */
  shouldDegrade3D: boolean;
}

/**
 * 响应式运行时环境检测 Hook
 * 监听窗口 resize 事件，实时更新 mobile 状态
 */
export function useRuntimeEnv(): RuntimeEnv {
  const [mobile, setMobile] = useState(() => _isMobile());

  useEffect(() => {
    const handleResize = () => setMobile(_isMobile());
    window.addEventListener('resize', handleResize);
    // 也监听 orientationchange（移动设备旋转屏幕）
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return {
    electron: isElectron(),
    pwa: isPWA(),
    browser: isBrowser(),
    mobile,
    touch: isTouchDevice(),
    webgl: isWebGLSupported(),
    // 移动端 + 非 Electron = 降级 3D（Electron 桌面端始终保留 3D）
    shouldDegrade3D: mobile && !isElectron(),
  };
}
