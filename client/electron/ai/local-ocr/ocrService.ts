/**
 * 本地 OCR 服务（P2-1，主进程完整实现）
 *
 * @ai-context: 用 onnxruntime-node 运行 PP-OCRv5 det/rec 模型（RapidOCR
 * ONNX 发行版，2026-08 联调验证通过），渲染进程经 IPC `local_ocr_recognize`
 * 提交截图 PNG base64 换取文本行。模型存放 userData/ocr-models/，缺失时
 * 经 `local_ocr_download_model` 从 ModelScope 官方源下载（进度广播
 * local_ocr_download_progress）。模型缺失/加载失败 → available=false，
 * 渲染进程回退云端 VLM（本地优先优雅降级，零回归）。
 * @ai-context EN: Full local OCR service: PP-OCRv5 det/rec over
 * onnxruntime-node, PNG decoded via Electron nativeImage. Models live in
 * userData/ocr-models/ with auto-download; any failure degrades to cloud VLM.
 * @ai-context: 推理规范来源：RapidOCR/PaddleOCR 官方实现（threshold 0.3 /
 * box_thresh 0.5 / 2×2 dilation / rec 高度 48 / CTC greedy），纯函数层见
 * ocrPipeline.ts；AABB 简化了 minAreaRect+unclip，以框外扩 padding 补偿
 * （联调实测「熵减学习助手/本地OCR测试2026」识别置信度 >0.99）。
 */

import path from 'path';
import fs from 'fs';
import { createWriteStream, existsSync } from 'fs';
import { app, nativeImage, BrowserWindow } from 'electron';
import { get as httpsGet } from 'https';
import { safeHandle } from '../../ipcUtils.js';
import { IPC_CHANNELS } from '../../ipc/channels.js';
import { logger } from '../../logger.js';
import {
  resizeRgb,
  normalizeChw,
  detectBoxes,
  ctcDecode,
  DET_LIMIT_SIDE,
  REC_IMG_HEIGHT,
  type OcrBox,
} from './ocrPipeline.js';

// ================================================================
// 模型定义与路径
// ================================================================

/** OCR 模型文件与下载源（RapidOCR 官方 ONNX 发行版，ModelScope resolve） */
const OCR_MODELS = {
  det: {
    file: 'ch_PP-OCRv5_det_mobile.onnx',
    url: 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv5/det/ch_PP-OCRv5_det_mobile.onnx',
  },
  rec: {
    file: 'ch_PP-OCRv5_rec_mobile.onnx',
    url: 'https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/master/onnx/PP-OCRv5/rec/ch_PP-OCRv5_rec_mobile.onnx',
  },
  dict: {
    file: 'ppocrv5_dict.txt',
    url: 'https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/main/ppocr/utils/dict/ppocrv5_dict.txt',
  },
} as const;

const OCR_MODEL_FILES = Object.values(OCR_MODELS).map((m) => m.file);

/** 模型目录：userData/ocr-models/ */
function getOcrModelDir(): string {
  return path.join(app.getPath('userData'), 'ocr-models');
}

/** 模型文件是否齐备 */
export function isLocalOcrReady(): boolean {
  const dir = getOcrModelDir();
  return OCR_MODEL_FILES.every((f) => existsSync(path.join(dir, f)));
}

// ================================================================
// 会话与字典懒加载
// ================================================================

type OrtSession = import('onnxruntime-node').InferenceSession;

let _det: OrtSession | null = null;
let _rec: OrtSession | null = null;
/** 字符表：blank(0) + 字典行 + 空格（与 RapidOCR CTCLabelDecode 一致） */
let _character: string[] | null = null;
let _loadFailed = false;

/** 懒加载会话与字典（缺失/失败返回 false，渲染进程降级云端） */
async function ensureLoaded(): Promise<boolean> {
  if (_det && _rec && _character) return true;
  if (_loadFailed) return false;
  if (!isLocalOcrReady()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-node') as typeof import('onnxruntime-node');
    const dir = getOcrModelDir();
    _det = await ort.InferenceSession.create(path.join(dir, OCR_MODELS.det.file), { executionProviders: ['cpu'] });
    _rec = await ort.InferenceSession.create(path.join(dir, OCR_MODELS.rec.file), { executionProviders: ['cpu'] });
    const dictText = fs.readFileSync(path.join(dir, OCR_MODELS.dict.file), 'utf8');
    const dictLines = dictText.split(/\r?\n/).map((l) => l.replace(/\r$/, ''));
    _character = ['blank', ...dictLines, ' '];
    logger.info('[LocalOCR] PP-OCRv5 det/rec 会话就绪');
    return true;
  } catch (err) {
    _loadFailed = true;
    _det = null;
    _rec = null;
    _character = null;
    logger.warn(`[LocalOCR] 加载失败，回退云端 VLM: ${err}`);
    return false;
  }
}

// ================================================================
// 识别管线
// ================================================================

export interface OcrLine {
  text: string;
  /** 归一化文本框 [x0,y0,x1,y1]（0-1 比例坐标） */
  box: [number, number, number, number];
  confidence: number;
}

/** 模型下载完成后重置缓存 */
export function resetLocalOcrCache(): void {
  _det = null;
  _rec = null;
  _character = null;
  _loadFailed = false;
}

/** PNG buffer → RGB Float32Array（nativeImage 解码，含 BGRA→RGB） */
function pngToRgb(buffer: Buffer): { rgb: Float32Array; width: number; height: number } {
  const image = nativeImage.createFromBuffer(buffer);
  const size = image.getSize();
  const bitmap = image.toBitmap(); // BGRA 原始像素
  const width = size.width;
  const height = size.height;
  const rgb = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = bitmap[i * 4 + 2];       // R
    rgb[i * 3 + 1] = bitmap[i * 4 + 1];   // G
    rgb[i * 3 + 2] = bitmap[i * 4];       // B
  }
  return { rgb, width, height };
}

/** 运行一次完整识别（纯 Node 环境不可用 nativeImage，仅 Electron 主进程调用） */
async function runRecognize(imageBase64: string): Promise<OcrLine[] | null> {
  if (!(await ensureLoaded())) return null;
  const ort = require('onnxruntime-node') as typeof import('onnxruntime-node');
  try {
    const png = Buffer.from(imageBase64, 'base64');
    const { rgb, width, height } = pngToRgb(png);
    if (width <= 0 || height <= 0) return null;

    // ── det：min 边 736、32 倍数对齐 → 推理 → 框 ──
    const ratio = Math.min(width, height) < DET_LIMIT_SIDE
      ? DET_LIMIT_SIDE / Math.min(width, height)
      : 1;
    const dh = Math.max(32, Math.round((height * ratio) / 32) * 32);
    const dw = Math.max(32, Math.round((width * ratio) / 32) * 32);
    const detResized = resizeRgb(rgb, width, height, dw, dh);
    const detInput = new ort.Tensor('float32', normalizeChw(detResized, dw, dh), [1, 3, dh, dw]);
    const detOut = await _det!.run({ x: detInput });
    const pred = detOut.fetch_name_0.data as Float32Array;
    const boxes: OcrBox[] = detectBoxes(pred, dw, dh, width, height);
    if (boxes.length === 0) return [];

    // ── rec：每框裁剪（外扩补偿 unclip）→ 48 高等比 → 推理 → CTC ──
    const lines: OcrLine[] = [];
    for (const box of boxes) {
      const padX = Math.max(4, Math.round((box.x1 - box.x0) * 0.05));
      const padY = Math.max(4, Math.round((box.y1 - box.y0) * 0.15));
      const x0 = Math.max(0, box.x0 - padX);
      const y0 = Math.max(0, box.y0 - padY);
      const x1 = Math.min(width - 1, box.x1 + padX);
      const y1 = Math.min(height - 1, box.y1 + padY);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 4 || bh < 4) continue;
      const rw = Math.max(8, Math.ceil(REC_IMG_HEIGHT * bw / bh));
      // 裁剪（宽高上限保护：超长文本行截断至 512 宽，防推理超时）
      const cropW = Math.min(bw, 512);
      const crop = new Float32Array(cropW * bh * 3);
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < cropW; x++) {
          const so = ((y0 + y) * width + (x0 + x)) * 3;
          const o = (y * cropW + x) * 3;
          crop[o] = rgb[so];
          crop[o + 1] = rgb[so + 1];
          crop[o + 2] = rgb[so + 2];
        }
      }
      const recResized = resizeRgb(crop, cropW, bh, rw, REC_IMG_HEIGHT);
      const recInput = new ort.Tensor(
        'float32', normalizeChw(recResized, rw, REC_IMG_HEIGHT), [1, 3, REC_IMG_HEIGHT, rw],
      );
      const recOut = await _rec!.run({ x: recInput });
      const logits = recOut.fetch_name_0.data as Float32Array;
      const T = recOut.fetch_name_0.dims[1] as number;
      const C = recOut.fetch_name_0.dims[2] as number;
      const prob2d: Float32Array[] = [];
      for (let t = 0; t < T; t++) {
        prob2d.push(logits.subarray(t * C, (t + 1) * C));
      }
      const { text, confidence } = ctcDecode(prob2d, _character!);
      if (text.trim()) {
        lines.push({
          text,
          confidence: Math.round(confidence * 1000) / 1000,
          box: [x0 / width, y0 / height, x1 / width, y1 / height],
        });
      }
    }
    return lines;
  } catch (err) {
    logger.warn(`[LocalOCR] 识别失败，本帧回退云端 VLM: ${err}`);
    return null;
  }
}

// ================================================================
// 模型下载管理
// ================================================================

let _downloading = false;
let _downloadProgress = 0;

/** 获取下载状态（供渲染进程 UI） */
export function getLocalOcrDownloadStatus(): { downloading: boolean; progress: number } {
  return { downloading: _downloading, progress: _downloadProgress };
}

/** 广播下载进度到所有窗口 */
function broadcastOcrProgress(progress: number): void {
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('local_ocr_download_progress', { progress });
      }
    }
  } catch { /* ignore */ }
}

/** 下载单文件（跟随重定向，UA 防 CDN 403；超时 5 分钟） */
function downloadOcrFile(url: string, destPath: string, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, {
      timeout: 120000,
      headers: { 'User-Agent': 'EntropyDecrease-Desktop/1.0 (Electron)' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadOcrFile(
          res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href,
          destPath, onProgress,
        ).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] ?? '0', 10);
      let received = 0;
      const file = createWriteStream(destPath);
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (total > 0) onProgress(received / total);
      });
      res.on('error', reject);
      file.on('error', reject);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    });
    req.on('error', reject);
    req.setTimeout(300000, () => req.destroy(new Error('下载超时（5 分钟）')));
  });
}

/** 下载全部 OCR 模型（det/rec/dict 三文件，进度聚合） */
export async function downloadLocalOcrModels(): Promise<string> {
  if (_downloading) throw new Error('OCR 模型正在下载中，请等待完成');
  _downloading = true;
  _downloadProgress = 0;
  try {
    const dir = getOcrModelDir();
    fs.mkdirSync(dir, { recursive: true });
    const entries = Object.values(OCR_MODELS);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const tmpPath = path.join(dir, `${entry.file}.tmp`);
      await downloadOcrFile(entry.url, tmpPath, (fraction) => {
        _downloadProgress = Math.round(((i + fraction) / entries.length) * 100);
        broadcastOcrProgress(_downloadProgress);
      });
      // 单文件完整落盘后原子改名（防半成品被当就绪）
      fs.renameSync(tmpPath, path.join(dir, entry.file));
    }
    resetLocalOcrCache();
    logger.info(`[LocalOCR] 模型下载完成: ${dir}`);
    return dir;
  } finally {
    _downloading = false;
    _downloadProgress = 0;
  }
}

/** 删除本地 OCR 模型 */
export function deleteLocalOcrModels(): void {
  const dir = getOcrModelDir();
  if (existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    resetLocalOcrCache();
  }
}

// ================================================================
// IPC 注册
// ================================================================

/** 注册本地 OCR IPC handler（ai/index.ts 统一调用） */
export function registerLocalOcrHandlers(): void {
  safeHandle(
    IPC_CHANNELS.LOCAL_OCR_RECOGNIZE,
    async (_event, args: { imageBase64: string }) => {
      if (!args?.imageBase64) {
        return { available: false, lines: null };
      }
      const lines = await runRecognize(args.imageBase64);
      return { available: lines !== null, lines };
    },
  );

  safeHandle(
    IPC_CHANNELS.LOCAL_OCR_DOWNLOAD_MODEL,
    async () => {
      try {
        await downloadLocalOcrModels();
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  safeHandle(IPC_CHANNELS.LOCAL_OCR_STATUS, async () => {
    return {
      ready: isLocalOcrReady(),
      ...getLocalOcrDownloadStatus(),
    };
  });

  logger.info('[LocalOCR] IPC handlers registered (recognize/download/status)');
}
