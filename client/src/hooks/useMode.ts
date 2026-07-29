/**
 * @ai-context: 应用模式（本地/云端）切换 Hook，包装 ModeManager；模式影响同步与 AI 路由全链路。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { modeManager, type AppMode, type ModeConfig } from '../lib/mode/ModeManager';
import { useAuth } from '../lib/auth/AuthContext';
import { useToast } from '../components/ui/Toast';
import { useNetworkStatus } from './useNetworkStatus';
import { getUnsyncedLogs } from '../lib/storage/operationLog';

/**
 * 轻量版：仅订阅模式状态，不依赖 Auth/Toast 上下文
 * 适用于 Navbar 等只需展示模式的位置
 */
export function useModeState() {
  const [mode, setMode] = useState<AppMode>(modeManager.getMode());
  const [config, setConfig] = useState<ModeConfig>(modeManager.getConfig());

  useEffect(() => {
    const unsubscribe = modeManager.subscribe((newMode, newConfig) => {
      setMode(newMode);
      setConfig(newConfig);
    });
    return unsubscribe;
  }, []);

  return { mode, config };
}

/**
 * 完整版：包含模式切换逻辑（含过渡保护）+ 自动降级
 * 必须在 AuthProvider + ToastProvider 内使用
 */
export function useMode() {
  const { mode, config } = useModeState();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { isOnline, isWeak } = useNetworkStatus();

  // 记录上次网络状态，避免重复触发降级
  const prevOnlineRef = useRef(isOnline);
  const prevWeakRef = useRef(isWeak);

  // v0.9.0: 网络状态变化时自动降级
  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    const wasWeak = prevWeakRef.current;
    prevOnlineRef.current = isOnline;
    prevWeakRef.current = isWeak;

    // 只在状态实际发生变化时触发降级检查
    const networkChanged = (wasOnline !== isOnline) || (wasWeak !== isWeak);
    if (!networkChanged) return;

    const currentMode = modeManager.getMode();

    // 只在 hybrid/full 模式下才需要降级
    if (currentMode === 'local') return;

    const degraded = modeManager.autoDegrade(isOnline, isWeak);
    if (degraded) {
      // Toast 提示由 onDegrade 监听器处理（下方），此处无需重复
    }
  }, [isOnline, isWeak]);

  // v0.9.0: 订阅降级事件，显示 Toast 提示
  useEffect(() => {
    const unsubscribe = modeManager.onDegrade((_fromMode, _toMode, reason) => {
      toast({ type: 'warning', message: reason, duration: 5000 });
    });
    return unsubscribe;
  }, [toast]);

  const changeMode = useCallback(async (newMode: AppMode): Promise<boolean> => {
    const currentMode = modeManager.getMode();
    if (currentMode === newMode) return true;

    // local → hybrid/full：检查是否已登录
    if (currentMode === 'local' && (newMode === 'hybrid' || newMode === 'full')) {
      if (!isAuthenticated) {
        toast({ type: 'warning', message: '请先登录后再开启云同步' });
        return false;
      }
    }

    // hybrid/full → local：检查未同步数据
    if ((currentMode === 'hybrid' || currentMode === 'full') && newMode === 'local') {
      try {
        const unsyncedLogs = await getUnsyncedLogs();
        if (unsyncedLogs.length > 0) {
          const confirmed = window.confirm(
            `当前有 ${unsyncedLogs.length} 条未同步的修改，切换到本地模式后这些数据将不会同步到云端。\n确定要切换吗？`,
          );
          if (!confirmed) return false;
        }
      } catch {
        // 检查失败时仍允许切换
      }
    }

    modeManager.setMode(newMode);
    const labels: Record<AppMode, string> = { local: '本地模式', hybrid: '联网模式', full: '云端模式' };
    toast({ type: 'success', message: `已切换到${labels[newMode]}` });
    return true;
  }, [isAuthenticated, toast]);

  // 推荐模式（仅展示用，不强制切换）
  const recommendedMode = modeManager.computeRecommendedMode(isAuthenticated, isOnline);

  return { mode, config, changeMode, recommendedMode };
}
