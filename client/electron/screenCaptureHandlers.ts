/**
 * 屏幕截图 & 窗口监听 IPC Handler
 *
 * @ai-context: 从 captureHandlers.ts 拆出。screen_capture_start 有
 * 500ms 防抖 + captureSessionToken 单调递增校验——stop 后残留的
 * debounce 回调经 token 比对失效，防止"停止后又自动重启采集"的竞态。
 * 窗口监听为 3s 轮询 diff（desktopCapturer 无变化事件可订阅）。
 * @ai-context: 帧数据经 sender 窗口 webContents.send 推回（非广播），
 * 窗口销毁时静默丢帧。
 */
import { BrowserWindow, desktopCapturer } from 'electron';
import { ScreenCapture } from './screenCapture.js';
import type { ScreenCaptureOptions, ScreenshotFrameData } from './screenCapture.js';
import { safeHandle, getMainWindowId } from './ipcUtils.js';
import { logger } from './logger.js';
import { scoreAndFilterWindows } from './windowScorer.js';
import { getCaptureRateScale } from './performanceMode.js';

// ================================================================
// 模块级状态
// ================================================================

/** 当前活跃的截图采集实例 */
let activeCapture: ScreenCapture | null = null;

/** screen_capture_start 防抖：500ms 内多次调用只响应最后一次 */
let startDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const START_DEBOUNCE_MS = 500;

/** 单调递增会话标识，用于防止 stop 后残留的 debounce 重启采集 */
let captureSessionToken = 0;

/** 窗口监听轮询定时器 */
let windowWatchTimer: ReturnType<typeof setInterval> | null = null;

/** 上一次窗口列表的 id 集合（用于 diff 检测变化） */
let lastWindowIds: Set<string> = new Set();

const WINDOW_WATCH_INTERVAL_MS = 3000;

/**
 * 注册屏幕截图与窗口监听相关的 IPC handler
 */
export function registerScreenCaptureHandlers(): void {
  safeHandle(
    'screen_capture_start',
    async (event, options: ScreenCaptureOptions) => {
      // 防抖：500ms 内多次调用只响应最后一次
      if (startDebounceTimer) {
        clearTimeout(startDebounceTimer);
        startDebounceTimer = null;
      }

      // 记录本次会话 token，用于 debounce 回调时校验是否仍然有效
      const token = ++captureSessionToken;

      return new Promise<{ success: boolean }>((resolve) => {
        startDebounceTimer = setTimeout(() => {
          startDebounceTimer = null;

          // 如果在 debounce 期间调用了 stop（token 已变），放弃本次启动
          if (token !== captureSessionToken) {
            logger.info('[IPC] screen_capture_start debounce 已过期（stop 后残留），跳过');
            resolve({ success: false });
            return;
          }

          // 幂等：先清理旧实例
          if (activeCapture) {
            activeCapture.dispose();
            activeCapture = null;
          }

          const senderWin = BrowserWindow.fromWebContents(event.sender);

          // 对采集参数做边界校验，防止非法值导致主进程异常
          const safeOptions = options || {};
          if (typeof safeOptions.interval === 'number' && (safeOptions.interval < 100 || safeOptions.interval > 60000)) {
            safeOptions.interval = 5000;
          }

          // 按性能模式缩放采集间隔（静谧档 scale=0.5 → 间隔翻倍、频率减半，降低开销）
          const rateScale = getCaptureRateScale();
          if (typeof safeOptions.interval === 'number' && rateScale !== 1) {
            safeOptions.interval = Math.min(60000, Math.round(safeOptions.interval / rateScale));
          }

          activeCapture = new ScreenCapture(safeOptions, (frame: ScreenshotFrameData) => {
            if (senderWin && !senderWin.isDestroyed()) {
              senderWin.webContents.send('screen_capture_frame', frame);
            }
          });

          activeCapture.start();
          logger.info('[IPC] screen_capture_start 已启动（防抖后）');
          resolve({ success: true });
        }, START_DEBOUNCE_MS);
      });
    },
  );

  safeHandle('screen_capture_stop', async () => {
    // 递增 token，使残留的 debounce 回调失效
    captureSessionToken++;

    // 清理防抖定时器
    if (startDebounceTimer) {
      clearTimeout(startDebounceTimer);
      startDebounceTimer = null;
    }

    if (activeCapture) {
      activeCapture.dispose();
      activeCapture = null;
      logger.info('[IPC] screen_capture_stop 已停止');
    }
    return { success: true };
  });

  safeHandle('screen_list_windows', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 240, height: 135 },
      });

      const rawWindows = sources.map((src) => {
        const thumb = src.thumbnail.isEmpty() ? src.thumbnail : src.thumbnail.resize({ width: 120 });
        return {
          id: src.id,
          title: src.name,
          thumbnail: thumb.toDataURL(),
        };
      });

      // 智能评分、过滤与排序
      return scoreAndFilterWindows(rawWindows);
    } catch (err) {
      logger.error('[IPC] screen_list_windows failed:', err);
      return [];
    }
  });

  // ---- 窗口变化监听（轮询） ----

  safeHandle('screen_watch_windows_start', async () => {
    if (windowWatchTimer) return { success: true }; // 已在监听

    logger.info('[IPC] 窗口监听已启动, interval=' + WINDOW_WATCH_INTERVAL_MS + 'ms');

    windowWatchTimer = setInterval(async () => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['window'],
          thumbnailSize: { width: 240, height: 135 },
        });

        const currentIds = new Set(sources.map((s) => s.id));

        // 检测是否有变化（新增或关闭窗口）
        const hasChanged =
          currentIds.size !== lastWindowIds.size ||
          [...currentIds].some((id) => !lastWindowIds.has(id));

        if (hasChanged) {
          lastWindowIds = currentIds;

          const rawWindows = sources.map((src) => {
            const thumb = src.thumbnail.isEmpty() ? src.thumbnail : src.thumbnail.resize({ width: 120 });
            return { id: src.id, title: src.name, thumbnail: thumb.toDataURL() };
          });

          const scored = scoreAndFilterWindows(rawWindows);

          // 推送到渲染进程
          const mainWindowId = getMainWindowId();
          if (mainWindowId) {
            const win = BrowserWindow.fromId(mainWindowId);
            if (win && !win.isDestroyed()) {
              win.webContents.send('screen_windows_changed', scored);
            }
          }
        }
      } catch (err) {
        logger.error('[IPC] window watch poll error:', err);
      }
    }, WINDOW_WATCH_INTERVAL_MS);

    return { success: true };
  });

  safeHandle('screen_watch_windows_stop', async () => {
    if (windowWatchTimer) {
      clearInterval(windowWatchTimer);
      windowWatchTimer = null;
      lastWindowIds = new Set();
      logger.info('[IPC] 窗口监听已停止');
    }
    return { success: true };
  });
}

/**
 * 释放屏幕截图相关资源（含防抖定时器与轮询）
 */
export function disposeScreenCaptureHandlers(): void {
  // 清理防抖定时器
  if (startDebounceTimer) {
    clearTimeout(startDebounceTimer);
    startDebounceTimer = null;
  }
  if (windowWatchTimer) {
    clearInterval(windowWatchTimer);
    windowWatchTimer = null;
    lastWindowIds = new Set();
  }
  if (activeCapture) {
    activeCapture.dispose();
    activeCapture = null;
  }
}
