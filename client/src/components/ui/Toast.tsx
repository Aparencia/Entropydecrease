/**
 * @ai-context: UI 基础组件（shadcn/radix 封装）：Toast。
 */
import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import * as RadixToast from '@radix-ui/react-toast';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

// Types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

interface ToastContextValue {
  toast: (options: { type: ToastType; message: string; duration?: number; silent?: boolean }) => void;
}

// Context
const ToastContext = createContext<ToastContextValue | null>(null);

// Hook
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// Toast 类型 → 反馈音效映射（info 不播放音效；silent: true 的调用点跳过，避免与专属音效叠加）
const toastSoundMap: Partial<Record<ToastType, string>> = {
  success: 'feedback_success',
  error: 'feedback_error',
  warning: 'feedback_warning',
};

// Default duration per type (ms)
const defaultDuration: Record<ToastType, number> = {
  success: 2000,
  info: 2000,
  error: 3000,
  warning: 3000,
};

// Radix toast type mapping
const radixTypeMap: Record<ToastType, RadixToast.ToastProps['type']> = {
  success: 'foreground',
  info: 'foreground',
  error: 'background',
  warning: 'background',
};

// Config per type
const typeConfig: Record<
  ToastType,
  { icon: React.FC<{ className?: string }>; color: string; bg: string }
> = {
  success: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500' },
  error: { icon: XCircle, color: 'text-[#F43F5E]', bg: 'bg-[#F43F5E]' },
  warning: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500' },
  info: { icon: Info, color: 'text-brand-500', bg: 'bg-brand-500' },
};

// ToastItem component
const ToastItemCard: React.FC<{
  item: ToastItem;
  onOpenChange: (id: number, open: boolean) => void;
}> = ({ item, onOpenChange }) => {
  const { icon: Icon, color, bg } = typeConfig[item.type];

  return (
    <RadixToast.Root
      type={radixTypeMap[item.type]}
      duration={item.duration}
      onOpenChange={(open) => { if (!open) onOpenChange(item.id, false); }}
      className={cn(
        'flex items-center gap-kb-sm px-kb-md py-kb-sm',
        'bg-bg-elevated/90 backdrop-blur-md rounded-kb-md shadow-kb-lg',
        'border border-border/40',
        'min-w-[260px] max-w-sm',
      )}
      style={{
        animation: 'toast-slide-in 0.25s ease-out',
      }}
    >
      {/* Left color bar */}
      <div className={cn('w-1 h-8 rounded-kb-full flex-shrink-0', bg)} />
      {/* Icon */}
      <Icon className={cn('w-icon-md h-icon-md flex-shrink-0', color)} />
      {/* Message */}
      <RadixToast.Title className="text-b2 text-text-primary flex-1 font-normal">
        {item.message}
      </RadixToast.Title>
      {/* Close button */}
      <RadixToast.Close asChild>
        <button
          className="flex-shrink-0 p-0.5 rounded hover:bg-bg-secondary/60 transition-colors"
          aria-label="关闭"
        >
          <X className="w-3.5 h-3.5 text-text-tertiary hover:text-text-secondary" strokeWidth={2} />
        </button>
      </RadixToast.Close>
    </RadixToast.Root>
  );
};

// Provider
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback(({ type, message, duration, silent }: { type: ToastType; message: string; duration?: number; silent?: boolean }) => {
    const id = ++idRef.current;
    const d = duration ?? defaultDuration[type];
    if (!silent && toastSoundMap[type]) soundPlayer.play(toastSoundMap[type]!);
    setToasts((prev) => [...prev, { id, type, message, duration: d }]);
  }, []);

  const handleOpenChange = useCallback((id: number, open: boolean) => {
    if (!open) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <RadixToast.Provider swipeDirection="down">
        {children}

        {toasts.map((t) => (
          <ToastItemCard key={t.id} item={t} onOpenChange={handleOpenChange} />
        ))}

        <RadixToast.Viewport className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-kb-sm items-center outline-none" />
      </RadixToast.Provider>

      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
};

ToastProvider.displayName = 'ToastProvider';
