/**
 * 自动更新模块
 *
 * 封装 electron-updater 的 autoUpdater，
 * 处理更新检查、下载、安装等事件，
 * 通过 IPC 将状态推送到渲染进程。
 *
 * @ai-context: electron-updater 自动更新：24h 节流检查（产品规范），下载/安装经 IPC 由用户确认。
 */
import * as electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import type { UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow, app, net } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

/** 自动检查开关（由渲染进程通过 IPC 设置，默认开启） */
let autoCheckEnabled = true;

/** 自动检查最小间隔（24 小时，毫秒） */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 上次检查更新的时间戳（持久化到 userData/update-check.json） */
let lastCheckTimestamp = 0;

/**
 * 读取持久化的上次检查时间戳
 */
async function loadLastCheckTimestamp(): Promise<number> {
  try {
    const filePath = path.join(app.getPath('userData'), 'update-check.json');
    const data = JSON.parse(await readFile(filePath, 'utf-8'));
    return typeof data.lastCheck === 'number' ? data.lastCheck : 0;
  } catch {
    return 0;
  }
}

/**
 * 将当前时间戳持久化到文件
 */
async function saveLastCheckTimestamp(): Promise<void> {
  try {
    const filePath = path.join(app.getPath('userData'), 'update-check.json');
    await writeFile(filePath, JSON.stringify({ lastCheck: Date.now() }), 'utf-8');
    lastCheckTimestamp = Date.now();
  } catch (err) {
    logger.warn(`[AutoUpdater] Failed to save last check timestamp: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 判断距上次检查是否已满 24 小时
 */
function shouldAutoCheck(): boolean {
  return Date.now() - lastCheckTimestamp >= AUTO_CHECK_INTERVAL_MS;
}

/** 检查更新超时时间（毫秒） */
const CHECK_UPDATE_TIMEOUT = 10_000;

/** 下载重试状态 */
let downloadRetryCount = 0;
const MAX_DOWNLOAD_RETRIES = 3;
const DOWNLOAD_RETRY_DELAYS = [30_000, 60_000, 120_000]; // 30s, 60s, 120s
/** 标记当前是否正在下载（用于区分 error 事件来源） */
let isDownloading = false;

/**
 * 设置自动检查开关
 * 由 main.ts 的 IPC handler 调用
 */
export function setAutoCheckEnabled(enabled: boolean): void {
  autoCheckEnabled = enabled;
  logger.info(`[AutoUpdater] Auto check ${enabled ? 'enabled' : 'disabled'}`);
}

/**
 * 带超时保护的 checkForUpdates 封装
 * 超过 CHECK_UPDATE_TIMEOUT 未响应则视为失败
 */
function checkForUpdatesWithTimeout(): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('未成功取得资源，请检查网络连接后重试'));
    }, CHECK_UPDATE_TIMEOUT);

    autoUpdater.checkForUpdates()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * 将 electron-updater 的原始错误映射为用户可读的提示。
 * 原始 message 可能包含整段 HTTP headers / 堆栈（如 latest.yml 404），
 * 不应直接透传到 UI；完整信息仍会经 logger 落盘供排查。
 */
function toFriendlyUpdateError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/latest.*\.yml/i.test(raw) || /404/.test(raw)) {
    return '更新服务暂时不可用（新版本文件尚未发布完成），请稍后再试';
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|net::ERR/i.test(raw)) {
    return '网络连接异常，请检查网络后重试';
  }
  // 兜底：截断超长原始信息，避免刷屏
  return raw.length > 100 ? `${raw.slice(0, 100)}…` : raw;
}

export function initAutoUpdater(mainWindow: BrowserWindow | null): void {
  // 开发模式下禁用自动更新
  if (!app.isPackaged) {
    logger.info('[AutoUpdater] Skipped in development mode');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('[AutoUpdater] Checking for update...');
    sendToRenderer(mainWindow, 'update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info(`[AutoUpdater] Update available: v${info.version}`);
    sendToRenderer(mainWindow, 'update-status', {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes ?? null,
    });
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('[AutoUpdater] No update available');
    sendToRenderer(mainWindow, 'update-status', { status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    sendToRenderer(mainWindow, 'update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info(`[AutoUpdater] Update downloaded: v${info.version}`);
    // 下载成功，重置重试计数
    downloadRetryCount = 0;
    isDownloading = false;
    sendToRenderer(mainWindow, 'update-status', {
      status: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    logger.error('[AutoUpdater] Error', error);

    // 下载失败时执行带退避的重试
    if (isDownloading && downloadRetryCount < MAX_DOWNLOAD_RETRIES) {
      const delay = DOWNLOAD_RETRY_DELAYS[downloadRetryCount] ?? DOWNLOAD_RETRY_DELAYS[DOWNLOAD_RETRY_DELAYS.length - 1];
      downloadRetryCount++;
      logger.warn(
        `[AutoUpdater] Download failed, retrying in ${delay / 1000}s (attempt ${downloadRetryCount}/${MAX_DOWNLOAD_RETRIES})`,
      );
      sendToRenderer(mainWindow, 'update-status', {
        status: 'downloading',
        percent: 0,
        retryIn: delay,
        retryCount: downloadRetryCount,
        maxRetries: MAX_DOWNLOAD_RETRIES,
      });
      setTimeout(() => {
        autoUpdater.downloadUpdate().catch((err) => {
          logger.error('[AutoUpdater] Retry download failed', err);
        });
      }, delay);
      return;
    }

    // 重试耗尽或非下载阶段的错误
    downloadRetryCount = 0;
    isDownloading = false;

    // 断网时静默忽略，不弹窗打扰用户
    if (!net.isOnline()) {
      logger.info('[AutoUpdater] Offline, skipping error notification');
      return;
    }

    sendToRenderer(mainWindow, 'update-status', {
      status: 'error',
      message: toFriendlyUpdateError(error),
    });
  });

  // 启动时检查更新（延迟 10 秒，等窗口加载完）
  // 加载持久化的上次检查时间戳，判断是否已满 24 小时
  loadLastCheckTimestamp().then((ts) => {
    lastCheckTimestamp = ts;
  }).finally(() => {
    setTimeout(() => {
      if (!autoCheckEnabled) return;
      // 断网时跳过检查，静默等待下次启动
      if (!net.isOnline()) {
        logger.info('[AutoUpdater] Offline, skipping auto check');
        return;
      }
      // 距上次检查不足 24 小时，跳过本次自动检查
      if (!shouldAutoCheck()) {
        const hoursLeft = Math.ceil((AUTO_CHECK_INTERVAL_MS - (Date.now() - lastCheckTimestamp)) / (60 * 60 * 1000));
        logger.info(`[AutoUpdater] Auto check skipped, next check in ~${hoursLeft} hour(s)`);
        return;
      }
      logger.info('[AutoUpdater] 24-hour interval elapsed, performing auto check');
      checkForUpdatesWithTimeout()
        .then(() => { saveLastCheckTimestamp(); })
        .catch((err: unknown) => {
          logger.error('[AutoUpdater] Initial check failed', err);
          // 失败同样写入节流时间戳：错误已提示过一次，
          // 避免服务端问题未修复期间每次启动都重复弹出同一错误
          saveLastCheckTimestamp();
          // 断网导致的失败不通知前端
          if (!net.isOnline()) return;
          sendToRenderer(mainWindow, 'update-status', {
            status: 'error',
            message: toFriendlyUpdateError(err),
          });
        });
    }, 10_000);
  });
}

/**
 * 手动检查更新（不受 7 天频率限制，始终执行）
 */
export function checkForUpdate(): void {
  checkForUpdatesWithTimeout()
    .then(() => { saveLastCheckTimestamp(); })
    .catch((err: unknown) => {
      logger.error('[AutoUpdater] Manual check failed', err);
      // 手动检查时也将超时错误通知到渲染进程
      sendToRenderer(
        BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null,
        'update-status',
        { status: 'error', message: toFriendlyUpdateError(err) },
      );
    });
}

export function downloadUpdate(): void {
  isDownloading = true;
  downloadRetryCount = 0;
  autoUpdater.downloadUpdate().catch((err) => {
    logger.error('[AutoUpdater] Download failed', err);
  });
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}

export function destroyAutoUpdater(): void {
  // 清理由（当前无定时任务，保留以便未来扩展）
}

function sendToRenderer(win: BrowserWindow | null, channel: string, data: unknown): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}
