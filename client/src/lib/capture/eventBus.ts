/**
 * 轻量级事件总线
 * 用于采集层与处理层之间的解耦通信
 *
 * @ai-context: 采集链路事件总线（渲染进程内）——CaptureManager 与 UI Hook 的唯一通信通道，事件名是跨模块契约，改名需全链路同步。
 */

type EventHandler<T = unknown> = (event: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private readonly maxListenersPerEvent = 50;

  /**
   * 注册事件监听器
   * @returns 取消注册函数
   */
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    const handlers = this.handlers.get(event)!;
    if (handlers.size >= this.maxListenersPerEvent) {
      // eslint-disable-next-line no-console -- 监听器超限警告
      console.warn(`[EventBus] Max listeners (${this.maxListenersPerEvent}) reached for event: ${event}`);
    }
    handlers.add(handler as EventHandler);

    // 返回取消注册函数
    return () => {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  /**
   * 注册一次性事件监听器
   */
  once<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    const unsubscribe = this.on<T>(event, (data) => {
      unsubscribe();
      handler(data);
    });
    return unsubscribe;
  }

  /**
   * 触发事件
   */
  emit<T = unknown>(event: string, data: T): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        // eslint-disable-next-line no-console -- 事件处理错误需记录
        console.error(`[EventBus] Error in handler for event "${event}":`, error);
      }
    }
  }

  /**
   * 移除指定事件的所有监听器
   */
  off(event: string): void {
    this.handlers.delete(event);
  }

  /**
   * 移除所有事件的所有监听器
   */
  dispose(): void {
    this.handlers.clear();
  }
}

// 全局事件总线实例
export const captureEventBus = new EventBus();
