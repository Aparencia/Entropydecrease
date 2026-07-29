/**
 * @ai-context: dashboard 功能模块 Hook：useTypewriter。
 */
import { useEffect, useRef, useState } from 'react';

/**
 * 打字机效果 Hook
 * 逐字显示文本，支持配置打字速度和启动延迟。
 *
 * 修复：原实现中 setInterval 的 cleanup 函数位于 setTimeout 回调内部 return，
 * 外层 useEffect cleanup 仅 clearTimeout，导致组件卸载时 setInterval 泄漏。
 * 现通过 useRef 跟踪 intervalId，确保 cleanup 同时清除 setTimeout 和 setInterval。
 */
export function useTypewriter(text: string, speed = 60, startDelay = 300) {
  const [displayed, setDisplayed] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDisplayed('');

    // 清除可能残留的旧定时器
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }, speed);
    }, startDelay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      timerRef.current = null;
      intervalRef.current = null;
    };
  }, [text, speed, startDelay]);

  return displayed;
}
