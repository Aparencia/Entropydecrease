/**
 * 文件日志模块
 *
 * 将应用日志写入 userData/logs/ 目录，每次启动生成独立日志文件。
 * 提供 info / warn / error / crash 四个级别，crash 额外记录进程状态。
 * fs 写入失败时静默降级到 console.error。
 *
 * @ai-context: 主进程日志系统（文件流 + 控制台），crash 级别写独立崩溃日志；initLogger 须在 app ready 后调用。
 */

import { app } from 'electron';
import * as fs from 'fs';
import { mkdir } from 'fs/promises';
import * as path from 'path';

class Logger {
  private stream: fs.WriteStream | null = null;
  private initialized = false;

  /** 初始化日志目录和文件流（异步，需在 app ready 后调用） */
  async initLogger(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const logsDir = path.join(app.getPath('userData'), 'logs');
      await mkdir(logsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `app-${timestamp}.log`);
      this.stream = fs.createWriteStream(logFile, { flags: 'a' });
      this.stream.on('error', (err) => {
        console.error('[Logger] Write stream error, falling back to console:', err);
        this.stream = null;
      });
      this.stream.write(`# EntropyDecrease log started at ${new Date().toISOString()}\n`);
    } catch (err) {
      console.error('[Logger] Failed to initialize file logger:', err);
      this.stream = null;
    }
  }

  /** 同步降级：若尚未初始化则跳过文件写入，仅输出控制台 */
  private ensureInit(): void {
    // 初始化已由 initLogger() 异步完成，此处仅做安全守卫
    if (!this.initialized) {
      console.warn('[Logger] Logger not yet initialized, file output skipped');
    }
  }

  private write(level: string, message: string, extra?: string): void {
    this.ensureInit();
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${message}\n`;
    const fullLine = extra ? `${line}${extra}\n` : line;

    // 始终输出到控制台
    if (level === 'ERROR' || level === 'CRASH') {
      console.error(fullLine.trimEnd());
    } else if (level === 'WARN') {
      console.warn(fullLine.trimEnd());
    } else if (level === 'DEBUG') {
      console.debug(fullLine.trimEnd());
    } else {
      console.log(fullLine.trimEnd());
    }

    // 写入文件（失败时静默降级）
    if (this.stream) {
      try {
        this.stream.write(fullLine);
      } catch {
        // 静默降级
      }
    }
  }

  debug(msg: string): void {
    this.write('DEBUG', msg);
  }

  info(msg: string): void {
    this.write('INFO', msg);
  }

  warn(msg: string): void {
    this.write('WARN', msg);
  }

  error(msg: string, error?: unknown): void {
    const extra = error instanceof Error ? error.stack ?? '' : error ? String(error) : undefined;
    this.write('ERROR', msg, extra);
  }

  /** 严重错误：除错误信息外还记录进程状态快照 */
  crash(msg: string, error?: unknown): void {
    const parts: string[] = [];

    if (error instanceof Error) {
      parts.push(error.stack ?? error.message);
    } else if (error) {
      parts.push(String(error));
    }

    try {
      const mem = process.memoryUsage();
      parts.push(
        `--- Process State ---`,
        `pid: ${process.pid}`,
        `uptime: ${process.uptime()}s`,
        `memory: rss=${Math.round(mem.rss / 1048576)}MB heap=${Math.round(mem.heapUsed / 1048576)}/${Math.round(mem.heapTotal / 1048576)}MB`,
        `electron: ${process.versions.electron ?? 'N/A'}`,
        `node: ${process.versions.node}`,
        `platform: ${process.platform} ${process.arch}`,
      );
    } catch {
      parts.push('--- Process State: unavailable ---');
    }

    this.write('CRASH', msg, parts.join('\n'));
  }
}

export const logger = new Logger();
