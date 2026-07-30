/**
 * @file 心流氛围光引擎
 * @description 根据时间段和专注状态调整全局环境色温
 * @ai-context 通过 CSS 变量 --kb-ambient-temp 全局传递，2000ms 平滑过渡
 */
import { useEffect, useRef } from 'react';
import { useAmbientStore } from './useAmbientState';
import { useShallow } from 'zustand/react/shallow';
import { isDarkMode } from './themeVariants';

/**
 * 时间段色温定义
 * 浅色模式：晨曦暖白 → 午后中性白 → 夜间深空蓝
 * 深色模式：深空蓝 → 靛蓝
 */
interface AmbientTemp {
  /** CSS hsl 色温值 */
  light: string;
  /** CSS hsl 色温值 */
  dark: string;
}

function getTimeSlot(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

const TIME_TEMPS: Record<string, AmbientTemp> = {
  morning: {
    light: 'hsl(40, 20%, 97%)',     // 晨曦暖白
    dark: 'hsl(230, 40%, 8%)',      // 深空蓝
  },
  afternoon: {
    light: 'hsl(0, 0%, 96%)',       // 午后中性白
    dark: 'hsl(240, 35%, 10%)',     // 中性深蓝
  },
  evening: {
    light: 'hsl(30, 15%, 95%)',     // 傍晚暖灰
    dark: 'hsl(245, 45%, 11%)',     // 靛蓝
  },
  night: {
    light: 'hsl(220, 25%, 94%)',    // 夜间冷白
    dark: 'hsl(250, 50%, 12%)',     // 深靛蓝
  },
};

/**
 * 心流氛围光引擎 Hook
 * 在 OceanEnvironment 或 App 级别调用
 * 通过 CSS 变量 --kb-ambient-temp 设置当前色温
 */
export function useAmbientLight() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { focusIntensity, ambientBreathing } = useAmbientStore(
    useShallow((s) => ({
      focusIntensity: s.focusIntensity,
      ambientBreathing: s.ambientBreathing,
    })),
  );

  useEffect(() => {
    function updateTemp() {
      const slot = getTimeSlot();
      const dark = isDarkMode();
      const temp = TIME_TEMPS[slot][dark ? 'dark' : 'light'];

      // 专注模式下略微增强色温饱和度
      const root = document.documentElement.style;
      root.setProperty('--kb-ambient-temp', temp);

      // 专注强度影响环境光微偏移
      const focusShift = focusIntensity * 5; // 0-5度色相偏移
      root.setProperty('--kb-ambient-focus-shift', `${focusShift}`);
    }

    updateTemp();
    // 每 5 分钟更新一次时间段色温
    intervalRef.current = setInterval(updateTemp, 5 * 60 * 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [focusIntensity, ambientBreathing]);
}
