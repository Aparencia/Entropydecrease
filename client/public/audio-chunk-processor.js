/**
 * AudioWorklet 音频切片处理器
 *
 * @ai-context: 替代已废弃的 ScriptProcessor（createScriptProcessor）。
 * ScriptProcessor 在主线程执行 onaudioprocess 回调，存在以下问题：
 *   1. 已被 Web Audio API 规范标记为 deprecated，未来 Chromium 版本可能移除
 *   2. 在主线程运行，音频处理耗时长时会导致掉帧/卡顿
 *   3. bufferSize 必须是 [256, 16384] 内 2 的幂，灵活性差
 *
 * AudioWorklet 优势：
 *   1. 运行在独立的 AudioWorkletGlobalScope（音频渲染线程），不阻塞主线程
 *   2. 以 128 样本为固定帧（render quantum）调用 process()，延迟更低
 *   3. 通过 MessagePort 与主线程通信，架构更清晰
 *
 * 消息协议（主线程 → worklet）：
 *   { type: 'init', targetSamples: number, sampleRate: number, channels: number, chunkDurationMs: number }
 *     - targetSamples: 每个完整音频块的目标样本数（= sampleRate * chunkDurationMs / 1000）
 *     - sampleRate / channels / chunkDurationMs: 元数据，原样回传
 *
 * 消息协议（worklet → 主线程）：
 *   { type: 'audioChunk', audioBuffer: Float32Array, sampleRate, channels, durationMs }
 *     - audioBuffer: 长度恰好为 targetSamples 的 Float32Array
 *     - 当累积样本达到 targetSamples 时立即发送，由主线程负责 IPC 转发
 */

/**
 * AudioChunkProcessor —— 在音频渲染线程中累积样本，满一个 chunk 后发回主线程
 *
 * 工作原理：
 *   AudioWorklet 以 128 样本（render quantum）为单位调用 process()。
 *   每次 process() 将输入通道的样本拷贝到 pending 缓冲区，
 *   当累积到 targetSamples 个样本时，通过 port 发送完整块给主线程。
 */
class AudioChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {number} 每个完整音频块的目标样本数 */
    this._targetSamples = 0;
    /** @type {Float32Array} 累积缓冲区 */
    this._pending = null;
    /** @type {number} 当前累积写入偏移 */
    this._pendingOffset = 0;
    /** @type {number} 采样率（回传用） */
    this._sampleRate = 0;
    /** @type {number} 通道数（回传用） */
    this._channels = 0;
    /** @type {number} 块时长毫秒（回传用） */
    this._chunkDurationMs = 0;
    /** @type {boolean} 是否已初始化 */
    this._initialized = false;

    // 监听主线程发来的初始化配置
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'init') {
        this._targetSamples = msg.targetSamples;
        this._sampleRate = msg.sampleRate;
        this._channels = msg.channels;
        this._chunkDurationMs = msg.chunkDurationMs;
        this._pending = new Float32Array(this._targetSamples);
        this._pendingOffset = 0;
        this._initialized = true;
      }
    };
  }

  /**
   * AudioWorklet 核心回调，每 128 样本调用一次
   *
   * @param {Float32Array[][]} inputs - 输入数组，inputs[0][0] 为第一个输入的第一通道
   * @param {Float32Array[][]} _outputs - 输出数组（本 processor 不产生输出）
   * @param {Object} _parameters - AudioParam 自动化数据（未使用）
   * @returns {boolean} 返回 true 保持 processor 存活
   */
  process(inputs, _outputs, _parameters) {
    // 未初始化时静默跳过（addModule 后立即调用 process，但 init 消息可能稍后到达）
    if (!this._initialized || !this._pending) {
      return true;
    }

    // 取第一个输入的第一个通道（单声道音频采集场景）
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }
    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    // 将本次 render quantum 的样本填入 pending 缓冲区
    let srcOffset = 0;
    while (srcOffset < channelData.length) {
      const take = Math.min(
        this._targetSamples - this._pendingOffset,
        channelData.length - srcOffset,
      );
      this._pending.set(
        channelData.subarray(srcOffset, srcOffset + take),
        this._pendingOffset,
      );
      this._pendingOffset += take;
      srcOffset += take;

      // 累积满一个完整块，立即发送给主线程
      if (this._pendingOffset >= this._targetSamples) {
        // 拷贝 buffer 并通过 Transferable 零拷贝传输，避免主线程与渲染线程共享内存
        const buffer = this._pending.buffer.slice(0);
        this.port.postMessage({
          type: 'audioChunk',
          audioBuffer: buffer,
          sampleRate: this._sampleRate,
          channels: this._channels,
          durationMs: this._chunkDurationMs,
        }, [buffer]); // Transferable 零拷贝传输，所有权转移给主线程
        // 重新分配缓冲区，准备下一个块
        this._pending = new Float32Array(this._targetSamples);
        this._pendingOffset = 0;
      }
    }

    // 返回 true 让 processor 持续存活，直到主线程 disconnect 时自动销毁
    return true;
  }
}

// 注册处理器，主线程通过 new AudioWorkletNode(ctx, 'audio-chunk-processor') 引用
registerProcessor('audio-chunk-processor', AudioChunkProcessor);
