/**
 * 平台检测与移动端能力清单（Capacitor 壳专用）
 *
 * @ai-context: 三端互斥判定——Electron（window.electronAPI）/ Capacitor 原生
 * （@capacitor/core Capacitor.isNativePlatform）/ 浏览器 PWA。capabilities 供
 * UI 门控桌面专属功能（Ollama、本地 ASR 设置、窗口捕获、标题栏等）；移动端
 * 隐藏对应入口，但不得删除桌面代码（条件渲染）。
 * @ai-context EN: three-way platform detection (Electron / Capacitor native /
 * browser-PWA) plus a capabilities list that gates desktop-only UI on mobile.
 * Desktop code must never be removed — only conditionally hidden.
 */
import { Capacitor } from '@capacitor/core';
import { isElectron, isMobile } from '@/lib/env/runtimeDetect';

/** 是否运行在 Capacitor 原生壳内（Android/iOS WebView） */
export function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false;
  return Capacitor.isNativePlatform();
}

/**
 * 移动端（非桌面）——Capacitor 与移动端 PWA 均命中
 * 用于隐藏桌面专属设置项/组件的一致性判据
 */
export function isMobileNonDesktop(): boolean {
  return isMobile() && !isElectron();
}

/**
 * 移动端能力清单（相对桌面能力的映射）：
 * - screenCapture/windowControls/fileDialog/localOllama：桌面独有，移动端无
 * - localAsr：移动端有原生 sherpa-onnx（EntropyCapturePlugin，与桌面 Node 版不同实现）
 * - cameraGallery/screenRecording/mic：移动端具备（Capacitor 插件/自定义插件）
 */
export const mobileCapabilities = {
  screenCapture: false,
  localAsr: true,
  localOllama: false,
  windowControls: false,
  fileDialog: false,
  cameraGallery: true,
  screenRecording: true,
  mic: true,
} as const;

export type MobileCapability = keyof typeof mobileCapabilities;

/**
 * 查询移动端能力（仅当运行在 Capacitor 壳内时生效；
 * 桌面/浏览器端能力由其自身实现与守卫负责，一律视为可用）
 */
export function hasCapability(cap: MobileCapability): boolean {
  if (!isCapacitor()) return true;
  return mobileCapabilities[cap];
}
