import { useState, useEffect, useCallback } from 'react';
import { Minus, Square, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuotaBadge } from './QuotaBadge';
import { isCapacitor } from '@/lib/platform/platform';

/**
 * 自定义标题栏组件属性
 * @param className - 可选的额外 CSS 类名，用于外部覆盖样式
 */
interface CustomTitlebarProps {
  className?: string;
}

/**
 * 自定义标题栏组件 — frameless 窗口顶部栏
 *
 * @ai-context
 * - Electron BrowserWindow `frame: false` 模式下替代系统标题栏
 * - 拖拽区域必须使用 CSS 类 `.drag-region`（禁止内联 style）
 * - 交互元素必须使用 CSS 类 `.no-drag`（禁止内联 style）
 * - 双击拖拽区域触发最大化/还原
 * - 自适应主题：跟随深浅模式变化
 *
 * @param props - 组件属性
 * @returns 自定义标题栏 JSX 元素
 */
export function CustomTitlebar({ className }: CustomTitlebarProps) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // 初始化时查询当前最大化状态
    window.electronAPI?.windowIsMaximized().then(setIsMaximized);
    // 监听主进程发出的最大化状态变化事件
    const cleanup = window.electronAPI?.onMaximizedChanged(setIsMaximized);
    return cleanup;
  }, []);

  /** 最小化窗口 */
  const handleMinimize = useCallback(() => {
    window.electronAPI?.windowMinimize();
  }, []);

  /** 切换最大化/还原 */
  const handleMaximize = useCallback(() => {
    window.electronAPI?.windowMaximize();
  }, []);

  /** 关闭窗口（触发确认对话框） */
  const handleClose = useCallback(() => {
    window.electronAPI?.windowClose();
  }, []);

  // 移动端 Capacitor 壳无窗口控制：整个标题栏不渲染（系统状态栏接管），
  // 桌面端与 Web/PWA 路径保持不变
  if (isCapacitor()) return null;

  return (
    <div
      className={cn(
        'drag-region relative z-50 flex items-center h-9 select-none',
        'bg-bg-secondary/60 backdrop-blur-md border-b border-border-default/50',
        className,
      )}
    >
      {/* 左侧：品牌 Logo + 应用名称（拖拽区域，双击最大化） */}
      <div className="flex items-center gap-2 pl-3 h-full" onDoubleClick={handleMaximize}>
        {/* 品牌 Logo — 深海青渐变圆角方块 + 内圈弧线 */}
        <div className="w-4 h-4 rounded-[4px] bg-gradient-to-br from-brand-400 to-brand-600 relative flex-shrink-0 shadow-[0_0_8px_rgba(91,138,114,0.3)]">
          <div className="absolute top-[3px] left-[3px] w-2.5 h-2.5 border border-white/30 dark:border-white/50 rounded-full" />
        </div>
        <span className="text-xs font-medium text-text-primary tracking-wide">
          熵减
        </span>
      </div>

      {/* 中间弹性占位 — 双击最大化 */}
      <div className="flex-1" onDoubleClick={handleMaximize} />

      {/* 右侧：AI 配额胶囊（全页面常驻入口）+ 窗口控制按钮（禁止拖拽） */}
      <div className="no-drag flex h-full items-center">
        <QuotaBadge />
        <button
          onClick={handleMinimize}
          className="w-11 h-9 flex items-center justify-center text-text-tertiary hover:text-brand-500 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 active:scale-90"
          aria-label="最小化"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-9 flex items-center justify-center text-text-tertiary hover:text-brand-500 hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-200 active:scale-90"
          aria-label={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <Square className="w-3 h-3" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-9 flex items-center justify-center text-text-tertiary hover:text-error hover:bg-error/10 transition-all duration-200 active:scale-90"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
