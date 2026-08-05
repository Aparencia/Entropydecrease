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
import { getCaptureRateScale, onPerformanceModeChange } from './performanceMode.js';

// ================================================================
// 模块级状态
// ================================================================

/** 当前活跃的截图采集实例 */
let activeCapture: ScreenCapture | null = null;

/** 活跃采集的原始参数（未缩放 interval），供性能模式变更后按新频率重建实例 */
let activeOptions: ScreenCaptureOptions | null = null;

/** 活跃采集的帧推送目标窗口（重启实例后保持推送不中断） */
let activeSenderWin: BrowserWindow | null = null;

/** 性能模式变更订阅的取消函数 */
let unsubscribeModeChange: (() => void) | null = null;

/** screen_capture_start 防抖：500ms 内多次调用只响应最后一次 */
let startDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const START_DEBOUNCE_MS = 500;

/**
 * 被防抖顶替的 screen_capture_start 调用的结算回调。
 * @ai-context 防抖替换旧请求时必须显式 settle 旧 Promise，否则旧调用的
 * invoke 永久 pending，渲染层若以 loading 态等待返回将永久卡死。
 */
let pendingStartResolve: ((result: { success: boolean }) => void) | null = null;

/** 单调递增会话标识，用于防止 stop 后残留的 debounce 重启采集 */
let captureSessionToken = 0;

/** 窗口监听轮询定时器 */
let windowWatchTimer: ReturnType<typeof setInterval> | null = null;

/** 上一次窗口列表的 id 集合（用于 diff 检测变化） */
let lastWindowIds: Set<string> = new Set();

const WINDOW_WATCH_INTERVAL_MS = 3000;

/** 按性能模式缩放采集间隔（静谧档 scale=0.5 → 间隔翻倍、频率减半，降低开销） */
function applyRateScale(options: ScreenCaptureOptions): ScreenCaptureOptions {
  const scaled = { ...options };
  const rateScale = getCaptureRateScale();
  if (typeof scaled.interval === 'number' && rateScale !== 1) {
    scaled.interval = Math.min(60000, Math.round(scaled.interval / rateScale));
  }
  return scaled;
}

/** 销毁旧实例并按其参数/推送目标重建采集（start 与性能模式重启共用） */
function startCaptureWith(senderWin: BrowserWindow | null, options: ScreenCaptureOptions): void {
  if (activeCapture) {
    activeCapture.dispose();
    activeCapture = null;
  }
  activeCapture = new ScreenCapture(applyRateScale(options), (frame: ScreenshotFrameData) => {
    if (senderWin && !senderWin.isDestroyed()) {
      senderWin.webContents.send('screen_capture_frame', frame);
    }
  });
  activeCapture.start();
}

/**
 * 注册屏幕截图与窗口监听相关的 IPC handler
 */
export function registerScreenCaptureHandlers(): void {
  // 性能模式变更 → 活跃采集按新频率优雅重启（即时生效，替代"等下次启动"）
  unsubscribeModeChange = onPerformanceModeChange(() => {
    if (!activeCapture || !activeOptions) return;
    const senderWin = activeSenderWin;
    const options = activeOptions;
    logger.info('[IPC] 性能模式变更，采集按新频率重启');
    startCaptureWith(senderWin, options);
  });

  safeHandle(
    'screen_capture_start',
    async (event, options: ScreenCaptureOptions) => {
      // 防抖：500ms 内多次调用只响应最后一次——先结算被顶替的旧请求，
      // 避免旧 invoke 永久 pending 卡死渲染层 loading 态
      if (startDebounceTimer) {
        clearTimeout(startDebounceTimer);
        startDebounceTimer = null;
      }
      if (pendingStartResolve) {
        pendingStartResolve({ success: false });
        pendingStartResolve = null;
      }

      // 记录本次会话 token，用于 debounce 回调时校验是否仍然有效
      const token = ++captureSessionToken;

      return new Promise<{ success: boolean }>((resolve) => {
        pendingStartResolve = resolve;
        startDebounceTimer = setTimeout(() => {
          startDebounceTimer = null;
          pendingStartResolve = null;

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

          // 记录原始参数与推送目标（供性能模式变更时重启采集）
          activeOptions = safeOptions;
          activeSenderWin = senderWin;

          startCaptureWith(senderWin, safeOptions);
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

    // CL-H1: 结算防抖中悬挂的 start Promise——若在 500ms 防抖窗口内调用
    // stop，debounce 回调永不执行，pendingStartResolve 必须在此显式 settle，
    // 否则渲染层 invoke('screen_capture_start') 永久挂起（loading 态卡死）
    if (pendingStartResolve) {
      pendingStartResolve({ success: false });
      pendingStartResolve = null;
    }

    if (activeCapture) {
      activeCapture.dispose();
      activeCapture = null;
      logger.info('[IPC] screen_capture_stop 已停止');
    }
    activeOptions = null;
    activeSenderWin = null;
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
  // 注销性能模式变更订阅
  if (unsubscribeModeChange) {
    unsubscribeModeChange();
    unsubscribeModeChange = null;
  }
  // 清理防抖定时器
  if (startDebounceTimer) {
    clearTimeout(startDebounceTimer);
    startDebounceTimer = null;
  }
  // CL-H1: 应用退出路径同样需要结算悬挂的 start Promise
  if (pendingStartResolve) {
    pendingStartResolve({ success: false });
    pendingStartResolve = null;
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
  activeOptions = null;
  activeSenderWin = null;
}
