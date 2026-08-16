/**
 * 帧超时保底重启看门狗（从 CaptureManager 拆出）
 * Frame-timeout watchdog, extracted from CaptureManager.
 *
 * @ai-context: 对应原 resetFrameWatchdog/stopFrameWatchdog 逻辑，逐行保持一致：
 * 收到有效帧即清零重启计数；连续 maxRestarts 次超时后停止自动恢复并通知 UI
 * （防幽灵采集循环）。isActive 由主类注入（无会话或未配置超时回调时不武装）。
 * @ai-context: Keeps the original [CaptureManager] log prefixes and restart
 * semantics so runtime observability is unchanged.
 */

/** 看门狗配置 */
export interface FrameWatchdogOptions {
  /** 帧超时毫秒数 */
  timeoutMs: number;
  /** CL-M10: 连续重启上限——超过后停止自动恢复并通知 UI（防止幽灵采集循环） */
  maxRestarts: number;
  /** 是否处于活动会话（无会话/未配置超时回调时 reset 为空操作） */
  isActive: () => boolean;
  /** 帧超时触发时的回调（通常为重启截图采集的函数） */
  onTimeout: () => void;
  /** CL-M10: 重启次数耗尽回调（通知 UI 提示用户手动处理） */
  onExhausted: () => void;
}

/** 帧超时保底重启看门狗 */
export class FrameWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** CL-M10: 帧超时连续重启计数（收到有效帧清零） */
  private restartAttempts = 0;
  private readonly timeoutMs: number;
  private readonly maxRestarts: number;
  private readonly isActive: () => boolean;
  private readonly onTimeout: () => void;
  private readonly onExhausted: () => void;

  constructor(options: FrameWatchdogOptions) {
    this.timeoutMs = options.timeoutMs;
    this.maxRestarts = options.maxRestarts;
    this.isActive = options.isActive;
    this.onTimeout = options.onTimeout;
    this.onExhausted = options.onExhausted;
  }

  /**
   * 重置帧超时计时器（每收到一帧调用）
   * 如果连续 timeoutMs 未收到帧，触发 onTimeout
   */
  reset(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    if (!this.isActive()) return;
    // CL-M10: 收到有效帧即清零重启计数（根因恢复后允许重新计数）
    this.restartAttempts = 0;
    this.timer = setTimeout(() => {
      this.timer = null;
      // CL-M10: 连续重启达到上限后停止自动恢复——若根因未恢复（窗口销毁/
      // 采集异常），原实现每 ~3.2s 无限重启（幽灵采集 + 日志刷屏 + 与用户
      // 手动停止竞争导致"停止后自动复活"）
      if (this.restartAttempts >= this.maxRestarts) {
        console.warn(
          `[CaptureManager] 帧超时连续重启 ${this.maxRestarts} 次仍未恢复，停止自动重启`,
        );
        this.stop();
        this.onExhausted();
        return;
      }
      this.restartAttempts += 1;
      // eslint-disable-next-line no-console -- 保底重启警告
      console.warn(`[CaptureManager] 帧超时 ${this.timeoutMs}ms，触发保底重启 (${this.restartAttempts}/${this.maxRestarts})`);
      this.onTimeout();
    }, this.timeoutMs);
  }

  /** 停止帧超时计时器 */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
