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
import { app } from 'electron';
import { safeHandle } from './ipcUtils.js';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from './logger.js';

const CONSENT_MARKER = 'memory-server-consent';
const ACCESS_LOG_FILE = 'memory-server-access.log';
/** 审计列表长度上限（最近 50 条，倒序） */
const ACCESS_LOG_MAX = 50;

function markerPath(): string {
  return path.join(app.getPath('userData'), CONSENT_MARKER);
}

/** 读取访问审计日志（最近 50 条，倒序；日志行格式：ISO8601 learning_memory.<tool>） */
function readAccessLog(): { entries: Array<{ at: string; tool: string }>; total: number } {
  const p = path.join(app.getPath('userData'), ACCESS_LOG_FILE);
  if (!fs.existsSync(p)) return { entries: [], total: 0 };
  const text = fs.readFileSync(p, 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries = lines.slice(-ACCESS_LOG_MAX).reverse().map((line) => {
    const idx = line.indexOf(' ');
    if (idx <= 0) return { at: line, tool: '' };
    return { at: line.slice(0, idx), tool: line.slice(idx + 1) };
  });
  return { entries, total: lines.length };
}

export function registerMemoryServerConsentHandlers(): void {
  safeHandle('memory_server:get_consent', async () => {
    try {
      return fs.existsSync(markerPath());
    } catch {
      return false;
    }
  });

  safeHandle('memory_server:set_consent', async (_event, enabled: unknown) => {
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

  // 访问审计：谁在何时读过你的记忆（计划 C2：最近 50 条）
  safeHandle('memory_server:get_access_log', async () => {
    try {
      return readAccessLog();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[MemoryServer] read access log failed:', message);
      return { entries: [], total: 0, error: message };
    }
  });

  // 宿主配置：三步引导第一步「复制配置」的素材（供 Claude Desktop 等粘贴）
  safeHandle('memory_server:get_host_config', async () => {
    return {
      command: process.execPath,
      env: { ELECTRON_RUN_AS_NODE: '1' },
      args: [path.join(__dirname, 'mcpMemoryServer.js')],
    };
  });
}
