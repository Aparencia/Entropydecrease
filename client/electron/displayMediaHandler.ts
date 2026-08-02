/**
 * Electron 系统音频环回请求处理器（getDisplayMedia 桥）
 *
 * @ai-context: Windows 系统音频捕获的唯一可靠路径。Electron 30+ / Chromium 中，
 * 渲染进程用 getUserMedia({ audio: { chromeMediaSource: 'desktop' } }) 单独请求
 * 音频轨已不返回真实音频——会拿到一条恒为数字零的静音轨（RMS 0.00，不抛错），
 * 这是"监听 0 句 / 时间轴全静默"的根因。正确做法是主进程注册
 * setDisplayMediaRequestHandler 并在 callback 中返回 audio: 'loopback'，
 * 由渲染进程调用 getDisplayMedia({ video: true, audio: true }) 触发。
 * @ai-context: audio: 'loopback' 捕获系统输出混音（含本应用自身声音）；
 * 若需静音本地播放改用 'loopbackWithMute'。handler 全局唯一，重复注册会覆盖。
 *
 * @ai-context: 麦克风输入不走 displayMedia 路径，直接以 deviceId 调用
 * getUserMedia({ audio: { deviceId } }) 即可，由 MicrophoneProvider + 
 * useClassroomAudio 的 openMicrophoneStream 实现，无需本模块参与。
 */

import { session, desktopCapturer } from 'electron';
import { logger } from './logger';

/**
 * 期望捕获的视频源 ID（window:xxx / screen:xxx）。
 * 仅用于让 loopback 请求绑定到目标窗口所在屏幕；音频始终是系统混音。
 */
let preferredSourceId: string | null = null;

/** 设置本次采集期望的源 ID（由 AudioCapture.start 调用），null 表示用首个屏幕源 */
export function setPreferredDisplaySource(sourceId: string | null): void {
  preferredSourceId = sourceId;
}

/**
 * 注册 displayMedia 请求处理器（须在 app.whenReady 后调用一次）
 *
 * 渲染进程调用 navigator.mediaDevices.getDisplayMedia() 时进入此 handler，
 * 我们直接指定源并附加 loopback 音频，跳过系统选择器（无需用户二次确认）。
 */
export function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      void (async () => {
        try {
          const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 1, height: 1 },
          });
          if (sources.length === 0) {
            logger.error('[DisplayMedia] 无可用捕获源，拒绝请求');
            // 空对象表示拒绝授权（Electron 约定）
            callback({});
            return;
          }
          // 优先匹配期望源；未命中则退回首个屏幕源（屏幕源对 loopback 最稳定）
          const matched = preferredSourceId
            ? sources.find((s) => s.id === preferredSourceId)
            : undefined;
          const screenSource = sources.find((s) => s.id.startsWith('screen:'));
          const chosen = matched ?? screenSource ?? sources[0];

          logger.info(
            `[DisplayMedia] 授予捕获: source=${chosen.name} (${chosen.id}), audio=loopback`,
          );
          callback({ video: chosen, audio: 'loopback' });
        } catch (err) {
          logger.error('[DisplayMedia] 处理捕获请求失败:', err);
          callback({});
        }
      })();
    },
    // 使用应用内指定源而非 Windows 系统选择器，保持无感采集体验
    { useSystemPicker: false },
  );
  logger.info('[DisplayMedia] setDisplayMediaRequestHandler 已注册（audio: loopback）');
}
