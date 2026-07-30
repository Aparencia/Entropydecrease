/**
 * @file 氛围状态→CSS 变量同步 Hook
 * @description 监听 useAmbientStore，将所有状态映射到 :root CSS 变量
 * @ai-context 在 OceanEnvironment 中调用一次即可驱动所有子组件的 CSS 动画
 */
import { useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAmbientStore } from './useAmbientState';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/** 滚动速度衰减时间（ms） */
const VELOCITY_DECAY_MS = 300;

/**
 * 将 ambient store 中的状态同步到 document.documentElement 的 CSS 变量
 * 使用 requestAnimationFrame 而非 setInterval 确保性能
 */
export function useAmbientCSSSync() {
  const prefersReduced = useReducedMotion();
  const rafRef = useRef<number>(0);
  const velocityDecayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state = useAmbientStore(
    useShallow((s) => ({
      mouseX: s.mousePosition.x,
      mouseY: s.mousePosition.y,
      scrollVelocity: s.scrollVelocity,
      ambientBreathing: s.ambientBreathing,
      breathDuration: s.breathDuration,
      typingIntensity: s.typingIntensity,
      audioAmplitude: s.audioAmplitude,
      pageVisible: s.pageVisible,
      focusIntensity: s.focusIntensity,
      auroraActive: s.auroraActive,
    })),
  );

  // 使用 ref 持有最新值，避免 rAF 闭包陷阱
  const stateRef = useRef(state);
  stateRef.current = state;

  const syncCSS = useCallback(() => {
    if (!stateRef.current.pageVisible || prefersReduced) {
      // 页面不可见或 reduced-motion 时，重置所有 CSS 变量为默认值
      const root = document.documentElement.style;
      root.setProperty('--kb-mouse-x', '0.5');
      root.setProperty('--kb-mouse-y', '0.5');
      root.setProperty('--kb-particle-speed', '1');
      root.setProperty('--kb-breath-active', '0');
      root.setProperty('--kb-breath-duration', '8s');
      root.setProperty('--kb-typing-intensity', '0');
      root.setProperty('--kb-audio-amplitude', '0');
      root.setProperty('--kb-focus-intensity', '0');
      root.setProperty('--kb-aurora-active', '0');
      return;
    }

    const s = stateRef.current;
    const root = document.documentElement.style;

    // 鼠标位置 → CSS 变量
    root.setProperty('--kb-mouse-x', s.mouseX.toFixed(3));
    root.setProperty('--kb-mouse-y', s.mouseY.toFixed(3));

    // 滚动速度 → 粒子速度倍数（1=正常，最大 2.5=快速滚动）
    const speedMultiplier = 1 + Math.min(s.scrollVelocity / 2000, 1.5);
    root.setProperty('--kb-particle-speed', speedMultiplier.toFixed(2));

    // 呼吸模式
    root.setProperty('--kb-breath-active', s.ambientBreathing ? '1' : '0');
    root.setProperty('--kb-breath-duration', `${s.breathDuration}s`);

    // 打字强度
    root.setProperty('--kb-typing-intensity', s.typingIntensity.toFixed(2));

    // 音频振幅
    root.setProperty('--kb-audio-amplitude', s.audioAmplitude.toFixed(2));

    // 专注强度
    root.setProperty('--kb-focus-intensity', s.focusIntensity.toFixed(2));

    // 极光效果
    root.setProperty('--kb-aurora-active', s.auroraActive ? '1' : '0');
  }, [prefersReduced]);

  useEffect(() => {
    function tick() {
      syncCSS();
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [syncCSS]);

  // 滚动速度自动衰减：停止滚动后逐渐恢复
  useEffect(() => {
    if (state.scrollVelocity > 0) {
      if (velocityDecayRef.current) clearTimeout(velocityDecayRef.current);
      velocityDecayRef.current = setTimeout(() => {
        useAmbientStore.getState().setScrollVelocity(0);
      }, VELOCITY_DECAY_MS);
    }
    return () => {
      if (velocityDecayRef.current) clearTimeout(velocityDecayRef.current);
    };
  }, [state.scrollVelocity]);
}

/**
 * 全局鼠标位置追踪 Hook
 * 在 OceanEnvironment 或 App 级别调用一次
 */
export function useAmbientMouseTracker() {
  useEffect(() => {
    let lastX = 0.5;
    let lastY = 0.5;
    let rafId = 0;
    let pending = false;

    function onMouseMove(e: MouseEvent) {
      lastX = e.clientX / window.innerWidth;
      lastY = e.clientY / window.innerHeight;
      if (!pending) {
        pending = true;
        rafId = requestAnimationFrame(() => {
          useAmbientStore.getState().setMousePosition(lastX, lastY);
          pending = false;
        });
      }
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);
}

/**
 * 全局滚动速度检测 Hook
 * 监听 window scroll 事件，计算速度
 */
export function useAmbientScrollTracker() {
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let lastTime = performance.now();
    let rafId = 0;
    let pending = false;

    function onScroll() {
      if (pending) return;
      pending = true;
      rafId = requestAnimationFrame(() => {
        const now = performance.now();
        const dt = now - lastTime;
        if (dt > 0) {
          const dy = Math.abs(window.scrollY - lastScrollY);
          const velocity = (dy / dt) * 1000; // px/s
          useAmbientStore.getState().setScrollVelocity(velocity);
        }
        lastScrollY = window.scrollY;
        lastTime = now;
        pending = false;
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafId);
    };
  }, []);
}

/**
 * 页面可见性追踪 Hook
 * 标签页不可见时暂停所有动画
 * 同时设置 data-page-hidden 属性供全局 CSS 规则使用
 */
export function useAmbientVisibilityTracker() {
  useEffect(() => {
    function onVisibilityChange() {
      const visible = document.visibilityState === 'visible';
      useAmbientStore.getState().setPageVisible(visible);
      // 同步 data 属性到根元素，用于全局 CSS animation-play-state 控制
      document.documentElement.dataset.pageHidden = visible ? 'false' : 'true';
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    // 初始化
    const visible = document.visibilityState === 'visible';
    useAmbientStore.getState().setPageVisible(visible);
    document.documentElement.dataset.pageHidden = visible ? 'false' : 'true';
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);
}
