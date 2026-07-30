/**
 * 运行环境判定模块导出入口
 *
 * @ai-context: 纯 re-export。环境判定用于本地优先降级——Electron 下走 IPC，
 * 浏览器/PWA 下退回 Web 能力集。
 */
export {
  isElectron,
  isPWA,
  isBrowser,
  isMobile,
  isTouchDevice,
  isWebGLSupported,
  getRuntimeEnv,
} from './runtimeDetect';

export { useRuntimeEnv } from './useRuntimeEnv';
