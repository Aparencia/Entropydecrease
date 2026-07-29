/**
 * 异步处理流水线
 * 生产者-消费者模型，支持注册多个 Worker 并行消费数据
 *
 * @ai-context: 采集流水线：队列+Worker 调度+超时控制；processingTimeout=60s 为视觉提取长耗时设计。
 */

import type { PipelineMessage, PipelineWorker, ExtractionResult } from './captureTypes';

interface PipelineOptions {
  maxQueueSize: number;       // 队列最大长度
  batchSize: number;          // 每批处理数量
  processingTimeout: number;  // 单个 Worker 处理超时（ms）
  onResult?: (result: ExtractionResult, message: PipelineMessage) => void;
  onError?: (error: Error, message: PipelineMessage) => void;
}

const DEFAULT_OPTIONS: PipelineOptions = {
  maxQueueSize: 100,
  batchSize: 5,
  processingTimeout: 30_000,
};

export class Pipeline {
  private workers: PipelineWorker[] = [];
  private queue: PipelineMessage[] = [];
  private readonly options: PipelineOptions;
  private isProcessing = false;
  private pendingProcess = false;
  private messageId = 0;

  constructor(options: Partial<PipelineOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 注册处理 Worker
   */
  registerWorker(worker: PipelineWorker): void {
    this.workers.push(worker);
    // eslint-disable-next-line no-console -- Worker 注册日志（debug 级别，非警告）
    console.debug(`[Pipeline] Worker registered: ${worker.name} (total: ${this.workers.length})`);
  }

  /**
   * 移除 Worker
   */
  unregisterWorker(name: string): void {
    const index = this.workers.findIndex(w => w.name === name);
    if (index >= 0) {
      const worker = this.workers[index];
      worker.dispose();
      this.workers.splice(index, 1);
    }
  }

  /**
   * 向流水线推送消息（生产者调用）
   */
  push(message: PipelineMessage): boolean {
    if (this.queue.length >= this.options.maxQueueSize) {
      // eslint-disable-next-line no-console -- 队列满丢消息需警告
      console.warn(`[Pipeline] Queue full (${this.options.maxQueueSize}), dropping message: ${message.id}`);
      return false;
    }
    this.queue.push(message);
    if (this.isProcessing) {
      // 当前正在处理，标记待处理，等 finally 块调度下一轮
      this.pendingProcess = true;
    } else {
      this.processNext();
    }
    return true;
  }

  /**
   * 创建并推送消息的便捷方法
   */
  createMessage<T>(type: PipelineMessage['type'], sessionId: string, data: T): PipelineMessage<T> {
    const message: PipelineMessage<T> = {
      id: `msg-${++this.messageId}`,
      type,
      timestamp: performance.now(),
      sessionId,
      data,
    };
    return message;
  }

  /**
   * 处理队列中的下一条消息
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0 || this.workers.length === 0) {
      return;
    }

    this.isProcessing = true;
    const batch = this.queue.splice(0, this.options.batchSize);

    try {
      // 并行处理批次中的每条消息
      const promises = batch.map(msg => this.processMessage(msg));
      await Promise.allSettled(promises);
    } finally {
      this.isProcessing = false;
      // 如果队列中还有消息，或有新消息在期间被标记为 pending，继续处理
      if (this.queue.length > 0 || this.pendingProcess) {
        this.pendingProcess = false;
        // 使用 setTimeout 避免同步递归
        setTimeout(() => this.processNext(), 0);
      }
    }
  }

  /**
   * 将消息分发给能处理它的 Worker
   */
  private async processMessage(message: PipelineMessage): Promise<void> {
    const eligibleWorkers = this.workers.filter(w => w.canProcess(message));
    if (eligibleWorkers.length === 0) {
      // eslint-disable-next-line no-console -- 无 Worker 能处理该消息
      console.warn(`[Pipeline] No worker can process message type: ${message.type}`);
      return;
    }

    for (const worker of eligibleWorkers) {
      try {
        const result = await this.withTimeout(
          worker.process(message),
          this.options.processingTimeout
        );
        if (result && this.options.onResult) {
          this.options.onResult(result, message);
        }
      } catch (error) {
        // eslint-disable-next-line no-console -- Worker 处理失败需记录
        console.error(`[Pipeline] Worker "${worker.name}" failed:`, error);
        if (this.options.onError) {
          this.options.onError(error as Error, message);
        }
      }
    }
  }

  /**
   * 超时包装
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Worker timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * 获取流水线状态
   */
  getStatus(): { queueSize: number; workerCount: number; isProcessing: boolean } {
    return {
      queueSize: this.queue.length,
      workerCount: this.workers.length,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * 销毁流水线，清理所有 Worker
   */
  dispose(): void {
    this.clear();
    for (const worker of this.workers) {
      worker.dispose();
    }
    this.workers = [];
  }
}
