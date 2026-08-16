/**
 * 全局 AI 配额耗尽提示（监听 429 双路径，挂载于 AppLayout 全局组件区）
 *
 * @ai-context: 监听两条 429 感知路径——渲染进程直连网关（apiClient 派发
 * kb:ai-quota-exhausted CustomEvent）与 Electron 主进程代理（gatewayHttp /
 * gatewayStream 经 preload 推送 ai:quota-exhausted IPC），统一弹非阻断
 * Toast（带「查看额度」跳转）并强制刷新标题栏配额胶囊；同一用户 5 分钟内
 * 防重复提示，避免并发 AI 请求同时 429 刷屏。
 * @ai-context: Global listener for both 429 paths; shows a non-blocking
 * toast with a quota navigation action, deduped within 5 minutes.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { useQuotaStore } from '@/features/beta/useQuotaStore';
import { useAuth } from '@/lib/auth/AuthContext';

// 同一用户 5 分钟内不重复提示（并发 AI 请求同时 429 防刷屏）
const TOAST_COOLDOWN_MS = 5 * 60_000;

export function QuotaNotice() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getAccessToken } = useAuth();
  const refresh = useQuotaStore((s) => s.refresh);
  const lastToastAt = useRef(0);

  const handleQuotaExhausted = useCallback(
    (detail?: string) => {
      const now = Date.now();
      if (now - lastToastAt.current < TOAST_COOLDOWN_MS) return;
      lastToastAt.current = now;

      // 429 后强制刷新配额（绕过 30s 去抖），标题栏胶囊即时反映耗尽状态
      getAccessToken()
        .then((token) => refresh(token ?? undefined, true))
        .catch(() => {
          // 未登录静默（本地模式无配额概念）
        });

      const isCost = (detail ?? '').includes('费用');
      toast({
        type: 'warning',
        message: isCost
          ? '今日 AI 费用已达上限，AI 功能暂不可用，明天自动恢复'
          : '今日 AI 配额已用完，AI 功能已切换为本地模式，明天自动恢复',
        action: {
          label: '查看额度',
          onClick: () => navigate('/settings'),
        },
        silent: true,
      });
    },
    [getAccessToken, refresh, navigate, toast],
  );

  useEffect(() => {
    // 路径 1：渲染进程直连网关（apiClient）派发的窗口事件
    const onWindowEvent = () => handleQuotaExhausted();
    window.addEventListener('kb:ai-quota-exhausted', onWindowEvent);

    // 路径 2：Electron 主进程代理（gatewayHttp/gatewayStream）IPC 推送
    const cleanupIpc = window.electronAPI?.onAIQuotaExhausted?.((detail) =>
      handleQuotaExhausted(detail),
    );

    return () => {
      window.removeEventListener('kb:ai-quota-exhausted', onWindowEvent);
      cleanupIpc?.();
    };
  }, [handleQuotaExhausted]);

  return null;
}
