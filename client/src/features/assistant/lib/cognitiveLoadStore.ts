/**
 * 认知负荷共享状态（1.13 A5 UI）
 * Shared cognitive load state
 *
 * @ai-context: useBehaviorSignals 每评估周期将 EMA 平滑后的负荷（0-100）写入
 * 此模块级存储；CognitiveLoadWidget 通过 useSyncExternalStore 订阅实时值。
 * 纯内存、无持久化；评估周期 30s，未评估前保持上次值（冷启动为 0）。
 */
import { useSyncExternalStore } from 'react';

let currentLoad = 0; // 0-100（cognitiveLoad.ts EMA 平滑值）
const listeners = new Set<(load: number) => void>();

/** 写入最新负荷（0-100），通知订阅者 */
export function setCurrentLoad(load: number): void {
  currentLoad = Math.min(100, Math.max(0, load));
  listeners.forEach((fn) => fn(currentLoad));
}

/** 读取当前负荷（0-100） */
export function getCurrentLoad(): number {
  return currentLoad;
}

/** 订阅负荷变化，返回取消订阅函数 */
export function subscribeLoad(listener: (load: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** React 订阅 hook：返回 0-100 负荷值 */
export function useCurrentLoad(): number {
  return useSyncExternalStore(subscribeLoad, getCurrentLoad, getCurrentLoad);
}
