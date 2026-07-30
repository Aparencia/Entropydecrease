/**
 * 屏幕截图 & 系统音频 & 视频录制 IPC Handler — 编排入口
 *
 * @ai-context: 2026-07 拆分——屏幕截图/窗口监听在 screenCaptureHandlers、
 * 音频/视频在 mediaCaptureHandlers；本文件仅保留注册与清理编排，
 * main.ts 的调用点（registerCaptureHandlers/disposeCaptureHandlers）
 * 签名不变。
 */
import { registerScreenCaptureHandlers, disposeScreenCaptureHandlers } from './screenCaptureHandlers.js';
import { registerMediaCaptureHandlers, disposeMediaCaptureHandlers } from './mediaCaptureHandlers.js';

/**
 * 注册所有截图 & 音频 & 视频相关的 IPC handler
 */
export function registerCaptureHandlers(): void {
  registerScreenCaptureHandlers();
  registerMediaCaptureHandlers();
}

/**
 * 释放所有活跃的采集实例
 */
export function disposeCaptureHandlers(): void {
  disposeScreenCaptureHandlers();
  disposeMediaCaptureHandlers();
}
