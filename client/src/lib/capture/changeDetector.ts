/**
 * 图像变化检测器
 * 基于 pixelmatch 比较相邻帧，避免重复处理相同画面
 *
 * @ai-context: 帧间变化检测纯函数，供 SmartSampler 判定关键帧。
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

interface ChangeDetectorOptions {
  threshold: number;           // 变化阈值 (0-1)，低于此值认为无变化，默认 0.05
  pixelmatchThreshold: number; // pixelmatch 像素匹配阈值，默认 0.1
}

const DEFAULT_OPTIONS: ChangeDetectorOptions = {
  threshold: 0.05,
  pixelmatchThreshold: 0.1,
};

export class ChangeDetector {
  private previousFrame: PNG | null = null;
  private readonly options: ChangeDetectorOptions;

  constructor(options: Partial<ChangeDetectorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 检测当前帧与上一帧是否有显著变化
   * @param imageBuffer PNG 格式的 ArrayBuffer
   * @returns 变化检测结果
   */
  detect(imageBuffer: ArrayBuffer): { hasChanged: boolean; changeScore: number } {
    try {
      const currentFrame = PNG.sync.read(Buffer.from(imageBuffer));

      if (!this.previousFrame) {
        this.previousFrame = currentFrame;
        return { hasChanged: true, changeScore: 1.0 };
      }

      // 尺寸不一致时视为有变化
      if (
        currentFrame.width !== this.previousFrame.width ||
        currentFrame.height !== this.previousFrame.height
      ) {
        this.previousFrame = currentFrame;
        return { hasChanged: true, changeScore: 1.0 };
      }

      const { width, height } = currentFrame;
      const diff = new PNG({ width, height });

      const numDiffPixels = pixelmatch(
        this.previousFrame.data,
        currentFrame.data,
        diff.data,
        width,
        height,
        { threshold: this.options.pixelmatchThreshold }
      );

      const totalPixels = width * height;
      const changeScore = numDiffPixels / totalPixels;

      // 更新上一帧
      this.previousFrame = currentFrame;

      return {
        hasChanged: changeScore > this.options.threshold,
        changeScore,
      };
    } catch (error) {
      // eslint-disable-next-line no-console -- 帧处理错误需记录以便调试
      console.error('[ChangeDetector] Error processing frame:', error);
      // 出错时保守认为有变化
      return { hasChanged: true, changeScore: 1.0 };
    }
  }

  /**
   * 重置状态（切换窗口或重新开始时调用）
   */
  reset(): void {
    this.previousFrame = null;
  }
}
