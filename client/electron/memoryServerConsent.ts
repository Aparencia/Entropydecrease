/**
 * MCP 学习记忆服务器 · 应用内授权开关
 * MCP learning-memory server · in-app consent toggle
 *
 * @ai-context: 宪法 P2 内层防御的授权面：此前授权依赖手动创建
 * memory-server-consent 标记文件，本模块把开关搬进应用设置页。
 * 标记文件仍是唯一事实源（mcpMemoryServer 独立进程只认它），
 * 本模块仅负责读写该文件——双端语义天然一致。
 *
 * @ai-context: In-app consent toggle for the memory server. The marker file
 * remains the single source of truth; this module only reads/writes it.
 */
import { app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger.js';

const CONSENT_MARKER = 'memory-server-consent';

function markerPath(): string {
  return path.join(app.getPath('userData'), CONSENT_MARKER);
}

export function registerMemoryServerConsentHandlers(): void {
  ipcMain.handle('memory_server:get_consent', () => {
    try {
      return fs.existsSync(markerPath());
    } catch {
      return false;
    }
  });

  ipcMain.handle('memory_server:set_consent', (_event, enabled: unknown) => {
    try {
      const p = markerPath();
      if (enabled === true) {
        fs.writeFileSync(
          p,
          `用户于 ${new Date().toISOString()} 在应用设置页显式开启学习记忆接口\n`,
          'utf-8',
        );
        logger.info('[MemoryServer] consent granted via settings');
      } else {
        fs.rmSync(p, { force: true });
        logger.info('[MemoryServer] consent revoked via settings');
      }
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[MemoryServer] consent toggle failed:', message);
      return { success: false, error: message };
    }
  });
}
