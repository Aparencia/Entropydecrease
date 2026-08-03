/**
 * @ai-context: UI 基础组件：Tip（轻量级 Tooltip 封装）。
 * 为 icon-only 按钮等元素提供 hover 悬浮提示，改善可访问性与新手友好度。
 * 使用 CSS 绝对定位 + 延迟显示，无需额外依赖。
 */
import { type ReactNode } from 'react';

/** tooltip 弹出方向 */
type TipSide = 'top' | 'bottom' | 'left' | 'right';

interface TipProps {
  /** 提示文本（为空时不渲染 tooltip） */
  text?: string;
  /** 弹出方向，默认 'top' */
  side?: TipSide;
  /** 子元素 */
  children: ReactNode;
  /** 额外 className（加到包裹元素上） */
  className?: string;
}

/**
 * 位置样式映射 —— 根据 side 决定 tooltip 绝对定位参数
 * 含 4px 偏移量，使 tooltip 与触发元素保持间距
 */
const sideStyles: Record<TipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

/**
 * Tip 组件 —— 轻量级 tooltip 包裹器
 *
 * 用法示例：
 * ```tsx
 * <Tip text="切换主题">
 *   <button onClick={toggleTheme}><Sun /></button>
 * </Tip>
 * ```
 *
 * 设计要点：
 * - 延迟 500ms 显示，避免鼠标掠过时闪烁
 * - pointer-events-none 确保 tooltip 不遮挡交互
 * - z-[9999] 保证在最上层
 * - white-space: nowrap 单行显示
 */
export function Tip({ text, side = 'top', children, className }: TipProps) {
  // 无提示文本时直接透传子元素，不添加包裹层
  if (!text) return <>{children}</>;

  return (
    /* 包裹层使用 inline-flex + flex-shrink-0，确保在 flex 布局中不被压缩导致子元素重叠 */
    <span className={`group/tip relative inline-flex shrink-0 ${className ?? ''}`}>
      {children}
      {/* tooltip 浮层 —— CSS 控制延迟显示与隐藏 */}
      <span
        role="tooltip"
        className={[
          // 基础定位
          'absolute z-[9999]',
          sideStyles[side],
          // 外观：深色背景 + 圆角 + 阴影
          'px-2 py-1 rounded-md',
          'bg-gray-800/95 text-white text-[11px] leading-tight',
          'shadow-lg whitespace-nowrap',
          // 交互：不拦截鼠标事件
          'pointer-events-none select-none',
          // 显隐动画：默认透明不可见，hover 时淡入
          'opacity-0 scale-95',
          // 延迟 500ms 出现，移出立即消失（无延迟）
          'transition-all duration-150 delay-500',
          'group-hover/tip:opacity-100 group-hover/tip:scale-100',
          // focus-visible 也能触发（键盘可达性）
          'group-focus-visible/tip:opacity-100 group-focus-visible/tip:scale-100',
        ].join(' ')}
      >
        {text}
      </span>
    </span>
  );
}

export default Tip;
