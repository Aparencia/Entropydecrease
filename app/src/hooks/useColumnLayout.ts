/**
 * useColumnLayout — 全站列布局装备（v0.15：可拖拽 + 宽度记忆 + 窄窗自动折叠）。
 *
 * @ai-context: 痛点——全站固定宽列（笔记页 240/320/180、会话页 320、知识页
 *              260/320、课堂页 320）在默认 960 窗宽下挤压正文区且不可调。
 *              本 hook 单列状态：宽度（localStorage 记忆 + min/max 夹取）、
 *              手动折叠（用户显式）与自动折叠（窗口窄于阈值）分离——用户手动
 *              状态优先于自动：窗口回宽后恢复用户选择（autoFolded 只做窄窗兜底）。
 *              折叠/宽度持久化 key：layout:col-width:{key} / layout:col-fold:{key}。
 */
import { useCallback, useEffect, useMemo, useState } from "react";

interface Options {
  /** 默认宽度（=现状固定值——迁移零视觉变化） */
  default: number;
  min: number;
  max: number;
  /** 窗口宽度低于该值 → 自动折叠（未设则不自动折叠） */
  autoFoldBelow?: number;
}

export interface ColumnLayout {
  /** 生效宽度（已夹取 min..max） */
  width: number;
  /** 生效折叠态（自动折叠或手动折叠任一成立） */
  folded: boolean;
  /** 用户手动折叠态（自动折叠兜底下的用户意图保留） */
  manuallyFolded: boolean;
  /** 拖拽手柄增量化（负数=收窄——列方向感知由调用方处理） */
  resizeBy: (delta: number) => void;
  resetWidth: () => void;
  setManualFolded: (v: boolean) => void;
  /** 立即展开（同时清自动/手动折叠态——窄窗下点击窄条仍可展开，resize 后按阈值重折） */
  expand: () => void;
}

const clamp = (w: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(w)));

function readNumber(key: string, fallback: number): number {
  // window 守卫（GroupSidebar 同款模式）——非浏览器环境（SSR/未来测试宿主）零崩溃
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(`layout:col-width:${key}`);
    return v != null ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(`layout:col-fold:${key}`);
    return v != null ? v === "1" : fallback;
  } catch {
    return fallback;
  }
}

function writeLayout(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式/配额满——记忆丢失可接受，不影响功能 */
  }
}

export function useColumnLayout(key: string, opts: Options): ColumnLayout {
  const [width, setWidthState] = useState<number>(() =>
    clamp(readNumber(key, opts.default), opts.min, opts.max),
  );
  const [manualFolded, setManualFolded] = useState<boolean>(() => readBool(key, false));
  const [autoFolded, setAutoFolded] = useState<boolean>(() =>
    opts.autoFoldBelow != null && typeof window !== "undefined" && window.innerWidth < opts.autoFoldBelow,
  );

  // 窄窗自动折叠：窗口 resize 驱动（页面整窗布局——window 事件即容器事件）
  useEffect(() => {
    if (opts.autoFoldBelow == null) return;
    const onResize = () => setAutoFolded(window.innerWidth < (opts.autoFoldBelow as number));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [opts.autoFoldBelow]);

  // 持久化（副作用与 state 分离——StrictMode 双调用安全）
  useEffect(() => { writeLayout(`layout:col-width:${key}`, String(width)); }, [key, width]);
  useEffect(() => { writeLayout(`layout:col-fold:${key}`, manualFolded ? "1" : "0"); }, [key, manualFolded]);

  const resizeBy = useCallback((delta: number) => {
    setWidthState((cur) => clamp(cur + delta, opts.min, opts.max));
  }, [opts.min, opts.max]);
  const resetWidth = useCallback(() => setWidthState(opts.default), [opts.default]);
  const expand = useCallback(() => {
    setAutoFolded(false);
    setManualFolded(false);
  }, []);

  return useMemo(() => ({
    width,
    folded: autoFolded || manualFolded,
    manuallyFolded: manualFolded,
    resizeBy,
    resetWidth,
    setManualFolded,
    expand,
  }), [width, autoFolded, manualFolded, resizeBy, resetWidth, expand]);
}
