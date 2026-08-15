/**
 * @file 水墨涟漪反馈组件
 * @description 点击触发的水墨涟漪，从点击坐标扩散
 * @ai-context 通过全局自定义事件 'kb:ink-ripple' 触发，组件监听并渲染
 *
 * 触发方式：window.dispatchEvent(new CustomEvent('kb:ink-ripple', { detail: { x, y } }))
 * 也可不传 x/y，默认使用屏幕中心
 */
import { useState, useEffect, useCallback } from 'react';
import { isDarkMode } from './themeVariants';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface RippleData {
  id: string;
  x: number;
  y: number;
  color: string;
  createdAt: number;
}

/** 涟漪持续时间 ms */
const RIPPLE_DURATION = 800;

/** 涟漪颜色 */
function getRippleColor(): string {
  return isDarkMode()
    ? 'rgba(8, 145, 178, 0.3)'    // 赛博青色
    : 'rgba(245, 158, 11, 0.2)';   // 暖琥珀色
}

/**
 * 水墨涟漪全局组件
 * 放置在 App 级别，监听全局事件
 */
export default function InkRipple() {
  const prefersReduced = useReducedMotion();
  const [ripples, setRipples] = useState<RippleData[]>([]);

  const handleRipple = useCallback((e: Event) => {
    if (prefersReduced) return;
    const detail = (e as CustomEvent).detail as { x?: number; y?: number } | undefined;
    const x = detail?.x ?? window.innerWidth / 2;
    const y = detail?.y ?? window.innerHeight / 2;
    const color = getRippleColor();
    const id = `ripple-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setRipples((prev) => [...prev, { id, x, y, color, createdAt: Date.now() }]);

    // 自动清理
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, RIPPLE_DURATION + 100);
  }, [prefersReduced]);

  useEffect(() => {
    window.addEventListener('kb:ink-ripple', handleRipple);
    return () => window.removeEventListener('kb:ink-ripple', handleRipple);
  }, [handleRipple]);

  if (ripples.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 9998 }}>
      {ripples.map((r) => (
        <div
          key={r.id}
          className="absolute rounded-full"
          style={{
            left: r.x,
            top: r.y,
            width: 80,
            height: 80,
            marginTop: -40,
            marginLeft: -40,
            background: `radial-gradient(circle, ${r.color} 0%, transparent 70%)`,
            animation: `kb-ink-ripple-expand ${RIPPLE_DURATION}ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
            filter: 'blur(2px)',
          }}
        />
      ))}
    </div>
  );
}

// react-refresh: 组件文件只导出组件；triggerInkRipple 已移至 ./triggerInkRipple，
// 此处 re-export 保持 '@/lib/animation/InkRipple' 导出签名不变（usePomodoroEffects 直接 import）
// oxlint-disable-next-line react/only-export-components
export { triggerInkRipple } from './triggerInkRipple';
