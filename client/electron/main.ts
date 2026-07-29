/**
 * Electron 主进程入口
 *
 * 应用生命周期管理、单实例锁、IPC handler 注册。
 * 窗口创建 → windowManager.ts
 * 托盘管理 → trayManager.ts
 * AI 网关代理 → ai/index.ts + ai/handlers/*.ts
 * 截图/音频采集 → captureHandlers.ts
 *
 * @ai-context: 2026-07 拆分——环境加载在 envLoader、CSP 在 cspPolicy、
 * db:* IPC 在 db/dbIpcHandlers、storage/backup IPC 在 storageIpcHandlers；
 * 本文件保留生命周期编排与窗口/更新/网关 IPC。启动顺序有严格依赖：
 * loadEnvironment → CSP → loadPersistedGatewayUrl → initAIModule →
 * registerAIHandlers → SQLite 初始化 → createMainWindow，调整顺序
 * 可能导致 handler 使用错误的网关 URL 或数据库未就绪。
 * @ai-context: 本文件为 AGENTS.md 标注的高风险变更区——改动可能导致
 * 应用无法启动，任何修改需完整回归启动/退出/托盘/更新流程。
 */

import { app, BrowserWindow, Menu } from 'electron';
import { safeHandle, setMainWindowId } from './ipcUtils.js';
import { logger } from './logger.js';
import { registerAIHandlers, initAIModule } from './ai/index.js';
import { loadPersistedGatewayUrl, setRuntimeGatewayUrl, gatewayUrl, isDevMode } from './ai/utils.js';
import { initAutoUpdater, checkForUpdate, downloadUpdate, installUpdate, destroyAutoUpdater, setAutoCheckEnabled } from './updater.js';
import { createMainWindow, saveCloseChoice, completeSyncBeforeQuit } from './windowManager.js';
import { destroyTray } from './trayManager.js';
import { registerCaptureHandlers, disposeCaptureHandlers } from './captureHandlers.js';
import { mcpManager } from './mcpManager.js';
import { initialize, close as closeDb } from './db/sqliteService.js';
import { initializeSchema } from './db/schema.js';
import { resolveDbPath } from './db/storageConfig.js';
import { registerMigrationHandlers } from './db/migration.js';
import { loadEnvironment } from './envLoader.js';
import { installCspPolicy } from './cspPolicy.js';
import { registerDbIpcHandlers } from './db/dbIpcHandlers.js';
import { registerStorageIpcHandlers } from './storageIpcHandlers.js';

// ================================================================
// 性能优化：启用 GPU 光栅化与零拷贝
// ================================================================
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'WebGLDraftExtensions,SharedArrayBuffer');

// Windows: ANGLE + Direct3D 11
// 注意：值必须是 'd3d11'，曾误写为 'gl' 导致 ANGLE 被锁定 OpenGL 后端，
// 引发 WEBGL_lose_context 缺失、上下文异常及渲染卡顿
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('use-angle', 'd3d11');
}

// macOS: Metal
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-metal', '1');
}

// ================================================================
// 环境变量加载（详见 envLoader.ts）
// ================================================================
loadEnvironment(__dirname);

// ================================================================
// 模块级状态
// ================================================================

/** 标记应用是否正在退出（区分"最小化到托盘"与"真正退出"） */
const isQuittingRef = { value: false };

/** 主窗口引用 */
let mainWindow: BrowserWindow | null = null;

// ================================================================
// 退出辅助
// ================================================================

/** 确认退出应用 */
function performQuit(): void {
  isQuittingRef.value = true;
  app.quit();
}

// ================================================================
// 单实例锁 — 防止重复启动导致多个后台进程
// ================================================================

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  // ================================================================
  // 应用生命周期
  // ================================================================

  process.on('uncaughtException', (error) => {
    logger.crash('Uncaught Exception', error);
  });

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.crash('Unhandled Rejection', error);
  });

  app.whenReady().then(async () => {
    // 异步初始化日志系统（创建日志目录和文件流）
    await logger.initLogger();
    logger.info('App ready');

    // SEC-005: CSP 安全策略注入（详见 cspPolicy.ts）
    installCspPolicy(isDevMode());

    // 加载持久化的 AI 网关地址（在注册 handler 之前，确保 handler 可用正确的 URL）
    await loadPersistedGatewayUrl();
    logger.info(`[AI] Gateway URL resolved: ${gatewayUrl()}`);
    // 初始化 AI 模块（加载 Ollama 配置、执行检测），须在注册 handler 之前完成
    await initAIModule();
    registerAIHandlers();
    registerCaptureHandlers();

    // v1.0.0: 初始化 SQLite 数据库
    const defaultDbPath = await resolveDbPath();
    const sqliteDb = initialize(defaultDbPath);
    initializeSchema(sqliteDb);
    logger.info('[DB] SQLite initialized and schema ready');

    // v1.0.0: 注册数据迁移 IPC handlers（IndexedDB → SQLite）
    registerMigrationHandlers(safeHandle);

    // 数据访问与存储/备份 IPC（详见 db/dbIpcHandlers.ts、storageIpcHandlers.ts）
    registerDbIpcHandlers();
    registerStorageIpcHandlers();

    // 隐藏默认 Electron 菜单栏
    Menu.setApplicationMenu(null);

    // AI 网关地址同步（渲染进程 → 主进程）
    safeHandle('ai:set-gateway-url', async (_event, url: string) => {
      // SEC: URL 白名单验证 — 仅允许受信任的域名
      const allowedDomains = ['entropydecrease.com', 'localhost', '127.0.0.1'];
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new Error('无效的网关 URL 格式');
      }
      if (!allowedDomains.some(d => parsedUrl.hostname === d || parsedUrl.hostname.endsWith('.' + d))) {
        throw new Error('不允许的网关域名');
      }
      if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
        throw new Error('生产环境必须使用 HTTPS');
      }

      await setRuntimeGatewayUrl(url);
      return { success: true };
    });

    // 通用 IPC handlers
    safeHandle('get-app-version', async () => {
      return app.getVersion();
    });

    // 创建主窗口（内部会创建托盘）
    mainWindow = createMainWindow(isQuittingRef, performQuit);

    // SEC-005: 设置主窗口 ID 以启用 IPC sender 验证
    setMainWindowId(mainWindow.webContents.id);

    initAutoUpdater(mainWindow);

    // ---- 窗口控制 IPC handlers ----
    safeHandle('window:minimize', async () => {
      if (mainWindow) mainWindow.minimize();
      return { success: true };
    });

    safeHandle('window:maximize', async () => {
      if (mainWindow) {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
      }
      return { success: true };
    });

    safeHandle('window:close', async () => {
      if (mainWindow) mainWindow.close();
      return { success: true };
    });

    safeHandle('window:isMaximized', async () => {
      return mainWindow ? mainWindow.isMaximized() : false;
    });

    safeHandle('window:close-action', async (_event, action: 'quit' | 'minimize' | 'cancel', remember: boolean) => {
      if (!mainWindow) return;

      if (remember) {
        await saveCloseChoice(action);
      }

      if (action === 'quit') {
        performQuit();
      } else if (action === 'minimize') {
        mainWindow.hide();
      }
    });

    // 更新相关 IPC handler
    safeHandle('update:check', async () => {
      checkForUpdate();
      return { success: true };
    });

    safeHandle('update:download', async () => {
      downloadUpdate();
      return { success: true };
    });

    safeHandle('update:install', async () => {
      installUpdate();
      return { success: true };
    });

    safeHandle('update:set-auto-check', async (_event, enabled: boolean) => {
      setAutoCheckEnabled(enabled);
      return { success: true };
    });

    // 退出前同步完成通知（渲染进程 → 主进程）
    safeHandle('sync:quit-complete', async () => {
      completeSyncBeforeQuit();
      return { success: true };
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow(isQuittingRef, performQuit);
        // SEC-005: macOS activate 重新创建窗口时同步更新 sender ID
        setMainWindowId(mainWindow.webContents.id);
      }
    });
  });

  // 标记应用即将退出
  app.on('before-quit', () => {
    isQuittingRef.value = true;
  });

  // 所有窗口关闭时退出应用
  app.on('window-all-closed', () => {
    logger.info('All windows closed');

    disposeCaptureHandlers();
    destroyAutoUpdater();
    destroyTray();
    closeDb();
    mainWindow = null;

    // 关闭 MCP Bridge 子进程（防止孤儿进程阻塞退出）
    mcpManager.shutdown().catch((err) => {
      logger.error('[MCP] Shutdown error during quit', err);
    }).finally(() => {
      app.quit();
    });
  });
}
