/**
 * 主窗口管理器
 *
 * 从 main.ts 拆分而来，负责 BrowserWindow 创建配置
 * 及关闭行为偏好持久化。
 *
 * @ai-context: 主窗口创建与关闭策略（退出确认/最小化到托盘/退出前同步等待）。
 */

import { BrowserWindow, app, shell } from 'electron';
import * as path from 'path';
import { access, readFile, writeFile } from 'fs/promises';
import { logger } from './logger.js';
import { createTray } from './trayManager.js';

// ================================================================
// 常量
// ================================================================

const WINDOW_DEFAULT_WIDTH = 1200;
const WINDOW_DEFAULT_HEIGHT = 800;
const WINDOW_MIN_WIDTH = 600;

// ================================================================
// 关闭偏好持久化
// ================================================================

/** 缓存的关闭选择，避免在同步事件处理器中执行异步 I/O */
let cachedCloseChoice: string | null = null;

/** 退出前同步状态 */
let syncBeforeQuitRequested = false;
let syncBeforeQuitCompleted = false;

/** 同步超时保护定时器（防止渲染进程无响应导致退出卡死） */
let syncTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

/** 同步超时时间（毫秒）：渲染进程未响应则强制继续退出 */
const SYNC_BEFORE_QUIT_TIMEOUT_MS = 1500;

/** 读取保存的关闭选择 */
export async function getCloseChoice(): Promise<string | null> {
  try {
    const configPath = path.join(app.getPath('userData'), 'close-preference.json');
    try {
      await access(configPath);
    } catch {
      return null;
    }
    const data = JSON.parse(await readFile(configPath, 'utf-8'));
    cachedCloseChoice = data.choice || null;
    return cachedCloseChoice;
  } catch { /* ignore */ }
  return null;
}

/** 保存关闭选择到配置文件 */
export async function saveCloseChoice(choice: string): Promise<void> {
  try {
    const configPath = path.join(app.getPath('userData'), 'close-preference.json');
    await writeFile(configPath, JSON.stringify({ choice }), 'utf-8');
    cachedCloseChoice = choice;
  } catch { /* ignore */ }
}

// ================================================================
// 创建主窗口
// ================================================================

/**
 * 创建并返回主窗口
 *
 * @param isQuittingRef - 退出标志引用，用于区分“最小化到托盘”与“真正退出”
 * @param onQuit - 确认退出时的回调
 * @returns 创建的 BrowserWindow 实例
 */
export function createMainWindow(
  isQuittingRef: { value: boolean },
  onQuit: () => void,
): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_DEFAULT_WIDTH,
    height: WINDOW_DEFAULT_HEIGHT,
    minWidth: 800,
    minHeight: WINDOW_MIN_WIDTH,
    title: '熵减',
    frame: false,
    show: false, // 启动缓冲带：等待渲染就绪后再显示
    backgroundColor: '#0C1524', // 深海底色，防止白闪
    icon: path.join(app.getAppPath(), 'app-icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // 保证后台计时器精度
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 启动缓冲带：渲染进程首次绘制完成后显示窗口
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
    logger.info('[Window] Window shown (ready-to-show)');
  });

  // 拦截外部链接：target="_blank" 或 window.open() 统一用系统默认浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 窗口最大化状态变化时通知前端
  win.on('maximize', () => {
    win.webContents.send('window:maximized-changed', true);
  });
  win.on('unmaximize', () => {
    win.webContents.send('window:maximized-changed', false);
  });

  // 判断开发/生产模式
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // 开发模式：连接 Vite 开发服务器
    win.loadURL('http://localhost:5173');
    // 等待页面加载完成后再打开 DevTools，避免 "Runtime agent is not enabled" 错误
    win.webContents.once('did-finish-load', () => {
      win.webContents.openDevTools({ mode: 'right' });
    });
    // 诊断用：将渲染进程 console 回流到主进程日志文件（仅 dev），
    // 便于排查渲染端问题（如 ASR 静默）时无需人工复制 DevTools 输出。
    win.webContents.on('console-message', (_event, ...args: unknown[]) => {
      let message = '';
      const first = args[0];
      if (first && typeof first === 'object') {
        message = String((first as Record<string, unknown>).message ?? '');
      } else if (args.length > 1) {
        message = String(args[1]);
      }
      if (message) logger.info(`[Renderer] ${message}`);
    });
  } else {
    // 生产模式：加载打包后的 index.html
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));

    // 生产环境禁用 DevTools（防止用户打开开发人员工具）
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
    // 拦截 DevTools 快捷键
    win.webContents.on('before-input-event', (event, input) => {
      if (
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'j') ||
        (input.key === 'F12')
      ) {
        event.preventDefault();
      }
    });
  }

  // 预加载关闭偏好（异步加载，同步事件处理器使用缓存值）
  getCloseChoice(); // fire-and-forget：加载结果写入 cachedCloseChoice

  // 关闭窗口时根据用户偏好决定行为
  win.on('close', (event) => {
    if (!isQuittingRef.value) {
      event.preventDefault();
      const savedChoice = cachedCloseChoice;
      if (savedChoice === 'quit') {
        syncAndQuit(win, isQuittingRef, onQuit);
      } else if (savedChoice === 'minimize') {
        win.hide();
      } else {
        // 无记忆选择，通知前端弹出确认对话框。
        // 窗口可能处于最小化/隐藏状态（如任务栏右键「关闭窗口」），
        // 必须先恢复并聚焦，否则应用内对话框用户不可见，表现为“无法关闭”
        if (win.isMinimized()) win.restore();
        if (!win.isVisible()) win.show();
        win.focus();
        win.webContents.send('window:closing');
      }
    } else if (!syncBeforeQuitCompleted) {
      // 用户确认退出，先触发数据同步
      if (!syncBeforeQuitRequested) {
        event.preventDefault();
        syncBeforeQuitRequested = true;
        logger.info('[Window] Sync before quit: requesting renderer sync');
        win.webContents.send('sync:before-quit');
      } else {
        // 同步尚未完成，继续等待
        event.preventDefault();
      }
    }
    // syncBeforeQuitCompleted === true 时允许窗口正常关闭
  });

  // 创建系统托盘
  createTray(win, syncAndQuit.bind(null, win, isQuittingRef, onQuit));

  logger.info('[Window] Main window created');
  return win;
}

/**
 * 退出前同步流程入口
 * 立即隐藏窗口（感知零延迟），后台执行同步再真正关闭
 * 附带超时保护：若渲染进程在 SYNC_BEFORE_QUIT_TIMEOUT_MS 内未响应，强制继续退出
 */
function syncAndQuit(
  win: BrowserWindow,
  isQuittingRef: { value: boolean },
  onQuit: () => void,
): void {
  if (syncBeforeQuitRequested && !syncBeforeQuitCompleted) {
    // 同步已在进行中，等待完成（超时保护已启动）
    return;
  }
  if (syncBeforeQuitCompleted) {
    // 同步已完成，直接退出
    isQuittingRef.value = true;
    onQuit();
    return;
  }

  // ✨ 立即隐藏窗口，用户感知零延迟退出
  win.hide();

  // 后台触发同步
  syncBeforeQuitRequested = true;
  logger.info('[Window] Sync before quit: window hidden, requesting renderer sync');
  win.webContents.send('sync:before-quit');

  // 超时保护：渲染进程未响应时强制完成同步流程
  syncTimeoutTimer = setTimeout(() => {
    syncTimeoutTimer = null;
    if (!syncBeforeQuitCompleted) {
      logger.warn('[Window] Sync before quit: timeout reached, forcing quit');
      completeSyncBeforeQuit();
    }
  }, SYNC_BEFORE_QUIT_TIMEOUT_MS);
}

/**
 * 渲染进程同步完成后调用，允许窗口关闭
 * 也可由超时保护触发（渲染进程无响应时强制继续）
 */
export function completeSyncBeforeQuit(): void {
  if (syncBeforeQuitCompleted) return; // 幂等保护
  syncBeforeQuitCompleted = true;

  // 清除超时定时器（若由渲染进程正常完成）
  if (syncTimeoutTimer) {
    clearTimeout(syncTimeoutTimer);
    syncTimeoutTimer = null;
  }

  logger.info('[Window] Sync before quit: completed, proceeding with quit');
  // 直接调用 app.quit()，避免再次触发 win.close() 的 close 事件循环
  app.quit();
}
