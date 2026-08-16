/**
 * Electron 主进程屏幕截图采集模块
 *
 * 使用 desktopCapturer API 定时截取指定窗口画面，
 * 通过 IPC 将 PNG 数据推送到渲染进程。
 *
 * @ai-context: 定时截图采集器：desktopCapturer 抓帧、间隔可配（100ms-60s 边界校验）。
 */

import { desktopCapturer, DesktopCapturerSource } from 'electron';
import { logger } from './logger';

// ================================================================
// 类型定义
// ================================================================

/** 可捕获窗口信息 */
export interface WindowInfo {
  id: string;
  name: string;
  displayId: string;
}

/** 截图采集配置 */
export interface ScreenCaptureOptions {
  interval: number;       // 截图间隔 ms，默认 5000
  windowId?: string;      // 目标窗口 source ID
}

/** 截图帧数据（通过 IPC 传输到渲染进程） */
export interface ScreenshotFrameData {
  imageBuffer: ArrayBuffer;  // PNG 图片数据
  width: number;
  height: number;
  timestamp: number;         // 单调递增时间戳 (ms)
  sourceId: string;          // 来源 source ID
  hasChanged: boolean;       // 帧变化检测结果（false 表示与上一帧相同，可跳过）
}

// ================================================================
// 截图采集器
// ================================================================

const DEFAULT_INTERVAL = 5000;
// CL-M4: 缩略图尺寸从 1920×1080 降至 1280×720——extractFrame 内部会 resize 到
// 1280 宽，原尺寸超采 56% 内存/合成开销且无质量收益；多窗口场景每次采集
// 的全量位图分配显著下降（Electron getSources 无法按 id 过滤，缩略图
// 尺寸是每帧成本的主要杠杆）
const THUMBNAIL_SIZE = { width: 1280, height: 720 };

/** 单调递增时间戳生成器 */
let lastTimestamp = 0;
function monotonicTimestamp(): number {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return lastTimestamp;
}

export class ScreenCapture {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<Pick<ScreenCaptureOptions, 'interval'>> &
    Pick<ScreenCaptureOptions, 'windowId'>;
  private readonly onScreenshot: (data: ScreenshotFrameData) => void;
  private disposed = false;

  /** 上一帧的分块 hash 数组，用于快速判断画面是否变化 */
  private lastFrameBlockHashes: string[] = [];

  constructor(
    options: ScreenCaptureOptions,
    onScreenshot: (data: ScreenshotFrameData) => void,
  ) {
    this.options = {
      interval: options.interval || DEFAULT_INTERVAL,
      windowId: options.windowId,
    };
    this.onScreenshot = onScreenshot;
  }

  /**
   * 列出所有可捕获的窗口和屏幕源
   */
  static async listWindows(): Promise<WindowInfo[]> {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 1, height: 1 }, // 列表不需要缩略图
    });

    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      displayId: source.display_id ?? '',
    }));
  }

  /**
   * 开始定时截图采集
   */
  start(): void {
    if (this.timer !== null || this.disposed) return;

    logger.info(
      `[ScreenCapture] 开始采集, interval=${this.options.interval}ms, windowId=${this.options.windowId ?? 'auto'}`,
    );

    // 立即执行一次，然后定时执行
    this.captureAndEmit();
    this.timer = setInterval(() => {
      this.captureAndEmit();
    }, this.options.interval);
  }

  /**
   * 停止截图采集
   */
  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[ScreenCapture] 停止采集');
    }
  }

  /**
   * 单次截图（不启动定时器）
   */
  async captureOnce(): Promise<ScreenshotFrameData | null> {
    const source = await this.resolveSource();
    if (!source) {
      console.warn('[ScreenCapture] captureOnce: 未找到可用的截图源');
      return null;
    }

    return this.extractFrame(source);
  }

  /**
   * 销毁实例，释放所有资源
   */
  dispose(): void {
    this.stop();
    this.disposed = true;
    this.lastFrameBlockHashes = [];
    logger.info('[ScreenCapture] 已销毁');
  }

  // ================================================================
  // 内部方法
  // ================================================================

  /** 执行一次截图并通过回调发送 */
  private async captureAndEmit(): Promise<void> {
    try {
      const source = await this.resolveSource();
      if (!source) {
        logger.warn('[ScreenCapture] 目标窗口不可见（可能已最小化），跳过本帧');
        return;
      }

      const frame = this.extractFrame(source);
      if (frame) {
        this.onScreenshot(frame);
      }
    } catch (error) {
      logger.error('[ScreenCapture] 截图失败:', error);
    }
  }

  /** 解析目标截图源 */
  private async resolveSource(): Promise<DesktopCapturerSource | null> {
    // CL-M4: 枚举与抓帧统一使用 1280×720 缩略图（extractFrame 目标分辨率），
    // 避免 1920×1080 超采样；Electron 不支持按源 id 过滤，此处保留全量枚举
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: THUMBNAIL_SIZE,
    });

    if (sources.length === 0) return null;

    // 如果指定了 windowId，按 ID 匹配
    if (this.options.windowId) {
      const matched = sources.find((s) => s.id === this.options.windowId);
      if (matched) return matched;
      console.warn(
        `[ScreenCapture] 未找到 windowId=${this.options.windowId} 的源，回退到首个屏幕源`,
      );
    }

    // 回退策略：优先选屏幕源，否则选第一个
    const screenSource = sources.find((s) => s.id.startsWith('screen:'));
    return screenSource ?? sources[0];
  }

  /** 从 DesktopCapturerSource 提取帧数据（JPEG 压缩输出，降低 AI 分析传输体积） */
  private extractFrame(source: DesktopCapturerSource): ScreenshotFrameData | null {
    const nativeImage = source.thumbnail;
    if (!nativeImage || nativeImage.isEmpty()) {
      logger.warn(`[ScreenCapture] source "${source.name}" 的缩略图为空`);
      return null;
    }

    // 缩放到 1280px 宽（多模态模型内部会缩到 672px，无需原尺寸）
    const resized = nativeImage.resize({ width: 1280 });
    // JPEG 压缩：质量 75（板书场景可后续在渲染进程按需提高）
    const jpegBuffer = resized.toJPEG(75);
    const size = resized.getSize();

    // 复制一份纯 ArrayBuffer
    const arrayBuffer = new ArrayBuffer(jpegBuffer.byteLength);
    new Uint8Array(arrayBuffer).set(jpegBuffer);

    const hasChanged = this.hasFrameChanged(arrayBuffer);

    return {
      imageBuffer: arrayBuffer,
      width: size.width,
      height: size.height,
      timestamp: monotonicTimestamp(),
      sourceId: source.id,
      hasChanged,
    };
  }

  /**
   * 基于分块采样 + hash 对比的帧变化检测（含 1px 容差）
   *
   * 将截图数据分为 8 个区域块，每块采样 ~60 字节（共约 500 字节），
   * 分别计算 hash 后对比。为过滤 1px 鼠标微动导致的误判，
   * 要求至少 2 个块同时发生变化才认为帧已变化。
   * 无论是否判定为“变化”，均更新基准 hash，防止亚阈值变化累积。
   */
  private hasFrameChanged(imageBuffer: ArrayBuffer): boolean {
    const view = new Uint8Array(imageBuffer);
    const size = view.length;
    if (size === 0) return false;

    // 分为 8 个块，每块采样 ~60 字节，总采样约 500 字节
    const BLOCK_COUNT = 8;
    const SAMPLES_PER_BLOCK = 60;
    const blockHashes: string[] = [];

    for (let b = 0; b < BLOCK_COUNT; b++) {
      const blockStart = Math.floor((size * b) / BLOCK_COUNT);
      const blockEnd = Math.floor((size * (b + 1)) / BLOCK_COUNT);
      const blockSize = blockEnd - blockStart;
      if (blockSize <= 0) {
        blockHashes.push('');
        continue;
      }

      const step = Math.max(1, Math.floor(blockSize / SAMPLES_PER_BLOCK));
      let hash = blockSize.toString(36);
      for (let i = blockStart; i < blockEnd; i += step) {
        hash += view[i].toString(16);
      }
      blockHashes.push(hash);
    }

    // 与上一帧的分块 hash 逐块对比，统计变化块数
    // 要求至少 2 个块变化才认为帧已变化（过滤 1px 鼠标微动误判）
    const MIN_CHANGED_BLOCKS = 2;
    let changedCount = 0;
    if (blockHashes.length === this.lastFrameBlockHashes.length) {
      for (let i = 0; i < blockHashes.length; i++) {
        if (blockHashes[i] !== this.lastFrameBlockHashes[i]) {
          changedCount++;
          if (changedCount >= MIN_CHANGED_BLOCKS) break; // 提前退出
        }
      }
    } else {
      // 块数不一致（首帧或尺寸变化），视为已变化
      changedCount = MIN_CHANGED_BLOCKS;
    }

    // 无论是否判定为变化，均更新基准 hash，防止亚阈值变化累积
    this.lastFrameBlockHashes = blockHashes;
    return changedCount >= MIN_CHANGED_BLOCKS;
  }
}
