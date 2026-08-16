/**
 * Toast 上下文与消费 Hook（自 Toast.tsx 拆出）
 *
 * @ai-context: UI 基础组件（shadcn/radix 封装）：Toast 上下文 + useToast hook。
 * 从组件文件移出（react-refresh：组件文件只导出组件），ToastProvider 组件保留在
 * Toast.tsx；此处同时承载 ToastType/ToastAction 类型与 ToastContext，供两侧共用。
 */
import { createContext, useContext } from 'react';

// Types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * 可选操作按钮（如降级提示的「重新合并」）。
 * @ai-context: Optional inline action button rendered before the close
 * button; clicking it dismisses the toast first, then runs onClick in a
 * try/catch so a throwing callback can never keep the toast on screen.
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastContextValue {
  toast: (options: {
    type: ToastType;
    message: string;
    duration?: number;
    silent?: boolean;
    /** 可选操作按钮；含 action 时默认时长延长至 6000ms */
    action?: ToastAction;
  }) => void;
}

// Context
export const ToastContext = createContext<ToastContextValue | null>(null);

// Hook
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
