/**
 * 旧灵感随机浮现 Hook
 * @ai-context 每隔随机时间选中一个光点赋予"浮现"状态，
 * pending 状态的光点被选中权重为 2x，模拟深海萤火偶尔浮出水面。
 */
import { useState, useEffect, useRef, useCallback } from 'react';

// ─── 常量 ────────────────────────────────────────────────────

/** 正常模式浮现间隔范围（秒） */
const INTERVAL_MIN_S = 8;
const INTERVAL_SPAN_S = 7; // 8 ~ 15

/** L1 降级：浮现间隔延长 */
const L1_INTERVAL_MIN_S = 20;
const L1_INTERVAL_SPAN_S = 10; // 20 ~ 30

/** 浮现持续时间（毫秒） */
const SURFACE_DURATION_MS = 2000;

// ─── 类型 ────────────────────────────────────────────────────

interface SurfaceCandidate {
  id: string;
  sortStatus?: string;
}

interface UseRandomSurfaceOptions {
  /** 是否禁用浮现（prefers-reduced-motion） */
  disabled: boolean;
  /** L1 降级时延长间隔 */
  isL1: boolean;
}

// ─── 纯函数 ──────────────────────────────────────────────────

/**
 * 构建加权候选数组
 * @ai-context pending / 无状态光点出现两次，权重 2x；其他 1x
 */
function buildWeightedPool(candidates: SurfaceCandidate[]): string[] {
  const pool: string[] = [];
  for (const c of candidates) {
    pool.push(c.id);
    if (c.sortStatus === 'pending' || c.sortStatus === undefined) {
      pool.push(c.id); // 权重翻倍
    }
  }
  return pool;
}

function randomInterval(minS: number, spanS: number): number {
  return (minS + Math.random() * spanS) * 1000;
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * 返回当前正在浮现的光点 ID（或 null）
 * @ai-context 使用 setTimeout 链式调用实现随机间隔，
 * disabled 时完全不启动定时器，L1 降级时间隔延长至 20-30s
 */
export function useRandomSurface(
  candidates: SurfaceCandidate[],
  options: UseRandomSurfaceOptions,
): string | null {
  const [surfaceId, setSurfaceId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const surfaceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { disabled, isL1 } = options;
  const minS = isL1 ? L1_INTERVAL_MIN_S : INTERVAL_MIN_S;
  const spanS = isL1 ? L1_INTERVAL_SPAN_S : INTERVAL_SPAN_S;

  const scheduleNext = useCallback(() => {
    const delay = randomInterval(minS, spanS);
    timerRef.current = setTimeout(() => {
      const pool = buildWeightedPool(candidates);
      if (pool.length === 0) return;

      const chosen = pool[Math.floor(Math.random() * pool.length)];
      setSurfaceId(chosen);

      // 浮现持续 2s 后自动恢复
      surfaceTimerRef.current = setTimeout(() => {
        setSurfaceId(null);
      }, SURFACE_DURATION_MS);

      scheduleNext();
    }, delay);
  }, [candidates, minS, spanS]);

  useEffect(() => {
    if (disabled || candidates.length === 0) return;

    scheduleNext();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (surfaceTimerRef.current) clearTimeout(surfaceTimerRef.current);
    };
  }, [disabled, candidates.length, scheduleNext]);

  return surfaceId;
}
