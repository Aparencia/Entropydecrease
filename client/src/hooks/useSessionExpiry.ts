/**
 * @ai-context: 登录会话过期检测 Hook，过期触发登出与提示。
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui';

const SESSION_EXPIRED_EVENT = 'kb:session-expired';

/**
 * 监听 session 过期事件，弹出 Toast 提示并提供重新登录入口
 * 需在 AppLayout 或其他全局组件中调用
 */
export function useSessionExpiry() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Bug #6: 用 ref 存储 navigate 和 toast，避免依赖变化导致事件监听中断
  const navigateRef = useRef(navigate);
  const toastRef = useRef(toast);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Bug #15: 防止重复设置 setTimeout
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleSessionExpired() {
      toastRef.current({
        type: 'warning',
        message: '登录已过期，请重新登录',
        duration: 8000,
      });
      // 防止重复设置 setTimeout
      if (timeoutRef.current !== null) return;
      // 延迟跳转，让用户能看到提示
      timeoutRef.current = setTimeout(() => {
        navigateRef.current('/login', { replace: true });
        timeoutRef.current = null;
      }, 1500);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
}
