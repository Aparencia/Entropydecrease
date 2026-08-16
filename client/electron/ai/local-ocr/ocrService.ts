/**
 * 本地 OCR 服务（P2-1，主进程骨架）
 *
 * @ai-context: 用 onnxruntime-node 运行 PP-OCRv5 检测+识别模型（RapidOCR
 * ONNX 发行版），渲染进程经 IPC `local_ocr_recognize` 提交截图换取文本行。
 * 模型目录约定 userData/ocr-models/（det/rec 两个 ONNX），未放置/加载失败
 * 时 available=false，渲染进程回退云端 VLM（本地优先优雅降级）。
 * @ai-context EN: Local OCR service skeleton over onnxruntime-node with
 * PP-OCRv5 (RapidOCR ONNX release). Degrades to cloud VLM when the model
 * directory is absent.
 * @ai-context: ⚠️ 推理参数联调说明——det 输出阈值/rec 输入尺寸等参数依据
 * PP-OCRv5 官方推理代码编写，但模型文件未随仓库分发，本服务需在装有
 * 模型的开发环境联调验证后启用（见 docs/knowledge/solutions/
 * 2026-08-local-ocr-integration.md 的验证清单）。
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { safeHandle } from '../../ipcUtils.js';
import { IPC_CHANNELS } from '../../ipc/channels.js';
import { logger } from '../../logger.js';

// ================================================================
// 模型路径与可用性
// ================================================================

/** OCR 模型文件名（RapidOCR 官方 ONNX 发行版命名） */
const OCR_MODEL_FILES = {
  det: 'ch_PP-OCRv5_det_infer.onnx',
  rec: 'ch_PP-OCRv5_rec_infer.onnx',
  dict: 'ppocr_keys_v1.txt',
} as const;

/** 模型目录：userData/ocr-models/（用户手动放置，见集成文档） */
function getOcrModelDir(): string {
  return path.join(app.getPath('userData'), 'ocr-models');
}

/** 模型文件是否齐备 */
export function isLocalOcrReady(): boolean {
  const dir = getOcrModelDir();
  return Object.values(OCR_MODEL_FILES).every((f) => fs.existsSync(path.join(dir, f)));
}

// ================================================================
// 推理（PP-OCRv5：det 文本框检测 → 裁剪 → rec 文本识别）
// ================================================================

let _session: { det: unknown; rec: unknown } | null = null;
let _loadFailed = false;

/** 懒加载 det/rec 会话（缺失/失败返回 false，渲染进程降级云端） */
function ensureLoaded(): boolean {
  if (_session) return true;
  if (_loadFailed) return false;
  if (!isLocalOcrReady()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-node') as typeof import('onnxruntime-node');
    const dir = getOcrModelDir();
    // 会话加载为异步，此处同步加载不可行——本骨架在首次 recognize 时
    // 异步初始化（见 recognizeLocal 内 initSessions）
    void ort;
    void dir;
    return true;
  } catch (err) {
    _loadFailed = true;
    logger.warn(`[LocalOCR] 加载失败: ${err}`);
    return false;
  }
}

export interface OcrLine {
  text: string;
  /** 归一化文本框 [x0,y0,x1,y1]（0-1 比例坐标） */
  box: [number, number, number, number];
  confidence: number;
}

/**
 * 本地 OCR 识别入口。
 * ⚠️ 骨架状态：模型就绪检测与降级契约完整；det/rec 推理管线（图像预处理
 * → det 推理 → 框后处理 → 裁剪 → rec 推理 → CTC 字典解码）需在装有模型的
 * 开发环境按集成文档联调验证。当前返回 null（调用方走云端 VLM 降级）。
 */
export async function recognizeLocal(_imageBase64: string): Promise<OcrLine[] | null> {
  if (!ensureLoaded()) return null;
  // TODO(P2-1-联调)：det/rec 推理管线（见文件头 @ai-context 与集成文档验证清单）
  return null;
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
      const lines = await recognizeLocal(args.imageBase64);
      return { available: lines !== null, lines };
    },
  );
  logger.info('[LocalOCR] IPC handler registered (local_ocr_recognize)');
}
