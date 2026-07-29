// @ai-context
// 双世界主题切换器（深海意识 ⇄ 晨曦穹顶）。Dual-world theme toggle.
// Why: 用 useSyncExternalStore 判定水合完成，服务端渲染占位避免主题闪烁。
"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

/** 水合安全：服务端返回 false，客户端返回 true，避免闪烁与不匹配 */
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * 双世界主题切换器
 * 深海意识 (dark) ⇄ 晨曦穹顶 (light)
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  if (!mounted) return <div className="w-16 h-8" />;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "切换至晨曦穹顶模式" : "切换至深海意识模式"}
      title={isDark ? "当前：深海意识 · 点击进入晨曦穹顶" : "当前：晨曦穹顶 · 点击进入深海意识"}
      className="relative w-16 h-8 rounded-full border border-kb-border transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-kb-brand cursor-pointer"
      style={{ background: "var(--kb-bg-tertiary)" }}
    >
      {/* 滑块 */}
      <span
        className={`absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center text-xs transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isDark ? "translate-x-0" : "translate-x-8"
        }`}
        style={{
          background: isDark
            ? "linear-gradient(135deg, #6366F1, #22D3EE)"
            : "linear-gradient(135deg, #F59E0B, #FB923C)",
          boxShadow: isDark
            ? "0 0 12px rgba(34,211,238,0.5)"
            : "0 0 12px rgba(245,158,11,0.5)",
        }}
      >
        {isDark ? "🌊" : "🌅"}
      </span>
      {/* 背景装饰点 */}
      <span
        className={`absolute top-1/2 -translate-y-1/2 text-[8px] transition-opacity duration-300 ${
          isDark ? "right-2 opacity-60" : "right-2 opacity-0"
        }`}
      >
        ✦
      </span>
      <span
        className={`absolute top-1/2 -translate-y-1/2 text-[8px] transition-opacity duration-300 ${
          isDark ? "left-2 opacity-0" : "left-2 opacity-60"
        }`}
      >
        ☁
      </span>
    </button>
  );
}
