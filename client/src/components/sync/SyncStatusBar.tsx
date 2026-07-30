/**
 * @ai-context: 同步状态 UI 组件：SyncStatusBar。
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, WifiOff, Signal, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useSync } from '@/lib/sync/SyncContext';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

const SYNC_COMPLETE_HIDE_DELAY_MS = 3000;

/**
 * 全局同步/网络状态条
 * 显示离线、弱网、同步中、同步完成等状态
 */
export default function SyncStatusBar() {
  const { status: netStatus, isOffline, isWeak } = useNetworkStatus();
  const { isSyncing, lastSyncAt } = useSync();
  const [dismissed, setDismissed] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const prevSyncingRef = useRef(false);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 同步完成后短暂显示绿色提示
  useEffect(() => {
    if (prevSyncingRef.current && !isSyncing) {
      if (lastSyncAt) soundPlayer.play('sync_complete');
      setShowComplete(true);
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      completeTimerRef.current = setTimeout(() => setShowComplete(false), SYNC_COMPLETE_HIDE_DELAY_MS);
    }
    prevSyncingRef.current = isSyncing;
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    };
  }, [isSyncing]);

  // 网络状态变化时重置关闭状态（让新状态重新显示）
  useEffect(() => {
    setDismissed(false);
  }, [netStatus]);

  // 决定显示哪条消息
  const getBanner = (): {
    message: string;
    icon: React.ReactNode;
    bgClass: string;
    textClass: string;
    dismissible: boolean;
  } | null => {
    if (isOffline) {
      return {
        message: '您处于离线模式，更改将在网络恢复后自动同步',
        icon: <WifiOff className="w-4 h-4 shrink-0" />,
        bgClass: 'bg-semantic-danger/10 border-semantic-danger/30',
        textClass: 'text-semantic-danger',
        dismissible: true,
      };
    }

    if (isWeak) {
      return {
        message: '网络连接较弱，同步可能延迟',
        icon: <Signal className="w-4 h-4 shrink-0" />,
        bgClass: 'bg-semantic-warning/10 border-semantic-warning/30',
        textClass: 'text-semantic-warning',
        dismissible: true,
      };
    }

    if (isSyncing) {
      return {
        message: '正在同步...',
        icon: <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />,
        bgClass: 'bg-semantic-info/10 border-semantic-info/30',
        textClass: 'text-semantic-info',
        dismissible: false,
      };
    }

    if (showComplete && lastSyncAt) {
      return {
        message: '同步完成',
        icon: <CheckCircle2 className="w-4 h-4 shrink-0" />,
        bgClass: 'bg-semantic-success/10 border-semantic-success/30',
        textClass: 'text-semantic-success',
        dismissible: true,
      };
    }

    return null;
  };

  const banner = getBanner();

  return (
    <AnimatePresence initial={false}>
      {banner && !(dismissed && banner.dismissible) && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="sticky top-14 z-10 overflow-hidden"
        >
          <div
            className={cn(
              'flex items-center justify-between gap-kb-sm',
              'px-kb-md py-kb-xs',
              'border-b text-caption',
              banner.bgClass,
              banner.textClass,
            )}
          >
            <div className="flex items-center gap-kb-xs">
              {banner.icon}
              <span>{banner.message}</span>
            </div>
            {banner.dismissible && (
              <button
                onClick={() => setDismissed(true)}
                className={cn(
                  'p-kb-xs rounded-kb-sm',
                  'hover:bg-white/10',
                  'transition-colors',
                )}
                aria-label="关闭提示"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
