/**
 * 功能覆盖层 — 当用户进入模块时，在3D场景上方显示功能UI
 * 使用毛玻璃面板，保持3D场景在背后可见
 *
 * 常驻挂载策略：只要 currentModule 非空就保持挂载，通过 visible 控制
 * 透明度与交互性（而非卸载），使页面状态跨 Esc/重入周期保留，避免动画重播。
 * 隐藏时设置 inert 防止焦点落入不可见页面（React 18 不支持 inert prop，直接操作 DOM）。
 *
 * 动画策略：页面切换的 opacity/transform 入场出场使用 CSS transition
 * （零 JS 开销，运行在 GPU 合成线程），手势/布局动画保留 Framer Motion。
 *
 * @ai-context: 浮层/弹窗组件：FunctionalOverlay。
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FunctionalOverlayProps {
  children: React.ReactNode;
  /** 是否可见（false = 淡出并禁用交互，但保持挂载以保留页面状态） */
  visible: boolean;
  className?: string;
  /** 功能面板追加类：用于覆盖面板默认毛玻璃/投影（如萤火海沟的透明面板让暗物质场透出） */
  panelClassName?: string;
  /** 全屏遮罩追加类：用于覆盖默认遮罩浓度（如萤火海沟的深海氛围遮罩） */
  maskClassName?: string;
}

export function FunctionalOverlay({ children, visible, className, panelClassName, maskClassName }: FunctionalOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  // 延迟 backdrop-blur：动画期间（前 300ms）不加 blur，避免合成层与过渡动画竞争
  const [showBlur, setShowBlur] = useState(false);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => setShowBlur(true), 300);
      return () => clearTimeout(timer);
    }
    setShowBlur(false);
  }, [visible]);

  // 隐藏时设置 inert：阻断指针事件、焦点与辅助技术访问（React 18 无 inert prop）
  useEffect(() => {
    if (rootRef.current) {
      // 设置 inert 前先移除焦点，避免 aria-hidden 与焦点的竞态冲突
      if (!visible && rootRef.current.contains(document.activeElement)) {
        (document.activeElement as HTMLElement)?.blur?.();
      }
      rootRef.current.inert = !visible;
    }
  }, [visible]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "fixed inset-0 z-10 flex items-center justify-center",
        "p-2 sm:p-4 md:p-8",
        "pb-16 sm:pb-8 md:pb-8",
        // CSS transition: opacity 300ms ease-out（合成器线程，零 JS 开销）
        "transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      {/* 半透明背景遮罩 — 延迟 backdrop-blur 避免动画期间合成层竞争 */}
      <div className={cn(
        "absolute inset-0 bg-black/20",
        "transition-[backdrop-filter] duration-300 ease-out",
        showBlur && visible && "backdrop-blur-sm",
        maskClassName,
        visible ? "pointer-events-auto" : "pointer-events-none"
      )} />

      {/* 功能面板 — CSS transition 处理 scale/y/opacity 入场出场 */}
      <div
        data-work-area="module-content"
        className={cn(
          "relative z-10 w-full",
          "max-w-5xl",
          "max-h-[calc(100vh-5rem)] sm:max-h-[85vh]",
          "overflow-y-auto",
          "rounded-2xl sm:rounded-[24px_12px_20px_16px]",
          "bg-transparent",
          // CSS transition: 面板从 scale(0.9) + y(30px) 缩放入场
          "transition-all duration-300 ease-out",
          visible
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-90 translate-y-[30px]",
          // backdrop-blur 延迟 300ms 后生效，避免与入场动画竞争
          showBlur && visible && "backdrop-blur-2xl",
          "border border-white/20 dark:border-white/10",
          "shadow-[0_8px_40px_rgba(0,0,0,0.3)]",
          panelClassName,
          visible ? "pointer-events-auto" : "pointer-events-none",
          "p-3 sm:p-5 md:p-8"
        )}
        style={{
          willChange: 'transform, opacity',
          background: 'linear-gradient(180deg, var(--kb-dive-top) 0%, var(--kb-dive-mid) 42%, var(--kb-dive-bot) 100%)',
        }}
      >
        {children}
      </div>
    </div>
  );
}