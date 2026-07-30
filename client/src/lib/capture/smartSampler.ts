/**
 * 智能采样器 — Path B 轻量采集核心
 *
 * @ai-context
 * Path B 不做逐帧 AI 推理，而是通过变化检测 + 定时间隔筛选出关键帧，
 * 再用 Canvas API 压缩为 JPEG base64，大幅降低存储与传输开销。
 */

import type { ScreenshotData, KeyFrame } from './captureTypes';

// ================================================================
// 配置类型
// ================================================================

export interface SmartSamplerConfig {
  /** 变化分数阈值，高于此值视为画面切换，默认 0.08 */
  changeThreshold: number;
  /** 定时间隔兜底（ms），超过则强制抓帧，默认 15000 */
  periodicIntervalMs: number;
  /** JPEG 压缩质量 0–1，默认 0.7 */
  jpegQuality: number;
  /** 缩放后最大宽度（px），等比缩放，默认 1280 */
  maxWidth: number;
}

const DEFAULT_CONFIG: SmartSamplerConfig = {
  changeThreshold: 0.08,
  periodicIntervalMs: 15_000,
  jpegQuality: 0.7,
  maxWidth: 1280,
};

// ================================================================
// SmartSampler
// ================================================================

export class SmartSampler {
  private readonly config: SmartSamplerConfig;
  private keyframes: KeyFrame[] = [];
  private lastCaptureTime = 0;

  constructor(config?: Partial<SmartSamplerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 处理一帧截图数据
   * @returns KeyFrame 当帧满足捕获条件时；否则 null
   */
  async processFrame(frameData: ScreenshotData): Promise<KeyFrame | null> {
    const now = Date.now();
    const elapsed = now - this.lastCaptureTime;

    // 判断是否满足捕获条件：画面显著变化 或 定时间隔兜底
    const hasSignificantChange =
      frameData.hasChanged &&
      (frameData.changeScore ?? 1) >= this.config.changeThreshold;
    const periodicTrigger = elapsed >= this.config.periodicIntervalMs;

    // debug 日志：每次关键帧检测结果
    console.debug(
      '[SmartSampler] 帧检测',
      `changeScore=${frameData.changeScore ?? 'N/A'}`,
      `threshold=${this.config.changeThreshold}`,
      `hasChanged=${frameData.hasChanged}`,
      `significantChange=${hasSignificantChange}`,
      `elapsed=${elapsed}ms`,
      `periodicTrigger=${periodicTrigger}`,
    );

    if (!hasSignificantChange && !periodicTrigger) {
      console.debug('[SmartSampler] 跳过帧：未满足捕获条件');
      return null;
    }

    console.debug(
      '[SmartSampler] 捕获关键帧',
      periodicTrigger && !hasSignificantChange ? '(兜底触发)' : '(变化触发)',
    );

    const changeType: KeyFrame['changeType'] = this.classifyChange(
      frameData,
      periodicTrigger,
    );

    const imageBase64 = await this.compressToJpegBase64(frameData);

    const keyframe: KeyFrame = {
      id: crypto.randomUUID(),
      timestamp: now,
      imageBase64,
      changeType,
    };

    this.keyframes.push(keyframe);
    this.lastCaptureTime = now;
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
   * 将 PNG ArrayBuffer 压缩为 JPEG base64
   *
   * @ai-context
   * 渲染进程没有 sharp 等原生模块，使用 OffscreenCanvas + toBlob 实现
   * 硬件加速的 GPU 友好压缩，避免主线程阻塞。
   */
  private async compressToJpegBase64(frameData: ScreenshotData): Promise<string> {
    const { imageBuffer, width, height } = frameData;
    const { maxWidth, jpegQuality } = this.config;

    // 等比缩放
    const scale = width > maxWidth ? maxWidth / width : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    // PNG ArrayBuffer → ImageBitmap（零拷贝解码）
    const bitmap = await createImageBitmap(new Blob([imageBuffer], { type: 'image/png' }));

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Fallback：2D 上下文获取失败时返回空字符串，由调用方决定是否跳过
      bitmap.close();
      return '';
    }

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

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
