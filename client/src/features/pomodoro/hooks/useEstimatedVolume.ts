/**
 * useEstimatedVolume — 估算实际听感音量
 *
 * 结合系统音量（通过 Electron IPC 获取）和软件音量，估算实际输出分贝，
 * 并基于科学研究提供动态推荐。
 *
 * 科学依据：
 * - 专注背景音最佳区间：35-50 dB SPL（声压级）
 * - 系统音量 50% + 软件音量 40% ≈ 综合输出约 45 dB（估算值）
 * - 超过 55 dB 会开始对复杂认知任务产生干扰
 *
 * @ai-context: 音量估算 hook，Electron 环境下通过 IPC 获取系统音量，
 * 非 Electron 环境回退默认值 50%。
 */
import { useState, useEffect } from 'react';
import type { AudioDeviceType } from '@/lib/audio/audioConfig';
import { DEVICE_TYPE_DB_OFFSET } from '@/lib/audio/audioConfig';

/** 系统音量（0-100）的缓存，避免频繁 IPC */
let cachedSystemVolume: number | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 30_000; // 30 秒缓存

async function fetchSystemVolume(): Promise<number> {
  const now = Date.now();
  if (cachedSystemVolume !== null && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedSystemVolume;
  }
  try {
    if (window.electronAPI?.invoke) {
      const result = await window.electronAPI.invoke('system:get-volume') as { success: boolean; volume: number };
      if (result.success) {
        cachedSystemVolume = result.volume;
        lastFetchTime = now;
        return result.volume;
      }
    }
  } catch {
    // 静默失败
  }
  return 50; // 默认 50%
}

export interface EstimatedVolume {
  /** 系统音量百分比 0-100 */
  systemVolume: number;
  /** 软件音量百分比 0-100 */
  softwareVolume: number;
  /** 综合输出百分比 0-100（系统 × 软件） */
  combinedPercent: number;
  /** 估算分贝值（已考虑设备类型偏移） */
  estimatedDb: number;
  /** 设备类型名称 */
  deviceName: string;
  /** 推荐等级 */
  recommendation: 'too_low' | 'optimal' | 'high' | 'too_high';
  /** 推荐文字 */
  recommendationText: string;
}

/**
 * 将综合音量百分比映射到估算分贝值
 * 假设：系统最大输出 ≈ 85 dB（典型耳机/扬声器）
 * 映射：0% → 35 dB（环境底噪），100% → 85 dB
 * @param percent - 综合音量百分比
 * @param dbOffset - 设备类型 dB 偏移量
 */
function percentToDb(percent: number, dbOffset: number): number {
  // 使用对数映射：人耳感知是对数的
  // 0% → 35dB, 25% → 45dB, 50% → 55dB, 75% → 68dB, 100% → 85dB
  let base: number;
  if (percent <= 0) base = 35;
  else if (percent <= 25) base = 35 + (percent / 25) * 10;
  else if (percent <= 50) base = 45 + ((percent - 25) / 25) * 10;
  else if (percent <= 75) base = 55 + ((percent - 50) / 25) * 13;
  else base = 68 + ((percent - 75) / 25) * 17;
  return Math.round(Math.max(20, Math.min(100, base + dbOffset)));
}

function getRecommendation(combined: number, db: number): Pick<EstimatedVolume, 'recommendation' | 'recommendationText'> {
  if (combined < 8) {
    return {
      recommendation: 'too_low',
      recommendationText: `~${db}dB 音量过低，可能无法有效掩蔽环境噪声`,
    };
  }
  if (combined <= 25) {
    return {
      recommendation: 'optimal',
      recommendationText: `~${db}dB 科学研究推荐的最佳专注背景音区间`,
    };
  }
  if (combined <= 40) {
    return {
      recommendation: 'high',
      recommendationText: `~${db}dB 偏高，长时间可能增加听觉疲劳`,
    };
  }
  return {
    recommendation: 'too_high',
    recommendationText: `~${db}dB 过高，可能影响复杂认知任务的专注力`,
  };
}

export function useEstimatedVolume(softwareVolume: number, deviceType: AudioDeviceType = 'headphones'): EstimatedVolume {
  const [systemVolume, setSystemVolume] = useState(50);

  useEffect(() => {
    let cancelled = false;
    fetchSystemVolume().then((vol) => {
      if (!cancelled) setSystemVolume(vol);
    });
    // 定期刷新
    const interval = setInterval(async () => {
      const vol = await fetchSystemVolume();
      if (!cancelled) setSystemVolume(vol);
    }, CACHE_TTL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const softwarePct = Math.round(softwareVolume * 100);
  // 综合输出 = 系统音量百分比 × 软件音量百分比
  const combinedPercent = Math.round((systemVolume / 100) * (softwareVolume * 100));
  const dbOffset = DEVICE_TYPE_DB_OFFSET[deviceType] ?? 0;
  const estimatedDb = percentToDb(combinedPercent, dbOffset);
  const { recommendation, recommendationText } = getRecommendation(combinedPercent, estimatedDb);

  return {
    systemVolume,
    softwareVolume: softwarePct,
    combinedPercent,
    estimatedDb,
    deviceName: deviceType,
    recommendation,
    recommendationText,
  };
}