/**
 * 本地 ASR — 模型下载与管理（sherpa-onnx 版）
 *
 * @ai-context: 负责 sherpa-onnx ASR 模型的下载、解压、校验、删除。
 * 模型存放于 userData/asr-models/ 目录（按引擎子目录隔离）。
 * 下载源：GitHub Releases（默认）或 ModelScope 国内镜像。
 * 下载进度通过 IPC 事件 local_asr_download_progress 推送到渲染进程。
 * @ai-context: 模型包为 .tar.bz2 格式，使用 Node.js 内置 zlib + tar 解压。
 * 解压后校验关键文件是否存在（config.ts 中定义的文件列表）。
 */

import { createWriteStream, existsSync, rmSync } from 'fs';
import { mkdir } from 'fs/promises';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
import { Transform } from 'stream';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { logger } from '../../logger.js';
import {
  getModelsDir,
  getModelDir,
  getRescoreModelDir,
  isModelReady,
  isRescoreModelReady,
  ASR_MODELS,
} from './config.js';
import { resetAvailabilityCache } from './SherpaAsrService.js';
import { resetRescoreCache } from './sensevoiceRescore.js';

/** 所有出站 HTTP 请求统一携带 UA，避免 CDN 返回 403 */
const HTTP_HEADERS = { 'User-Agent': 'EntropyDecrease-Desktop/1.0 (Electron)' };

/**
 * 已废弃的旧模型目录名（仅 Paraformer 双语模型——SenseVoice 已于
 * P1-1 重新启用为重打分模型，不再清理；误清会导致重打分不可用）
 */
const OBSOLETE_MODEL_DIRS = [
  'sherpa-onnx-streaming-paraformer-bilingual-zh-en',
];

// ================================================================
// 运行时状态
// ================================================================

let _downloading: string | null = null;
let _downloadProgress = 0;

// ================================================================
// 公共 API
// ================================================================

/** 获取模型下载状态 */
export function getDownloadStatus(): { downloading: string | null; progress: number } {
  return { downloading: _downloading, progress: _downloadProgress };
}

/** 获取模型状态列表 */
export function getModelsStatus(): Array<{ engine: string; id: string; label: string; description: string; size: string; ready: boolean }> {
  return [
    {
      engine: 'streaming',
      id: ASR_MODELS.streaming.id,
      label: ASR_MODELS.streaming.label,
      description: ASR_MODELS.streaming.description,
      size: ASR_MODELS.streaming.size,
      ready: isModelReady(),
    },
    // P1-1：SenseVoice 重打分模型（可选增强，未下载不影响流式转写）
    {
      engine: 'rescore',
      id: ASR_MODELS.rescore.id,
      label: ASR_MODELS.rescore.label,
      description: ASR_MODELS.rescore.description,
      size: ASR_MODELS.rescore.size,
      ready: isRescoreModelReady(),
    },
  ];
}

/**
 * 清理已废弃的旧模型文件（Paraformer、SenseVoice），释放磁盘空间。
 * 在应用启动时或模型下载完成后调用，幂等执行。
 */
export function cleanupOldModels(): void {
  const modelsDir = getModelsDir();
  if (!existsSync(modelsDir)) return;
  let removed = 0;
  for (const dirName of OBSOLETE_MODEL_DIRS) {
    const dirPath = path.join(modelsDir, dirName);
    if (existsSync(dirPath)) {
      try {
        rmSync(dirPath, { recursive: true, force: true });
        logger.info(`[LocalASR] 已清理旧模型: ${dirName}`);
        removed++;
      } catch (err) {
        logger.warn(`[LocalASR] 清理旧模型失败 ${dirName}: ${err}`);
      }
    }
  }
  if (removed > 0) {
    resetAvailabilityCache();
    logger.info(`[LocalASR] 清理完成，共移除 ${removed} 个旧模型目录`);
  }
}

/**
 * 下载并解压模型（多源自动降级）
 *
 * 降级链：
 *   1. GitHub Releases tar.bz2 整包（全球可用）
 *   2. hf-mirror.com 逐文件下载（国内镜像）
 *   3. huggingface.co 逐文件下载（直连兜底）
 */
export async function downloadModel(engine: string): Promise<string> {
  if (_downloading) {
    throw new Error(`已有模型正在下载中（${_downloading}），请等待完成`);
  }

  // P1-1：支持 streaming（流式主引擎）与 rescore（SenseVoice 重打分）
  if (engine !== 'streaming' && engine !== 'rescore') {
    throw new Error(`不支持的引擎: ${engine}（支持 streaming / rescore）`);
  }

  const modelDef = ASR_MODELS[engine];
  const modelsDir = getModelsDir();
  const targetDir = engine === 'streaming' ? getModelDir() : getRescoreModelDir();
  const modelReady = engine === 'streaming' ? isModelReady : isRescoreModelReady;

  await mkdir(modelsDir, { recursive: true });

  _downloading = engine;
  _downloadProgress = 0;

  try {
    // ── 策略 1：GitHub Releases tar.bz2 整包 ──
    let ghError: unknown = null;
    const tmpFile = path.join(modelsDir, `${modelDef.dirName}.tar.bz2.tmp`);
    try {
      logger.info(`[LocalASR] Trying GitHub release: ${modelDef.downloadUrl}`);
      await downloadFile(modelDef.downloadUrl, tmpFile, (progress) => {
        _downloadProgress = Math.round(progress * 0.7);
        broadcastProgress(engine, _downloadProgress);
      });
      broadcastProgress(engine, 75);
      await extractTarBz2(tmpFile, modelsDir);
      try { rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
    } catch (err) {
      ghError = err;
      // 解压失败时清理残留的 tmp 文件（force: true 在文件不存在时也不抛）
      try { rmSync(tmpFile, { force: true }); } catch { /* ignore */ }
      logger.warn(`[LocalASR] GitHub failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ── 策略 2 + 3：逐文件下载（hf-mirror → huggingface 直连） ──
    if (ghError) {
      if (!modelReady()) {
        const bases = [
          modelDef.mirrorBaseUrl,                                        // hf-mirror.com
          modelDef.mirrorBaseUrl.replace('hf-mirror.com', 'huggingface.co'), // 直连兜底
        ];
        let lastErr: unknown = ghError;
        for (const base of bases) {
          try {
            await downloadFromMirror(engine, base, targetDir, modelDef);
            lastErr = null;
            break;
          } catch (mirrorErr) {
            lastErr = mirrorErr;
            logger.warn(`[LocalASR] Mirror failed (${base}): ${mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr)}`);
          }
        }
        if (lastErr) throw lastErr;
      }
    }

    // 校验关键文件
    broadcastProgress(engine, 95);
    if (!modelReady()) {
      throw new Error(`模型下载后校验失败：缺少关键文件（${modelDef.files.join(', ')}）`);
    }

    resetAvailabilityCache();
    resetRescoreCache();
    logger.info(`[LocalASR] ${engine} model ready at: ${targetDir}`);
    broadcastProgress(engine, 100);
    // 新模型下载完成后清理旧模型
    cleanupOldModels();
    return targetDir;
  } catch (err) {
    logger.error(`[LocalASR] Download failed for ${engine}: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  } finally {
    _downloading = null;
    _downloadProgress = 0;
  }
}

/** 模型定义最小结构（streaming / rescore 通用） */
interface ModelDef {
  files: readonly string[];
  downloadUrl: string;
  mirrorBaseUrl: string;
}

/**
 * 从指定 baseUrl 逐文件下载模型（无需解压）
 */
async function downloadFromMirror(
  engine: string,
  baseUrl: string,
  targetDir: string,
  modelDef: ModelDef,
): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  logger.info(`[LocalASR] Downloading ${modelDef.files.length} files from: ${baseUrl}`);

  for (let i = 0; i < modelDef.files.length; i++) {
    const file = modelDef.files[i];
    const fileUrl = `${baseUrl}/${file}`;
    const destPath = path.join(targetDir, file);

    logger.info(`[LocalASR] [${i + 1}/${modelDef.files.length}] ${fileUrl}`);
    await downloadFile(fileUrl, destPath, (fraction) => {
      const overall = Math.round(((i + fraction) / modelDef.files.length) * 90);
      _downloadProgress = overall;
      broadcastProgress(engine, overall);
    });
  }
}

/**
 * 删除模型（P1-1：支持 streaming / rescore 双引擎）
 */
export async function deleteModel(engine: string): Promise<void> {
  const modelDir = engine === 'rescore' ? getRescoreModelDir() : getModelDir();
  if (existsSync(modelDir)) {
    rmSync(modelDir, { recursive: true, force: true });
    resetAvailabilityCache();
    resetRescoreCache();
    logger.info(`[LocalASR] ${engine} model deleted: ${modelDir}`);
  }
}

// ================================================================
// 内部工具
// ================================================================

/** 广播下载进度到所有窗口 */
function broadcastProgress(engine: string, progress: number): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('local_asr_download_progress', { engine, progress });
      }
    }
  } catch { /* ignore */ }
}

/** HTTP(S) 文件下载（支持重定向，统一携带 UA，通过 Transform 流保持背压） */
function downloadFile(
  url: string,
  destPath: string,
  onProgress: (fraction: number) => void,
  maxRedirects = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const getter = url.startsWith('https') ? httpsGet : httpGet;

    const req = getter(url, { timeout: 120000, headers: HTTP_HEADERS }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        downloadFile(redirectUrl, destPath, onProgress, maxRedirects - 1)
          .then((result) => { clearTimeout(totalTimeout); resolve(result); })
          .catch((err) => { clearTimeout(totalTimeout); reject(err); });
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        clearTimeout(totalTimeout);
        reject(new Error(`Download failed: HTTP ${res.statusCode} — ${url}`));
        return;
      }

      const totalBytes = parseInt(res.headers['content-length'] ?? '0', 10);
      let receivedBytes = 0;
      let lastEmit = 0;

      const fileStream = createWriteStream(destPath);

      // 使用 Transform 流计算进度（保持背压控制）
      // 不能用 data 事件 + pipe 同时存在（破坏 pipe 的背压机制，导致内存堆积）
      const progressStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          receivedBytes += chunk.length;
          const now = Date.now();
          if (totalBytes > 0 && now - lastEmit > 500) {
            lastEmit = now;
            onProgress(receivedBytes / totalBytes);
          }
          // 无 content-length（分块传输）时跳过中间进度，
          // 完成时仍会触发 onProgress(1)，进度从 0 跳到 100%
          callback(null, chunk);
        },
      });

      progressStream.on('error', (err) => { clearTimeout(totalTimeout); reject(err); });
      fileStream.on('finish', () => {
        clearTimeout(totalTimeout);
        fileStream.close();
        onProgress(1);
        resolve();
      });
      fileStream.on('error', (err) => { clearTimeout(totalTimeout); reject(err); });
      res.on('error', (err) => { clearTimeout(totalTimeout); reject(err); });

      res.pipe(progressStream).pipe(fileStream);
    });

    req.on('error', (err) => {
      clearTimeout(totalTimeout);
      reject(err);
    });

    // 总下载超时：10 分钟无响应则终止（防止网络卡死时请求永久挂起）
    const totalTimeout = setTimeout(() => {
      req.destroy(new Error('Download timeout: 10 minutes exceeded'));
    }, 600000);
  });
}

/**
 * 解压 .tar.bz2 文件
 *
 * 使用系统 tar 命令（Windows 10+ 内置 tar.exe，macOS/Linux 原生支持）。
 * 避免引入额外 npm 依赖（tar/extract-zip 等）。
 */
async function extractTarBz2(archivePath: string, destDir: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  logger.info(`[LocalASR] Extracting: ${archivePath} → ${destDir}`);

  try {
    await execFileAsync('tar', ['-xjf', archivePath, '-C', destDir], {
      timeout: 300000, // 5 分钟超时（大模型解压较慢）
      windowsHide: true,
    });
  } catch (err) {
    throw new Error(`解压失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}
