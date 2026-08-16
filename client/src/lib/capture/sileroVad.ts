/**
 * 渲染进程 Silero VAD 概率源（P0-2）
 *
 * @ai-context: 封装主进程 vad_silero_process IPC：把采集的 PCM 块异步送
 * Silero v5 推理，缓存带时间戳的概率供 VADMarker 做「噪声抑制 + 静音复核」
 * 精判。加载失败/推理失败/无 Electron 环境（PWA）均静默降级为 null 概率，
 * VADMarker 回退纯 RMS 行为（本地优先优雅降级，不阻塞采集时序）。
 * @ai-context EN: Renderer-side wrapper over the main-process Silero VAD IPC.
 * Probabilities are timestamped and cached for VADMarker's noise suppression
 * and silence re-check. Any failure degrades silently to null (pure RMS).
 * @ai-context: 并发保护——同一时刻最多 1 个在途请求，新块到达时若在途则
 * 合并待发（保留最新块，丢弃中间块）：VAD 概率只需最近趋势，逐块排队会
 * 造成推理滞后累积，合并策略保证概率新鲜度与 IPC 负载有界。
 */

/** Silero 概率源接口（可注入 mock 供单测） */
export interface SileroProbSource {
  /** 最近一次推理得到的语音概率（0-1）；尚无结果或不可用时为 null */
  latestProb(): number | null;
  /** 最近 windowMs 毫秒内的平均概率；窗口内无结果时为 null */
  recentProb(windowMs: number): number | null;
  /** 推送 PCM 块（16kHz 单声道 Float32）；内部节流与合并 */
  push(pcm: Float32Array): void;
  /** 重置流状态（新会话开始时调用） */
  reset(): void;
  /** 释放资源（停止采集时调用） */
  dispose(): void;
}

interface ProbRecord {
  timestamp: number;
  probability: number;
}

/** 概率缓存窗口上限（记录 5 分钟，超期清理，防长课无界累积） */
const PROB_WINDOW_MS = 5 * 60 * 1000;

/** IPC Silero 概率源实现 */
export class IpcSileroVad implements SileroProbSource {
  private records: ProbRecord[] = [];
  private unavailable = false;
  private inFlight = false;
  private pending: Float32Array | null = null;
  private disposed = false;

  latestProb(): number | null {
    return this.records.length > 0
      ? this.records[this.records.length - 1].probability
      : null;
  }

  recentProb(windowMs: number): number | null {
    const now = Date.now();
    const cutoff = now - windowMs;
    const windowed = this.records.filter((r) => r.timestamp >= cutoff);
    if (windowed.length === 0) return null;
    const sum = windowed.reduce((acc, r) => acc + r.probability, 0);
    return sum / windowed.length;
  }

  push(pcm: Float32Array): void {
    if (this.disposed || this.unavailable || pcm.length === 0) return;
    if (!window.electronAPI) {
      this.unavailable = true;
      return;
    }
    if (this.inFlight) {
      // 合并待发：仅保留最新块（旧块丢弃，概率趋势不受影响）
      this.pending = pcm;
      return;
    }
    this.send(pcm);
  }

  reset(): void {
    this.records = [];
    this.pending = null;
    if (window.electronAPI) {
      window.electronAPI
        .vad_silero_process({ samples: new ArrayBuffer(0), reset: true })
        .catch(() => { /* 静默 */ });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.records = [];
    this.pending = null;
  }

  private async send(pcm: Float32Array): Promise<void> {
    this.inFlight = true;
    try {
      // ArrayBuffer 视图直接传输（structured clone，不经 base64）。
      // Float32Array 来源为 AudioChunkData.audioBuffer（ArrayBuffer），
      // 断言安全（audioBuffer 字段类型即 ArrayBuffer）。
      const result = await window.electronAPI!.vad_silero_process({
        samples: pcm.buffer as ArrayBuffer,
        sampleRate: 16000,
      });
      if (typeof result?.probability === 'number') {
        this.records.push({ timestamp: Date.now(), probability: result.probability });
        this.pruneRecords();
      } else if (!result?.available) {
        this.unavailable = true;
      }
    } catch {
      // 单次失败不置失效（主进程瞬时繁忙常见）；连续失败由调用侧观测
    } finally {
      this.inFlight = false;
      // 消化合并期间到达的新块
      if (this.pending && !this.disposed && !this.unavailable) {
        const next = this.pending;
        this.pending = null;
        this.send(next);
      }
    }
  }

  private pruneRecords(): void {
    const cutoff = Date.now() - PROB_WINDOW_MS;
    while (this.records.length > 0 && this.records[0].timestamp < cutoff) {
      this.records.shift();
    }
  }
}

/**
 * 创建 Silero 概率源；环境不支持（无 electronAPI）时返回 null。
 * 返回 null 表示调用方应走纯 RMS 路径。
 */
export function createSileroVad(): SileroProbSource | null {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return new IpcSileroVad();
  }
  return null;
}
