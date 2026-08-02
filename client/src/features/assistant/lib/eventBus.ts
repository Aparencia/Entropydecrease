/**
 * 轻量应用事件总线
 *
 * @ai-context: 助手模块事件驱动核心——发布/订阅模式，无外部依赖；
 * 番茄钟、启动、空闲检测等模块通过 emit 发布事件，ProactiveEngine 订阅。
 * 纯内存实现，无持久化副作用，可安全在测试中 clear()。
 */
import type { AppEventType, TriggerContext } from '../types';

type Listener = (ctx: TriggerContext) => void;

const listeners = new Map<AppEventType, Set<Listener>>();

export const assistantEventBus = {
  on(event: AppEventType, fn: Listener): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn);
    return () => { listeners.get(event)?.delete(fn); };
  },

  emit(event: AppEventType, ctx: TriggerContext): void {
    listeners.get(event)?.forEach(fn => {
      try { fn(ctx); } catch (e) { console.error(`[EventBus] Listener error for ${event}:`, e); }
    });
  },

  clear(): void {
    listeners.clear();
  },
};
