/**
 * 费曼录音持久化 IPC — {userData}/recordings 目录读写
 * Feynman recording persistence — IPC bridge for {userData}/recordings
 *
 * @ai-context: E2 跨会话回放——录音 WAV 本地落盘（本地优先，不上传）。
 * fileName 强制安全字符 + .wav 后缀（防路径穿越）；保存前确保目录存在；
 * 读取不存在时返回 not_found 供调用方静默回退（可选增强原则）。
 * @ai-context: Local-first WAV persistence for cross-session playback.
 * File names are strictly validated to prevent path traversal; missing
 * files surface as not_found so the renderer can degrade silently.
 */
import { app } from 'electron';
import * as path from 'path';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { safeHandle } from '../ipcUtils.js';
import { logger } from '../logger.js';

/** 安全文件名：字母数字/下划线/连字符，1-80 字符（防路径穿越） */
const SAFE_NAME_RE = /^[A-Za-z0-9_-]{1,80}$/;

/** 录音根目录：{userData}/recordings */
function recordingsRoot(): string {
  return path.join(app.getPath('userData'), 'recordings');
}

/** 校验 fileName（不含扩展名，主进程统一追加 .wav） */
function isSafeStem(stem: unknown): stem is string {
  return typeof stem === 'string' && SAFE_NAME_RE.test(stem);
}

/**
 * 注册 recording:* IPC handlers（app ready 后调用一次）。
 * - recording:save   { stem, base64 } → 写 {userData}/recordings/{stem}.wav
 * - recording:load   { stem } → 读文件返回 base64（不存在 → not_found）
 * - recording:delete { stem } → 删除文件（失败静默）
 */
export function registerRecordingIpcHandlers(): void {
  // ---- 保存录音 WAV（base64 → 文件）----
  safeHandle('recording:save', async (_event, args: { stem: string; base64: string }) => {
    const stem = args?.stem;
    if (!isSafeStem(stem)) {
      throw new Error('非法的录音文件名（仅允许字母数字/下划线/连字符）');
    }
    if (typeof args?.base64 !== 'string' || args.base64.length === 0) {
      throw new Error('录音数据不能为空');
    }
    const dir = recordingsRoot();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `${stem}.wav`), Buffer.from(args.base64, 'base64'));
    return { success: true, fileName: `${stem}.wav` };
  });

  // ---- 读取录音 WAV（跨会话回放）----
  safeHandle('recording:load', async (_event, args: { stem: string }) => {
    const stem = args?.stem;
    if (!isSafeStem(stem)) {
      throw new Error('非法的录音文件名');
    }
    try {
      const data = await readFile(path.join(recordingsRoot(), `${stem}.wav`));
      return { success: true, base64: data.toString('base64') };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return { success: false, notFound: true };
      logger.warn(`[Recording] load failed: ${String(err)}`);
      return { success: false, error: 'read_failed' };
    }
  });

  // ---- 删除录音（本地缓存清理，失败静默）----
  safeHandle('recording:delete', async (_event, args: { stem: string }) => {
    const stem = args?.stem;
    if (!isSafeStem(stem)) {
      throw new Error('非法的录音文件名');
    }
    try {
      await rm(path.join(recordingsRoot(), `${stem}.wav`), { force: true });
    } catch {
      /* 删除失败静默——不阻塞 UI */
    }
    return { success: true };
  });
}
