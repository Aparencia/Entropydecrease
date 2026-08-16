/**
 * 智能采样器 — Path B 轻量采集核心
 *
 * @ai-context
 * 中文：Path B 不做逐帧 AI 推理，而是通过变化检测 + 定时间隔筛选出关键帧，
 * 落帧前用感知哈希（dHash）与上一关键帧比对去重（静止画面不再被定时兜底
 * 重复采集），再用 Canvas API 压缩为 JPEG base64，大幅降低存储与传输开销。
 * English: Path B skips per-frame AI inference; keyframes are selected via
 * change detection + periodic fallback, deduplicated against the last
 * captured keyframe using a perceptual dHash before compression, then
 * JPEG-encoded via Canvas API to cut storage/transfer cost.
 */

import type { ScreenshotData, KeyFrame } from './captureTypes';
import { computeFrameHash, hammingDistance, isSimilar } from './frameHash';

// ================================================================
// 配置类型
// ================================================================

export interface SmartSamplerConfig {
  /** 变化分数阈值，高于此值视为画面切换，默认 0.12 */
  changeThreshold: number;
  /** 定时间隔兜底（ms），超过则强制抓帧，默认 15000 */
  periodicIntervalMs: number;
  /** JPEG 压缩质量 0–1，默认 0.7 */
  jpegQuality: number;
  /** 缩放后最大宽度（px），等比缩放，默认 1280 */
  maxWidth: number;
}

const DEFAULT_CONFIG: SmartSamplerConfig = {
  changeThreshold: 0.12,
  periodicIntervalMs: 15_000,
  jpegQuality: 0.7,
  maxWidth: 1280,
};

/** 感知哈希去重阈值：与上一关键帧汉明距离 ≤ 5（64 位）视为重复帧，跳过 */
const HASH_DUP_THRESHOLD = 5;
/** 渐进板书帧（变化触发且 0 < score < 0.3）收紧阈值：距离 ≤ 2 才跳过，避免漏采渐进内容 */
const WRITING_HASH_DUP_THRESHOLD = 2;
/**
 * 内存上限：仅最近 N 个关键帧保留 imageBase64，更早的剥离为空串。
 * 单帧 base64 可达数百 KB，长时间采集（1h 约 240 帧）若无界持有会
 * 在渲染进程累积数十 MB 且不释放（仅 reset 才清空）。更早帧的图片
 * 已由 keyframe_save 增量落盘，元数据（id/timestamp/changeType）保留。
 */
const MAX_IMAGE_KEYFRAMES = 30;

// ================================================================
// SmartSampler
// ================================================================

export class SmartSampler {
  private readonly config: SmartSamplerConfig;
  private keyframes: KeyFrame[] = [];
  private lastCaptureTime = 0;
  /** 上一已捕获关键帧的感知哈希，用于帧间内容去重 */
  private lastFrameHash: bigint | null = null;
  /**
   * P1-7 强制补帧标志：指令句命中后置真，下一帧跳过变化检测门槛
   * 直接进入捕获判定（感知哈希去重仍生效，防止静止画面重复捕获）。
   * 注意：与 forceNextCapture() 方法区分（字段名不能与方法同名，实例
   * 字段会覆盖原型方法导致调用失败）。
   */
  private forceCapturePending = false;

  constructor(config?: Partial<SmartSamplerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * P1-6 运行中调整采样参数（内容分类驱动：技能类收紧采样间隔与变化阈值）
   */
  setConfig(partial: Partial<SmartSamplerConfig>): void {
    Object.assign(this.config, partial);
  }

  /** P1-7 请求一次强制补帧（下次 processFrame 无视变化检测门槛） */
  forceNextCapture(): void {
    this.forceCapturePending = true;
  }

  /**
   * 处理一帧截图数据
   * @returns KeyFrame 当帧满足捕获条件时；否则 null
   */
  async processFrame(frameData: ScreenshotData): Promise<KeyFrame | null> {
    const now = Date.now();
    const elapsed = now - this.lastCaptureTime;

    // 判断是否满足捕获条件：画面显著变化 或 定时间隔兜底 或 指令强制补帧
    const hasSignificantChange =
      frameData.hasChanged &&
      (frameData.changeScore ?? 1) >= this.config.changeThreshold;
    const periodicTrigger = elapsed >= this.config.periodicIntervalMs;
    const forcedCapture = this.forceCapturePending;
    // 消费强制标志（本次判定后无论是否捕获都复位，防连续帧全部强制）
    this.forceCapturePending = false;

    // debug 日志：每次关键帧检测结果
    console.debug(
      '[SmartSampler] 帧检测',
      `changeScore=${frameData.changeScore ?? 'N/A'}`,
      `threshold=${this.config.changeThreshold}`,
      `hasChanged=${frameData.hasChanged}`,
      `significantChange=${hasSignificantChange}`,
      `elapsed=${elapsed}ms`,
      `periodicTrigger=${periodicTrigger}`,
      `forced=${forcedCapture}`,
    );

    if (!hasSignificantChange && !periodicTrigger && !forcedCapture) {
      console.debug('[SmartSampler] 跳过帧：未满足捕获条件');
      return null;
    }

    console.debug(
      '[SmartSampler] 捕获关键帧',
      forcedCapture && !hasSignificantChange && !periodicTrigger ? '(指令补帧)' : periodicTrigger && !hasSignificantChange ? '(兜底触发)' : '(变化触发)',
    );

    const changeType: KeyFrame['changeType'] = this.classifyChange(
      frameData,
      periodicTrigger,
    );

    // 只解码一次 ImageBitmap，供感知哈希与 JPEG 压缩共用，避免重复解码
    const bitmap = await createImageBitmap(
      new Blob([frameData.imageBuffer], { type: 'image/png' }),
    );

    // 感知哈希去重：与上一已捕获关键帧比较，定时兜底触发同样走此去重
    const hash = await computeFrameHash(bitmap);
    if (hash !== null && this.lastFrameHash !== null) {
      // 渐进板书帧收紧跳过阈值，避免漏采渐进内容
      const isWritingChange = hasSignificantChange && changeType === 'writing';
      const dupThreshold = isWritingChange
        ? WRITING_HASH_DUP_THRESHOLD
        : HASH_DUP_THRESHOLD;
      if (isSimilar(hash, this.lastFrameHash, dupThreshold)) {
        console.debug(
          '[SmartSampler] 跳过帧：感知哈希重复',
          `distance=${hammingDistance(hash, this.lastFrameHash)}`,
          `dupThreshold=${dupThreshold}`,
          `writing=${isWritingChange}`,
        );
        bitmap.close();
        // 重置兜底计时，静止画面不再每帧重复触发兜底判定
        this.lastCaptureTime = now;
        return null;
      }
      console.debug(
        '[SmartSampler] 感知哈希判定为新内容',
        `distance=${hammingDistance(hash, this.lastFrameHash)}`,
      );
    }

    const imageBase64 = await this.compressToJpegBase64(bitmap, frameData);
    bitmap.close();

    const keyframe: KeyFrame = {
      id: crypto.randomUUID(),
      timestamp: now,
      imageBase64,
      changeType,
    };

    this.keyframes.push(keyframe);
    this.lastCaptureTime = now;
    if (hash !== null) this.lastFrameHash = hash;

    // 内存上限：剥离过早关键帧的 base64（已落盘），避免长时间采集内存无界增长
    this.trimOldKeyframeImages();

    return keyframe;
  }

  /** 返回所有已捕获的关键帧（只读副本） */
  getKeyframes(): KeyFrame[] {
    return [...this.keyframes];
  }

  /** 清空状态，准备下一次会话 */
  reset(): void {
    this.keyframes = [];
    this.lastCaptureTime = 0;
    this.lastFrameHash = null;
    this.forceCapturePending = false;
  }

  /**
   * 剥离过早关键帧的 imageBase64（保留元数据），将内存占用控制在
   * MAX_IMAGE_KEYFRAMES 帧以内。用新对象替换避免突变已发射的事件引用。
   */
  private trimOldKeyframeImages(): void {
    const n = this.keyframes.length;
    if (n <= MAX_IMAGE_KEYFRAMES) return;
    const cutoff = n - MAX_IMAGE_KEYFRAMES;
    for (let i = 0; i < cutoff; i++) {
      if (this.keyframes[i].imageBase64) {
        this.keyframes[i] = { ...this.keyframes[i], imageBase64: '' };
      }
    }
  }

  // ================================================================
  // 私有方法
  // ================================================================

  /**
   * 根据变化分数和触发原因分类关键帧类型
   * @ai-context 分类标签供后续分析面板区分显示（PPT 翻页 vs 板书 vs 场景切换）
   */
  private classifyChange(
    frameData: ScreenshotData,
    periodicTrigger: boolean,
  ): KeyFrame['changeType'] {
    const score = frameData.changeScore ?? 0;
    if (score >= 0.6) return 'slide_change';
    if (score >= 0.3) return 'scene_change';
    if (score > 0) return 'writing';
    // 无变化分数、仅由定时间隔触发
    void periodicTrigger;
    return 'periodic';
  }

  /**
   * 将已解码的 ImageBitmap 压缩为 JPEG base64
   *
   * @ai-context
   * 渲染进程没有 sharp 等原生模块，使用 OffscreenCanvas + toBlob 实现
   * 硬件加速的 GPU 友好压缩，避免主线程阻塞。位图由调用方解码并负责
   * close()，以便与感知哈希共用同一次解码结果。
   */
  private async compressToJpegBase64(
    bitmap: ImageBitmap,
    frameData: ScreenshotData,
  ): Promise<string> {
    const { width, height } = frameData;
    const { maxWidth, jpegQuality } = this.config;

    // 等比缩放
    const scale = width > maxWidth ? maxWidth / width : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Fallback：2D 上下文获取失败时返回空字符串，由调用方决定是否跳过
      return '';
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
    return blobToBase64(blob);
  }
}

// ================================================================
// 工具函数
// ================================================================

/** Blob → base64 字符串（不含 data:... 前缀） */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // 去掉 "data:image/jpeg;base64," 前缀
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('blobToBase64: FileReader error'));
    reader.readAsDataURL(blob);
  });
}
