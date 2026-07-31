/**
 * @ai-context: 登录会话过期检测 Hook，过期触发登出与提示。
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui';

const SESSION_EXPIRED_EVENT = 'kb:session-expired';

/**
 * 事件去重冷却窗口：并发 401 请求与 Supabase SIGNED_OUT 会在短时间内
 * 各自派发 session-expired，窗口内只处理第一个，避免重复弹 Toast
 * 让用户感知为"持续要求登录"（内测反馈 bug）
 */
const SESSION_EXPIRED_COOLDOWN_MS = 5000;

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
  // 冷却窗口去重：记录上次处理事件的时间戳
  const lastHandledAtRef = useRef(0);

  useEffect(() => {
    function handleSessionExpired() {
      // 冷却窗口内的重复事件（并发 401 / SIGNED_OUT 风暴）直接忽略
      const now = Date.now();
      if (now - lastHandledAtRef.current < SESSION_EXPIRED_COOLDOWN_MS) return;
      lastHandledAtRef.current = now;

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
