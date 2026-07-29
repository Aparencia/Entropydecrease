/**
 * 渲染进程视频录制控制器
 *
 * @ai-context Path C 全程录制模式在渲染进程的执行层
 * 复用 AudioCapture 的“主进程调度 + 渲染进程执行 + IPC 回传”架构：
 * 1. 监听主进程的 video_record_do_start / video_record_do_stop 指令
 * 2. 通过 getUserMedia + chromeMediaSource: 'desktop' 获取桌面视频流
 * 3. MediaRecorder 编码后通过 IPC video_record_chunk 回传主进程写入磁盘
 */

// ================================================================
// 类型定义
// ================================================================

/** 录制启动参数（主进程通过 IPC 下发） */
interface RecordStartPayload {
  sourceId: string;
  options: {
    videoBitsPerSecond: number;
    frameRate: number;
  };
}

// ================================================================
// 渲染进程录制控制器
// ================================================================

export class VideoRecorderRenderer {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private recording = false;

  /**
   * 初始化：注册主进程指令监听
   * 应在应用启动时调用一次
   */
  init(): void {
    const api = window.electronAPI;
    if (!api) return;

    api.on('video_record_do_start', (...args: unknown[]) => {
      const payload = args[0] as RecordStartPayload;
      this.startRecording(payload.sourceId, payload.options).catch((err) => {
        console.error('[VideoRecorderRenderer] 启动录制失败:', err);
      });
    });

    api.on('video_record_do_stop', () => {
      this.stopRecording().catch((err) => {
        console.error('[VideoRecorderRenderer] 停止录制失败:', err);
      });
    });
  }

  /**
   * 通过 getUserMedia 获取桌面视频流并启动 MediaRecorder
   */
  async startRecording(
    sourceId: string,
    options: { videoBitsPerSecond?: number; frameRate?: number },
  ): Promise<void> {
    if (this.recording) return;

    const api = window.electronAPI;
    if (!api) throw new Error('electronAPI 不可用');

    try {
      // Electron 桌面捕获：chromeMediaSource: 'desktop' + 指定 sourceId
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          // @ts-expect-error -- Electron 扩展的非标准约束
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxFrameRate: options.frameRate ?? 15,
          },
        },
      });

      const mimeType = this.resolveSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: options.videoBitsPerSecond ?? 500_000,
      });

      // 每 5 秒分片回传主进程
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size === 0) return;
        event.data.arrayBuffer().then((buffer) => {
          api.send('video_record_chunk', buffer);
        }).catch(() => { /* chunk 序列化失败静默跳过 */ });
      };

      this.mediaRecorder.onerror = (event: Event) => {
        const message = (event as ErrorEvent).message || 'MediaRecorder 未知错误';
        console.error('[VideoRecorderRenderer] MediaRecorder 错误:', message);
        api.send('video_record_error', { message });
      };

      this.mediaRecorder.start(5000);
      this.recording = true;
      api.send('video_record_started');
    } catch (err) {
      this.cleanupStream();
      throw err;
    }
  }

  /** 停止录制并释放媒体流 */
  async stopRecording(): Promise<void> {
    if (!this.recording) return;

    const api = window.electronAPI;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // 请求最后一个数据块
      this.mediaRecorder.stop();
      // 等待 ondataavailable 触发完毕
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }

    this.cleanupStream();
    this.mediaRecorder = null;
    this.recording = false;

    api?.send('video_record_stopped');
  }

  /** 销毁控制器，释放资源 */
  dispose(): void {
    if (this.recording) {
      this.stopRecording().catch(() => {});
    }
  }

  // ================================================================
  // 私有方法
  // ================================================================

  /** 释放 MediaStream 所有轨道 */
  private cleanupStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /**
   * 探测当前环境支持的最佳 WebM 编码
   * VP9 优先（压缩率高），VP8 兜底
   */
  private resolveSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    return 'video/webm';
  }
}
