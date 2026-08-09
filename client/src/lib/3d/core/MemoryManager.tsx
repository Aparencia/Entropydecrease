/**
 * 内存管理器 — 定期报告 GPU 内存占用 + 渲染进程堆内存泄漏看门狗
 *
 * 说明：窗口最小化/隐藏时浏览器会自动节流 rAF（渲染自然暂停），
 * 无需在此手动跳帧。原“每 4 帧跳 3 帧”的实现（在 useFrame 内 return）
 * 并不能阻止 R3F 渲染当前帧，属无效死代码，已移除。
 *
 * @ai-context: P2 扩展——泄漏看门狗：跟踪 performance.memory.usedJSHeapSize
 * 趋势，连续 N 次采样环比增长超过阈值时 console.warn（4 小时长跑内存
 * 验证的观测点）。Electron/Chromium 支持该 API，缺失时静默跳过。
 *
 * @ai-context: 3D 场景核心（R3F）：MemoryManager。
 */
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/** 看门狗采样间隔（ms） */
const WATCHDOG_INTERVAL_MS = 60_000;
/** 连续增长次数阈值：达到即告警 */
const WATCHDOG_CONSECUTIVE_GROWTH = 5;
/** 单次环比增长阈值（MB）：低于此值视为噪声（GC/缓存波动） */
const WATCHDOG_GROWTH_MB = 8;
/** 单次采样增长超过此值（MB）视为异常跳跃（可能泄漏） */
const WATCHDOG_SPIKE_MB = 64;

interface MemorySample {
  heapMB: number;
  ts: number;
}

/** 是否支持堆内存采样（performance.memory 为 Chromium 私有 API） */
function heapSamplingSupported(): boolean {
  return typeof performance !== 'undefined'
    && 'memory' in performance
    && typeof (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize === 'number';
}

export function MemoryManager() {
  const { gl } = useThree();
  const lastHeapRef = useRef<MemorySample | null>(null);
  const growthStreakRef = useRef(0);

  // 定期报告内存使用
  useEffect(() => {
    const interval = setInterval(() => {
      const info = gl.info as any;
      const programs = info.memory?.programs ?? info.programs?.length ?? 0;
      if (info.memory.geometries > 500 || info.memory.textures > 100) {
        console.warn('[3D Memory]', {
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs,
        });
      }

      // P2 堆内存泄漏看门狗：环比增长趋势检测
      if (!heapSamplingSupported()) return;
      const heapMB = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / (1024 * 1024);
      const prev = lastHeapRef.current;
      lastHeapRef.current = { heapMB, ts: Date.now() };
      if (!prev) return;
      const growthMB = heapMB - prev.heapMB;
      // 异常跳跃：一次采样增长超阈值直接告警（可能单点泄漏）
      if (growthMB > WATCHDOG_SPIKE_MB) {
        console.warn('[Memory Watchdog] heap spike', {
          deltaMB: Math.round(growthMB),
          heapMB: Math.round(heapMB),
          intervalSec: Math.round((Date.now() - prev.ts) / 1000),
        });
        growthStreakRef.current = 0;
        return;
      }
      growthStreakRef.current = growthMB > WATCHDOG_GROWTH_MB ? growthStreakRef.current + 1 : 0;
      if (growthStreakRef.current >= WATCHDOG_CONSECUTIVE_GROWTH) {
        growthStreakRef.current = 0;
        console.warn('[Memory Watchdog] heap growing steadily, possible leak', {
          heapMB: Math.round(heapMB),
          consecutiveGrowth: WATCHDOG_CONSECUTIVE_GROWTH,
          intervalSec: Math.round((Date.now() - prev.ts) / 1000),
        });
      }
    }, WATCHDOG_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [gl]);

  return null;
}
