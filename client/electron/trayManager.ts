/**
 * 系统托盘管理器
 *
 * 从 main.ts 拆分而来，负责创建系统托盘图标及右键菜单。
 *
 * @ai-context: 系统托盘：最小化到托盘/恢复/退出菜单。
 */

import { Tray, Menu, nativeImage, app } from 'electron';
import type { BrowserWindow } from 'electron';
import * as path from 'path';
import { logger } from './logger.js';

// ================================================================
// 模块级状态
// ================================================================

/** 系统托盘实例 */
let tray: Tray | null = null;

// ================================================================
// 公共 API
// ================================================================

/**
 * 创建系统托盘图标及右键菜单
 *
 * @param win - 主窗口实例，用于显示/聚焦操作
 * @param onQuit - 用户点击"退出"时的回调
 * @returns 创建的 Tray 实例
 */
export function createTray(win: BrowserWindow, onQuit: () => void): Tray {
  const iconPath = path.join(app.getAppPath(), 'app-icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);

  // 如果图标加载失败则创建 16x16 空白图标作为 fallback
  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createEmpty();
  } else {
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('熵减');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        onQuit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 双击托盘图标恢复窗口
  tray.on('double-click', () => {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
  });

  logger.info('[Tray] System tray created');
  return tray;
}

/**
 * 销毁系统托盘实例
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * 获取当前托盘实例
 */
export function getTray(): Tray | null {
  return tray;
}
