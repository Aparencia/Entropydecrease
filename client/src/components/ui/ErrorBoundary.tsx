/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：ErrorBoundary。
 */
import { Component, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * 全局错误边界组件
 *
 * 捕获子组件树中未处理的渲染错误，展示友好的降级 UI，
 * 避免整个应用白屏。用户可通过"重试"按钮重置错误状态以尝试恢复。
 *
 * React 中 Error Boundary 只能通过 class 组件实现。
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 可选的自定义容器类名 */
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // 将错误信息输出到控制台，便于调试与日志采集
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  /** 重置错误状态，允许用户重试 */
  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className={cn(
            'flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-primary px-6',
            this.props.className,
          )}
        >
          <h2 className="text-center text-lg font-semibold text-text-primary">
            深潜时遇到了一点暗流
          </h2>
          <p className="text-center text-base text-text-secondary">
            别担心，试试刷新页面重新出发
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className={cn(
              'rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-text-inverse',
              'transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
            )}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
