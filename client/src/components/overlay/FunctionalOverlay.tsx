/**
 * 功能覆盖层 — 当用户进入模块时，在3D场景上方显示功能UI
 * 使用毛玻璃面板，保持3D场景在背后可见
 *
 * 常驻挂载策略：只要 currentModule 非空就保持挂载，通过 visible 控制
 * 透明度与交互性（而非卸载），使页面状态跨 Esc/重入周期保留，避免动画重播。
 * 隐藏时设置 inert 防止焦点落入不可见页面（React 18 不支持 inert prop，直接操作 DOM）。
 *
 * @ai-context: 浮层/弹窗组件：FunctionalOverlay。
 */
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
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

  // 已移除 aria-hidden：inert 属性已完整覆盖其语义（阻断辅助技术+焦点），
  // 同时避免 aria-hidden 同步生效而 inert 异步生效导致的焦点竞态警告
  return (
    <motion.div
      ref={rootRef}
      className={cn(
        "fixed inset-0 z-10 flex items-center justify-center",
        "p-2 sm:p-4 md:p-8",
        "pb-16 sm:pb-8 md:pb-8", // 移动端底部预留 BottomNav 空间
        className
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      /* 修复：外层过渡统一为 spring 类型，与内层面板保持一致，避免 ease 与 spring 混用导致动画节奏不协调 */
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
    >
      {/* 半透明背景遮罩 — 隐藏时移除 backdrop-blur，避免 Electron 中 backdrop-filter 合成层遮挡下方 canvas */}
      <div className={cn(
        "absolute inset-0 bg-black/20",
        visible && "backdrop-blur-sm",
        maskClassName,
        visible ? "pointer-events-auto" : "pointer-events-none"
      )} />

      {/* 功能面板 — 隐藏时移除 backdrop-blur，避免 backdrop-filter 合成层遮挡 canvas */}
      <motion.div
        data-work-area="module-content"
        className={cn(
          "relative z-10 w-full",
          "max-w-5xl",
          "max-h-[calc(100vh-5rem)] sm:max-h-[85vh]", // 移动端适配底部导航
          "overflow-y-auto",
          "rounded-2xl sm:rounded-[24px_12px_20px_16px]", // 移动端统一圆角
          "bg-transparent",
          visible && "backdrop-blur-2xl",
          "border border-white/20 dark:border-white/10",
          "shadow-[0_8px_40px_rgba(0,0,0,0.3)]",
          panelClassName,
          visible ? "pointer-events-auto" : "pointer-events-none",
          "p-3 sm:p-5 md:p-8"
        )}
        /* 修复：提示浏览器提前创建合成层，避免动画时触发重绘/重排，提升动画流畅度 */
        style={{
          willChange: 'transform, opacity',
          background: 'linear-gradient(180deg, var(--kb-dive-top) 0%, var(--kb-dive-mid) 42%, var(--kb-dive-bot) 100%)',
        }}
        initial={{ scale: 0.9, y: 30 }}
        animate={visible ? { scale: 1, y: 0 } : { scale: 0.9, y: 30 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
