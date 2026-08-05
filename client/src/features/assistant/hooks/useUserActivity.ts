/**
 * 用户活跃/空闲状态检测 Hook
 *
 * @ai-context: 监听全局交互事件（鼠标移动、键盘、点击、滚轮、触摸），
 * 最后一次交互后 IDLE_THRESHOLD_MS（10分钟）无操作视为空闲，
 * 检测到交互时标记为活跃。窗口隐藏时视为空闲。
 * 状态转换时发射 user:idle / user:active 事件并更新 store。
 * 在 AssistantRoot 中挂载一次。
 */
import { useEffect, useRef } from 'react';
import { useAssistantStore } from '../store/useAssistantStore';
import { assistantEventBus } from '../lib/eventBus';
import { IDLE_THRESHOLD_MS } from '../constants';

/** 活跃交互事件列表 */
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

export function useUserActivity(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActiveRef = useRef(true); // 初始为活跃

  useEffect(() => {
    const setUserActive = useAssistantStore.getState().setUserActive;

    /** 重置空闲计时器 */
    function resetIdleTimer(): void {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        // 变为空闲
        if (isActiveRef.current) {
          isActiveRef.current = false;
          setUserActive(false);
          const currentHour = new Date().getHours();
          assistantEventBus.emit('user:idle', { currentHour });
        }
      }, IDLE_THRESHOLD_MS);
    }

    /** 处理交互事件：标记为活跃 + 重置空闲计时器 */
    function handleActivity(): void {
      // 如果之前是空闲，发射 user:active 事件
      if (!isActiveRef.current) {
        isActiveRef.current = true;
        setUserActive(true);
        const currentHour = new Date().getHours();
        assistantEventBus.emit('user:active', { currentHour });
      }
      resetIdleTimer();
    }

    /** 处理可见性变化：隐藏时视为空闲，显示时视为活跃 */
    function handleVisibilityChange(): void {
      if (document.hidden) {
        // 窗口隐藏 → 空闲
        if (timerRef.current) clearTimeout(timerRef.current);
        if (isActiveRef.current) {
          isActiveRef.current = false;
          setUserActive(false);
          const currentHour = new Date().getHours();
          assistantEventBus.emit('user:idle', { currentHour });
        }
      } else {
        // 窗口显示 → 活跃
        handleActivity();
      }
    }

    // 注册事件
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 启动空闲计时器
    resetIdleTimer();

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleActivity);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}