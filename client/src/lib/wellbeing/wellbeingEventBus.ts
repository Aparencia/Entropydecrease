/**
 * 数字养生事件总线
 *
 * @ai-context: 专注守护灵与数字养生守门人的事件驱动核心——发布/订阅模式，
 * 仿照 assistantEventBus 实现。纯内存实现，无持久化副作用。
 */
export type WellbeingEventType =
  | 'focus:distraction-detected'
  | 'focus:level-changed'
  | 'focus:break-suggested'
  | 'wellbeing:rest-reminder'
  | 'wellbeing:eye-care'
  | 'wellbeing:stand-reminder'
  | 'wellbeing:offline-suggested'
  | 'flow:state-changed';

export interface WellbeingEventContext {
  [key: string]: unknown;
  level?: number;
  hour?: number;
  minutes?: number;
  flowState?: string;
}

type WellbeingListener = (ctx: WellbeingEventContext) => void;

const listeners = new Map<WellbeingEventType, Set<WellbeingListener>>();

export const wellbeingEventBus = {
  on(event: WellbeingEventType, fn: WellbeingListener): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(fn);
    return () => { listeners.get(event)?.delete(fn); };
  },

  emit(event: WellbeingEventType, ctx: WellbeingEventContext = {}): void {
    listeners.get(event)?.forEach(fn => {
      try { fn(ctx); } catch (e) { console.error(`[WellbeingEventBus] Listener error for ${event}:`, e); }
    });
  },

  clear(): void {
    listeners.clear();
  },
};